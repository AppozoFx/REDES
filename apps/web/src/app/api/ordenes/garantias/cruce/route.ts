import { NextResponse } from "next/server";

import { getServerSession } from "@/core/auth/session";
import {
  countByAttentionMonth,
  loadProviderRowsFromFirestore,
} from "@/core/garantias/cruceProveedor";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERM_VIEW = "ORDENES_GARANTIAS_VIEW";
const PERM_EDIT = "ORDENES_GARANTIAS_EDIT";
const POWER_BI_GARANTIAS_URL =
  "https://app.powerbi.com/view?r=eyJrIjoiNzNlNDg4YTQtZmQ5Yy00OGNlLTlhZDUtZDQxNjBhNGIyYTJlIiwidCI6ImZhY2I1NjA3LTBhNDMtNDQwOS1hY2MxLWIxZTI2OWZhZjdhOCIsImMiOjR9";

function defaultInstYm() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const t = m - 2;
  if (t <= 0) return `${y - 1}-${String(12 + t).padStart(2, "0")}`;
  return `${y}-${String(t).padStart(2, "0")}`;
}

type ProviderGarantia = {
  key: string;
  id: string;
  codPedido: string;
  nombre: string;
  fechaAtencionYmd: string;
  fechaInstalacionYmd: string;
  solucionado: string;
  partner: string;
  tipoCierre: string;
  cuadrilla: string;
  diasDesdeInstalacion: number | null;
  rowNumber: number;
};

type RedesGarantia = {
  id: string;
  ordenId: string;
  codigoCliente: string;
  cliente: string;
  fechaGarantiaYmd: string;
  fechaInstalacionBase: string;
  diasDesdeInstalacion: number | null;
  estado: string;
  finalizada: boolean;
  cuadrilla: string;
  motivo: string;
  coordinadorUid: string;
  coordinadorNombre: string;
  recurrente: boolean;
  horaInicio: string;
  horaFin: string;
  duracionMin: number | null;
};

type CruceRow = {
  status: "COINCIDE" | "COINCIDE_FECHA_DIFERENTE" | "PROVEEDOR_REDES_NO_FINALIZADA" | "SOLO_PROVEEDOR";
  statusLabel: string;
  exactFechaGarantia: boolean;
  exactFechaInstalacion: boolean;
  provider: ProviderGarantia;
  redes: RedesGarantia | null;
};

function parseYm(ym: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || "").trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return { year, month };
}

function formatUtcYmd(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function monthBounds(ym: string) {
  const parsed = parseYm(ym);
  if (!parsed) return null;
  const start = new Date(Date.UTC(parsed.year, parsed.month - 1, 1));
  const end = new Date(Date.UTC(parsed.year, parsed.month, 0));
  return {
    startYmd: formatUtcYmd(start),
    endYmd: formatUtcYmd(end),
    endDateUtc: end,
  };
}

function addUtcDays(date: Date, days: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function parseLimaYmd(ymd: string) {
  const parts = String(ymd || "").split("-");
  if (parts.length !== 3) return Number.NaN;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!y || !m || !d) return Number.NaN;
  return Date.UTC(y, m - 1, d, 5, 0, 0);
}

function diffDays(fromYmd: string, toYmd: string) {
  const from = parseLimaYmd(fromYmd);
  const to = parseLimaYmd(toYmd);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.floor((to - from) / (24 * 60 * 60 * 1000));
}

function normalizeText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeEstado(raw: string) {
  const s = String(raw || "").trim().toUpperCase();
  if (s.includes("FINAL")) return "Finalizada";
  if (s.includes("CANCEL")) return "Cancelada";
  if (s.includes("INIC") || s.includes("CAMINO")) return "En curso";
  if (s.includes("AGEN")) return "Agendada";
  if (s.includes("REPRO")) return "Reprogramada";
  return raw || "Sin estado";
}

function isFinalizada(raw: string) {
  return normalizeEstado(raw) === "Finalizada";
}

function isGarantia(x: any) {
  const txt = `${String(x?.tipo || "")} ${String(x?.tipoTraba || "")} ${String(x?.idenServi || "")} ${String(x?.tipoServicio || "")} ${String(x?.estado || "")}`.toUpperCase();
  return txt.includes("GARANTIA");
}

function normalizeMotivo(row: any) {
  const candidate =
    String(row?.motivoGarantia || "").trim() ||
    String(row?.casoGarantia || "").trim() ||
    String(row?.diagnosticoGarantia || "").trim() ||
    String(row?.motivoCancelacion || "").trim() ||
    String(row?.motivoFinalizacion || "").trim();
  return candidate || "Sin motivo";
}

function shortName(name: string) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  const first = parts[0];
  const firstLast = parts.length >= 4 ? parts[2] || "" : parts[1] || "";
  return `${first} ${firstLast}`.trim() || first;
}

function findBestInstalacionBase(related: any[], cliente: string, fechaGarantiaYmd: string) {
  let bestYmd = "";
  const clienteNorm = normalizeText(cliente);
  for (const item of related) {
    const sameClient = normalizeText(item?.cliente) === clienteNorm;
    const finalizada = isFinalizada(String(item?.estado || ""));
    const notGarantia = !isGarantia(item);
    const ymd = String(item?.fSoliYmd || "").trim();
    const beforeGarantia = !fechaGarantiaYmd || !ymd || ymd <= fechaGarantiaYmd;
    if (!sameClient || !finalizada || !notGarantia || !ymd || !beforeGarantia) continue;
    if (!bestYmd || ymd > bestYmd) bestYmd = ymd;
  }
  return bestYmd;
}

function calcDuracionMin(inicio: string, fin: string): number | null {
  const parseHm = (s: string) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(s || "").trim());
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  const a = parseHm(inicio);
  const b = parseHm(fin);
  if (a == null || b == null) return null;
  const diff = b - a;
  return diff >= 0 ? diff : null;
}

function pct(n: number, total: number) {
  if (!total) return 0;
  return Number(((n / total) * 100).toFixed(2));
}

function buildRedesGarantia(raw: any, relatedByCode: Map<string, any[]>, coordMap: Map<string, string>): RedesGarantia {
  const cliente = String(raw.cliente || "").trim();
  const codigoCliente = String(raw.codiSeguiClien || "").trim();
  const fechaGarantiaYmd = String(raw.fSoliYmd || "").trim();
  let fechaInstalacionBase = String(raw.fechaInstalacionBase || "").trim();
  let diasDesdeInstalacion = typeof raw.diasDesdeInstalacion === "number" ? raw.diasDesdeInstalacion : null;

  if ((!fechaInstalacionBase || diasDesdeInstalacion == null) && cliente && codigoCliente) {
    const related = relatedByCode.get(codigoCliente) || [];
    const bestYmd = findBestInstalacionBase(related, cliente, fechaGarantiaYmd);
    if (bestYmd) {
      fechaInstalacionBase = bestYmd;
      if (fechaGarantiaYmd) {
        const days = diffDays(bestYmd, fechaGarantiaYmd);
        if (days != null) diasDesdeInstalacion = Math.max(0, days);
      }
    }
  }

  const estado = String(raw.estado || "");
  const coordinadorUid = String(raw.coordinadorCuadrilla || "");
  const horaInicio = String(raw.fechaIniVisiHm || raw.horaInicio || "").trim();
  const horaFin = String(raw.fechaFinVisiHm || raw.horaFin || "").trim();
  return {
    id: String(raw.id || raw.ordenId || ""),
    ordenId: String(raw.ordenId || raw.id || ""),
    codigoCliente,
    cliente,
    fechaGarantiaYmd,
    fechaInstalacionBase,
    diasDesdeInstalacion,
    estado,
    finalizada: isFinalizada(estado),
    cuadrilla: String(raw.cuadrillaNombre || raw.cuadrillaId || ""),
    motivo: normalizeMotivo(raw),
    coordinadorUid,
    coordinadorNombre: coordMap.get(coordinadorUid) || coordinadorUid || "-",
    recurrente: false,
    horaInicio,
    horaFin,
    duracionMin: calcDuracionMin(horaInicio, horaFin),
  };
}

function scoreCandidate(provider: ProviderGarantia, redes: RedesGarantia) {
  let score = 0;
  if (provider.codPedido && provider.codPedido === redes.codigoCliente) score += 20;
  if (provider.fechaAtencionYmd && provider.fechaAtencionYmd === redes.fechaGarantiaYmd) score += 8;
  if (provider.fechaInstalacionYmd && provider.fechaInstalacionYmd === redes.fechaInstalacionBase) score += 6;
  if (redes.finalizada) score += 3;
  const pName = normalizeText(provider.nombre);
  const rName = normalizeText(redes.cliente);
  if (pName && rName && (pName === rName || pName.includes(rName) || rName.includes(pName))) score += 2;
  return score;
}

function findBestRedesMatch(provider: ProviderGarantia, redesItems: RedesGarantia[]) {
  const providerName = normalizeText(provider.nombre);
  const candidates = redesItems.filter((item) => {
    if (provider.codPedido && item.codigoCliente === provider.codPedido) return true;
    const redesName = normalizeText(item.cliente);
    return Boolean(providerName && redesName && providerName === redesName);
  });
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => scoreCandidate(provider, b) - scoreCandidate(provider, a))[0] || null;
}

function buildCruce(providerRows: ProviderGarantia[], redesItems: RedesGarantia[]) {
  const matchedRedesFinalizadas = new Set<string>();
  const cruceRows: CruceRow[] = providerRows.map((provider) => {
    const redes = findBestRedesMatch(provider, redesItems);
    if (!redes) {
      return {
        status: "SOLO_PROVEEDOR",
        statusLabel: "Solo WIN",
        exactFechaGarantia: false,
        exactFechaInstalacion: false,
        provider,
        redes: null,
      };
    }

    const exactFechaGarantia = provider.fechaAtencionYmd === redes.fechaGarantiaYmd;
    const exactFechaInstalacion = provider.fechaInstalacionYmd === redes.fechaInstalacionBase;
    if (redes.finalizada) matchedRedesFinalizadas.add(redes.id);

    if (!redes.finalizada) {
      return {
        status: "PROVEEDOR_REDES_NO_FINALIZADA",
        statusLabel: "WIN cuenta / REDES no finalizada",
        exactFechaGarantia,
        exactFechaInstalacion,
        provider,
        redes,
      };
    }

    const status = exactFechaGarantia && exactFechaInstalacion ? "COINCIDE" : "COINCIDE_FECHA_DIFERENTE";
    return {
      status,
      statusLabel: status === "COINCIDE" ? "Coincide" : "Coincide con fecha diferente",
      exactFechaGarantia,
      exactFechaInstalacion,
      provider,
      redes,
    };
  });

  const redesSolo = redesItems
    .filter((item) => item.finalizada)
    .filter((item) => !matchedRedesFinalizadas.has(item.id))
    .sort((a, b) => {
      const dateCmp = a.fechaGarantiaYmd.localeCompare(b.fechaGarantiaYmd);
      if (dateCmp !== 0) return dateCmp;
      return a.cliente.localeCompare(b.cliente);
    });

  return { cruceRows, redesSolo };
}

function countByDay(rows: ProviderGarantia[], redesFinalizadas: RedesGarantia[]) {
  const map = new Map<string, { ymd: string; proveedor: number; redes: number }>();
  for (const row of rows) {
    const ymd = row.fechaAtencionYmd || "Sin fecha";
    const entry = map.get(ymd) || { ymd, proveedor: 0, redes: 0 };
    entry.proveedor += 1;
    map.set(ymd, entry);
  }
  for (const row of redesFinalizadas) {
    const ymd = row.fechaGarantiaYmd || "Sin fecha";
    const entry = map.get(ymd) || { ymd, proveedor: 0, redes: 0 };
    entry.redes += 1;
    map.set(ymd, entry);
  }
  return Array.from(map.values()).sort((a, b) => a.ymd.localeCompare(b.ymd));
}

function countByCuadrilla(providerRows: ProviderGarantia[], redesFinalizadas: RedesGarantia[]) {
  const map = new Map<string, { cuadrilla: string; proveedor: number; redes: number; diferencia: number }>();
  for (const row of providerRows) {
    const key = row.cuadrilla || "-";
    const entry = map.get(key) || { cuadrilla: key, proveedor: 0, redes: 0, diferencia: 0 };
    entry.proveedor += 1;
    map.set(key, entry);
  }
  for (const row of redesFinalizadas) {
    const key = row.cuadrilla || "-";
    const entry = map.get(key) || { cuadrilla: key, proveedor: 0, redes: 0, diferencia: 0 };
    entry.redes += 1;
    map.set(key, entry);
  }
  return Array.from(map.values())
    .map((row) => ({ ...row, diferencia: row.proveedor - row.redes }))
    .sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia) || b.proveedor - a.proveedor)
    .slice(0, 20);
}

const ORDENES_SELECT = [
  "fSoliYmd", "estado", "tipo", "tipoTraba", "idenServi", "tipoServicio",
  "codiSeguiClien", "cliente", "ordenId", "cuadrillaNombre", "cuadrillaId",
  "coordinadorCuadrilla", "fechaInstalacionBase", "diasDesdeInstalacion",
  "motivoGarantia", "casoGarantia", "diagnosticoGarantia",
  "motivoCancelacion", "motivoFinalizacion",
  "fechaIniVisiHm", "horaInicio", "fechaFinVisiHm", "horaFin",
] as const;

function chunkArr<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const cruceCache = new Map<string, { json: any; ts: number }>();

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }

    const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
    const canEdit =
      session.isAdmin ||
      roles.includes("GERENCIA") ||
      roles.includes("SUPERVISOR") ||
      session.permissions.includes(PERM_EDIT);
    const canView = canEdit || session.permissions.includes(PERM_VIEW);
    if (!canView) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const instYm = String(searchParams.get("instYm") || defaultInstYm()).trim();
    const bounds = monthBounds(instYm);
    if (!bounds) return NextResponse.json({ ok: false, error: "INVALID_PERIOD" }, { status: 400 });

    // Caché por instYm — se invalida automáticamente tras 90 s
    const cached = cruceCache.get(instYm);
    if (cached && Date.now() - cached.ts < 90_000) {
      return NextResponse.json(cached.json);
    }

    const providerSource = await loadProviderRowsFromFirestore(instYm);
    if (!providerSource || !providerSource.rows.length) {
      return NextResponse.json({
        ok: true,
        noData: true,
        period: { instYm, instFrom: bounds.startYmd, instTo: bounds.endYmd },
      });
    }

    const providerRows = providerSource.rows;
    const garantiaTo = formatUtcYmd(addUtcDays(bounds.endDateUtc, 30));

    const snap = await adminDb()
      .collection("ordenes")
      .where("fSoliYmd", ">=", bounds.startYmd)
      .where("fSoliYmd", "<=", garantiaTo)
      .orderBy("fSoliYmd", "asc")
      .select(...ORDENES_SELECT)
      .limit(15000)
      .get();

    const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    const docsByCode = new Map<string, any[]>();
    for (const doc of docs) {
      const code = String(doc?.codiSeguiClien || "").trim();
      if (!code) continue;
      const bucket = docsByCode.get(code);
      if (bucket) bucket.push(doc);
      else docsByCode.set(code, [doc]);
    }

    const garantiaDocs = docs.filter((x) => isGarantia(x));
    const missingRelatedCodes = Array.from(
      new Set(
        garantiaDocs
          .filter((x) => {
            const cliente = String(x?.cliente || "").trim();
            const code = String(x?.codiSeguiClien || "").trim();
            const fechaGarantiaYmd = String(x?.fSoliYmd || "").trim();
            if (!cliente || !code) return false;
            const related = docsByCode.get(code) || [];
            return !findBestInstalacionBase(related, cliente, fechaGarantiaYmd);
          })
          .map((x) => String(x?.codiSeguiClien || "").trim())
          .filter(Boolean)
      )
    );

    const relatedByCode = new Map<string, any[]>();
    for (const [code, items] of docsByCode.entries()) relatedByCode.set(code, items);

    if (missingRelatedCodes.length > 0) {
      const missingSet = new Set(missingRelatedCodes);
      const batchSnaps = await Promise.all(
        chunkArr(missingRelatedCodes, 30).map((batch) =>
          adminDb()
            .collection("ordenes")
            .where("codiSeguiClien", "in", batch)
            .select(...ORDENES_SELECT)
            .limit(1500)
            .get()
        )
      );
      for (const batchSnap of batchSnaps) {
        for (const doc of batchSnap.docs) {
          const data = { id: doc.id, ...(doc.data() as any) };
          const code = String(data?.codiSeguiClien || "").trim();
          if (!code || !missingSet.has(code)) continue;
          const existing = relatedByCode.get(code) || [];
          const ids = new Set(existing.map((x: any) => String(x?.id || "")));
          if (!ids.has(data.id)) existing.push(data);
          relatedByCode.set(code, existing);
        }
      }
    }

    const coordUids = Array.from(new Set(garantiaDocs.map((x) => String(x.coordinadorCuadrilla || "")).filter(Boolean)));
    const coordRefs = coordUids.map((uid) => adminDb().collection("usuarios").doc(uid));
    const coordSnaps = coordUids.length ? await adminDb().getAll(...coordRefs) : [];
    const coordMap = new Map(
      coordSnaps.map((s) => {
        const d = s.data() as any;
        const full = `${String(d?.nombres || "").trim()} ${String(d?.apellidos || "").trim()}`.trim() || s.id;
        return [s.id, shortName(full)];
      })
    );

    const redesItemsRaw = garantiaDocs
      .map((item) => buildRedesGarantia(item, relatedByCode, coordMap))
      .filter((item) => item.fechaInstalacionBase.startsWith(instYm))
      .filter((item) => item.diasDesdeInstalacion == null || item.diasDesdeInstalacion <= 30);

    const recurrenceGroups = new Map<string, number>();
    for (const item of redesItemsRaw) {
      const key = item.codigoCliente || normalizeText(item.cliente) || item.ordenId || item.id;
      recurrenceGroups.set(key, (recurrenceGroups.get(key) || 0) + 1);
    }
    const redesItems = redesItemsRaw.map((item) => {
      const key = item.codigoCliente || normalizeText(item.cliente) || item.ordenId || item.id;
      return { ...item, recurrente: (recurrenceGroups.get(key) || 0) > 1 };
    });

    const redesFinalizadas = redesItems.filter((item) => item.finalizada);
    const instalacionesFinalizadas = docs.filter((x) => {
      if (isGarantia(x)) return false;
      if (!isFinalizada(String(x?.estado || ""))) return false;
      const ymd = String(x?.fSoliYmd || "").trim();
      return ymd >= bounds.startYmd && ymd <= bounds.endYmd;
    }).length;

    const { cruceRows, redesSolo } = buildCruce(providerRows, redesItems);
    const coincidenciasFinalizadas = cruceRows.filter((row) => row.redes?.finalizada).length;
    const proveedorRedesNoFinalizada = cruceRows.filter((row) => row.status === "PROVEEDOR_REDES_NO_FINALIZADA").length;
    const proveedorSinRedes = cruceRows.filter((row) => row.status === "SOLO_PROVEEDOR").length;

    const responseJson = {
      ok: true,
      period: {
        instYm,
        instFrom: bounds.startYmd,
        instTo: bounds.endYmd,
        garantiaFrom: bounds.startYmd,
        garantiaTo,
        windowDays: 30,
        workbookName: providerSource.source.fileName,
        workbookSheet: providerSource.source.sheetName,
        source: providerSource.source,
        powerBiUrl: POWER_BI_GARANTIAS_URL,
        powerBiPartner: "Partner 13",
      },
      kpi: {
        proveedorGarantias: providerRows.length,
        redesGarantiasFinalizadas: redesFinalizadas.length,
        redesGarantiasTotal: redesItems.length,
        instalacionesFinalizadas,
        proveedorTasaPct: pct(providerRows.length, instalacionesFinalizadas),
        redesTasaPct: pct(redesFinalizadas.length, instalacionesFinalizadas),
        brechaGarantias: providerRows.length - redesFinalizadas.length,
        brechaTasaPct: Number((pct(providerRows.length, instalacionesFinalizadas) - pct(redesFinalizadas.length, instalacionesFinalizadas)).toFixed(2)),
        coincidenciasFinalizadas,
        proveedorSinRedes,
        proveedorRedesNoFinalizada,
        redesSinProveedor: redesSolo.length,
      },
      series: {
        providerByAttentionMonth: countByAttentionMonth(providerRows),
        byDay: countByDay(providerRows, redesFinalizadas),
        byCuadrilla: countByCuadrilla(providerRows, redesFinalizadas),
      },
      detail: {
        cruce: cruceRows,
        redesSolo,
        providerRows,
        redesFinalizadas,
      },
    };

    cruceCache.set(instYm, { json: responseJson, ts: Date.now() });
    if (cruceCache.size > 20) {
      const oldest = [...cruceCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
      if (oldest) cruceCache.delete(oldest[0]);
    }

    return NextResponse.json(responseJson);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
