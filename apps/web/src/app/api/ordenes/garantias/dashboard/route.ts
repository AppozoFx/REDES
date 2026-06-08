import { NextResponse } from "next/server";

import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERM_VIEW = "ORDENES_GARANTIAS_VIEW";
const PERM_EDIT = "ORDENES_GARANTIAS_EDIT";

type DashboardRow = {
  id: string;
  ordenId: string;
  fechaGarantiaYmd: string;
  cliente: string;
  codigoCliente: string;
  cuadrilla: string;
  estado: string;
  coordinadorUid: string;
  coordinadorNombre: string;
  motivo: string;
  responsable: string;
  imputado: string;
  fechaInstalacionBase: string;
  diasDesdeInstalacion: number | null;
  recurrente: boolean;
  recurrenciaGrupo: string;
  recurrenciaCantidad: number;
};

function todayLimaYm() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function parseYm(ym: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || "").trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return { year, month };
}

function monthBounds(ym: string) {
  const parsed = parseYm(ym);
  if (!parsed) return null;
  const start = new Date(Date.UTC(parsed.year, parsed.month - 1, 1));
  const end = new Date(Date.UTC(parsed.year, parsed.month, 0));
  return {
    startYmd: formatUtcYmd(start),
    endYmd: formatUtcYmd(end),
  };
}

function formatUtcYmd(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function parseYmd(value: string) {
  return /^(\d{4})-(\d{2})-(\d{2})$/.test(String(value || "").trim()) ? String(value).trim() : "";
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

function isGarantia(x: any) {
  const txt = `${String(x?.tipo || "")} ${String(x?.tipoTraba || "")} ${String(x?.idenServi || "")} ${String(x?.tipoServicio || "")} ${String(x?.estado || "")}`.toUpperCase();
  return txt.includes("GARANTIA");
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

function normalizeMotivo(row: any) {
  const candidate =
    String(row?.motivoGarantia || "").trim() ||
    String(row?.casoGarantia || "").trim() ||
    String(row?.diagnosticoGarantia || "").trim() ||
    String(row?.motivoCancelacion || "").trim() ||
    String(row?.motivoFinalizacion || "").trim();
  return candidate || "Sin motivo";
}

function findBestInstalacionBase(related: any[], cliente: string, fechaGarantiaYmd: string) {
  let bestYmd = "";
  const clienteNorm = cliente.trim().toLowerCase();
  for (const item of related) {
    const sameClient = String(item?.cliente || "").trim().toLowerCase() === clienteNorm;
    const finalizada = String(item?.estado || "").trim().toUpperCase() === "FINALIZADA";
    const notGarantia = !isGarantia(item);
    const ymd = String(item?.fSoliYmd || "").trim();
    const beforeGarantia = !fechaGarantiaYmd || !ymd || ymd <= fechaGarantiaYmd;
    if (!sameClient || !finalizada || !notGarantia || !ymd || !beforeGarantia) continue;
    if (!bestYmd || ymd > bestYmd) bestYmd = ymd;
  }
  return bestYmd;
}

function avg(nums: number[]) {
  if (!nums.length) return 0;
  return Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1));
}

function pct(n: number, total: number) {
  if (!total) return 0;
  return Number(((n / total) * 100).toFixed(1));
}

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
    const ym = String(searchParams.get("ym") || todayLimaYm());
    const fallbackBounds = monthBounds(ym) || monthBounds(todayLimaYm());
    if (!fallbackBounds) return NextResponse.json({ ok: false, error: "INVALID_PERIOD" }, { status: 400 });

    const garantiaFrom = parseYmd(searchParams.get("garantiaFrom") || "") || fallbackBounds.startYmd;
    const garantiaTo = parseYmd(searchParams.get("garantiaTo") || "") || fallbackBounds.endYmd;
    const instFrom = parseYmd(searchParams.get("instFrom") || "");
    const instTo = parseYmd(searchParams.get("instTo") || "");
    const cuadrillaFilter = String(searchParams.get("cuadrilla") || "").trim();
    const coordinadorFilter = String(searchParams.get("coordinadorUid") || "").trim();

    const startYmd = garantiaFrom <= garantiaTo ? garantiaFrom : garantiaTo;
    const endYmd = garantiaFrom <= garantiaTo ? garantiaTo : garantiaFrom;

    // Extend query start to include the installation period even when garantíaFrom > instFrom
    // (needed to count instalacionesFinalizadas for the tasa calculation)
    const queryFrom = instFrom && instFrom < startYmd ? instFrom : startYmd;

    const snap = await adminDb()
      .collection("ordenes")
      .where("fSoliYmd", ">=", queryFrom)
      .where("fSoliYmd", "<=", endYmd)
      .orderBy("fSoliYmd", "asc")
      .limit(15000)
      .get();

    const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    // Filter garantías to the garantía date range (docs may span a wider range for denominator)
    const garantiaDocs = docs.filter((x) => {
      if (!isGarantia(x)) return false;
      const ymd = String(x.fSoliYmd || "").trim();
      return ymd >= startYmd && ymd <= endYmd;
    });

    const docsByCode = new Map<string, any[]>();
    for (const doc of docs) {
      const code = String(doc?.codiSeguiClien || "").trim();
      if (!code) continue;
      const bucket = docsByCode.get(code);
      if (bucket) bucket.push(doc);
      else docsByCode.set(code, [doc]);
    }

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

    const missingRelatedSnaps = await Promise.all(
      missingRelatedCodes.map((code) =>
        adminDb()
          .collection("ordenes")
          .where("codiSeguiClien", "==", code)
          .limit(300)
          .get()
      )
    );
    missingRelatedCodes.forEach((code, index) => {
      const existing = relatedByCode.get(code) || [];
      const fetched = missingRelatedSnaps[index].docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      const mergedById = new Map<string, any>();
      for (const item of existing) mergedById.set(String(item?.id || item?.ordenId || ""), item);
      for (const item of fetched) mergedById.set(String(item?.id || item?.ordenId || ""), item);
      relatedByCode.set(code, Array.from(mergedById.values()));
    });

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

    const rawItems: DashboardRow[] = garantiaDocs.map((x: any) => {
      const cliente = String(x.cliente || "").trim();
      const codigoCliente = String(x.codiSeguiClien || "").trim();
      const fechaGarantiaYmd = String(x.fSoliYmd || "").trim();

      let fechaInstalacionBase = String(x.fechaInstalacionBase || "").trim();
      let diasDesdeInstalacion = typeof x.diasDesdeInstalacion === "number" ? x.diasDesdeInstalacion : null;

      if ((!fechaInstalacionBase || diasDesdeInstalacion == null) && cliente && codigoCliente) {
        const related = relatedByCode.get(codigoCliente) || [];
        const bestYmd = findBestInstalacionBase(related, cliente, fechaGarantiaYmd);
        if (bestYmd) {
          fechaInstalacionBase = bestYmd;
          if (fechaGarantiaYmd) {
            const d1 = parseLimaYmd(fechaGarantiaYmd);
            const d0 = parseLimaYmd(bestYmd);
            if (!Number.isNaN(d1) && !Number.isNaN(d0)) {
              diasDesdeInstalacion = Math.max(0, Math.floor((d1 - d0) / (24 * 60 * 60 * 1000)));
            }
          }
        }
      }

      return {
        id: String(x.id || x.ordenId || ""),
        ordenId: String(x.ordenId || x.id || ""),
        fechaGarantiaYmd,
        cliente: String(x.cliente || ""),
        codigoCliente,
        cuadrilla: String(x.cuadrillaNombre || x.cuadrillaId || ""),
        estado: String(x.estado || ""),
        coordinadorUid: String(x.coordinadorCuadrilla || ""),
        coordinadorNombre: coordMap.get(String(x.coordinadorCuadrilla || "")) || String(x.coordinadorCuadrilla || "-"),
        motivo: normalizeMotivo(x),
        responsable: String(x.responsableGarantia || ""),
        imputado: String(x.imputadoGarantia || ""),
        fechaInstalacionBase,
        diasDesdeInstalacion,
        recurrente: false,
        recurrenciaGrupo: "",
        recurrenciaCantidad: 1,
      };
    });

    const optionsCuadrillas = Array.from(
      new Set(rawItems.map((item) => String(item.cuadrilla || "").trim()).filter(Boolean))
    )
      .map((label) => ({
        label,
        total: rawItems.filter((item) => String(item.cuadrilla || "").trim() === label).length,
      }))
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));

    const optionsCoordinadores = Array.from(
      new Map(
        rawItems
          .filter((item) => item.coordinadorUid)
          .map((item) => [item.coordinadorUid, item.coordinadorNombre] as const)
      ).entries()
    )
      .map(([uid, nombre]) => ({
        uid,
        nombre,
        total: rawItems.filter((item) => item.coordinadorUid === uid).length,
      }))
      .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));

    const items = rawItems.filter((item) => {
      if (instFrom && item.fechaInstalacionBase && item.fechaInstalacionBase < instFrom) return false;
      if (instTo && item.fechaInstalacionBase && item.fechaInstalacionBase > instTo) return false;
      if (instFrom && !item.fechaInstalacionBase) return false;
      if (instTo && !item.fechaInstalacionBase) return false;
      if (cuadrillaFilter && item.cuadrilla !== cuadrillaFilter) return false;
      if (coordinadorFilter && item.coordinadorUid !== coordinadorFilter) return false;
      return true;
    });

    const recurrenceGroups = new Map<string, number>();
    for (const item of items) {
      const key = item.codigoCliente || item.cliente.trim().toLowerCase() || item.ordenId || item.id;
      recurrenceGroups.set(key, (recurrenceGroups.get(key) || 0) + 1);
    }

    const enrichedItems = items.map((item) => {
      const key = item.codigoCliente || item.cliente.trim().toLowerCase() || item.ordenId || item.id;
      const count = recurrenceGroups.get(key) || 1;
      return {
        ...item,
        recurrente: count > 1,
        recurrenciaGrupo: key,
        recurrenciaCantidad: count,
      };
    });

    const byDayMap = new Map<
      string,
      { ymd: string; total: number; finalizadas: number; canceladas: number; recurrentes: number }
    >();
    const byEstadoMap = new Map<string, number>();
    const byCoordinadorMap = new Map<string, { uid: string; nombre: string; total: number; recurrentes: number }>();
    const byCuadrillaMap = new Map<
      string,
      {
        cuadrilla: string;
        total: number;
        recurrentes: number;
        finalizadas: number;
        canceladas: number;
        diasTotal: number;
        diasCount: number;
        motivos: Map<string, number>;
      }
    >();
    const byMotivoMap = new Map<string, { label: string; total: number; recurrentes: number }>();

    let finalizadas = 0;
    let canceladas = 0;
    let pendientes = 0;
    let recurrentes = 0;
    const diasList: number[] = [];
    const cuadrillaSet = new Set<string>();
    const coordinadorSet = new Set<string>();

    for (const item of enrichedItems) {
      const estadoNorm = normalizeEstado(item.estado);
      const day = byDayMap.get(item.fechaGarantiaYmd) || {
        ymd: item.fechaGarantiaYmd,
        total: 0,
        finalizadas: 0,
        canceladas: 0,
        recurrentes: 0,
      };
      day.total += 1;
      if (estadoNorm === "Finalizada") {
        day.finalizadas += 1;
        finalizadas += 1;
      } else if (estadoNorm === "Cancelada") {
        day.canceladas += 1;
        canceladas += 1;
      } else {
        pendientes += 1;
      }
      if (item.recurrente) {
        day.recurrentes += 1;
        recurrentes += 1;
      }
      byDayMap.set(item.fechaGarantiaYmd, day);
      byEstadoMap.set(estadoNorm, (byEstadoMap.get(estadoNorm) || 0) + 1);

      const coordKey = item.coordinadorUid || item.coordinadorNombre || "-";
      if (coordKey !== "-") coordinadorSet.add(coordKey);
      const coordinador = byCoordinadorMap.get(coordKey) || {
        uid: item.coordinadorUid || "",
        nombre: item.coordinadorNombre || "-",
        total: 0,
        recurrentes: 0,
      };
      coordinador.total += 1;
      if (item.recurrente) coordinador.recurrentes += 1;
      byCoordinadorMap.set(coordKey, coordinador);

      const cuadrillaKey = item.cuadrilla || "-";
      if (cuadrillaKey !== "-") cuadrillaSet.add(cuadrillaKey);
      const cuadrilla = byCuadrillaMap.get(cuadrillaKey) || {
        cuadrilla: cuadrillaKey,
        total: 0,
        recurrentes: 0,
        finalizadas: 0,
        canceladas: 0,
        diasTotal: 0,
        diasCount: 0,
        motivos: new Map<string, number>(),
      };
      cuadrilla.total += 1;
      if (item.recurrente) cuadrilla.recurrentes += 1;
      if (estadoNorm === "Finalizada") cuadrilla.finalizadas += 1;
      if (estadoNorm === "Cancelada") cuadrilla.canceladas += 1;
      if (typeof item.diasDesdeInstalacion === "number") {
        cuadrilla.diasTotal += item.diasDesdeInstalacion;
        cuadrilla.diasCount += 1;
        diasList.push(item.diasDesdeInstalacion);
      }
      cuadrilla.motivos.set(item.motivo, (cuadrilla.motivos.get(item.motivo) || 0) + 1);
      byCuadrillaMap.set(cuadrillaKey, cuadrilla);

      const motivoEntry = byMotivoMap.get(item.motivo) || { label: item.motivo, total: 0, recurrentes: 0 };
      motivoEntry.total += 1;
      if (item.recurrente) motivoEntry.recurrentes += 1;
      byMotivoMap.set(item.motivo, motivoEntry);
    }

    const byCuadrilla = Array.from(byCuadrillaMap.values())
      .map((item) => {
        const topMotivo =
          Array.from(item.motivos.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "Sin motivo";
        return {
          cuadrilla: item.cuadrilla,
          total: item.total,
          recurrentes: item.recurrentes,
          tasaReincidenciaPct: pct(item.recurrentes, item.total),
          finalizadas: item.finalizadas,
          canceladas: item.canceladas,
          diasPromedio: item.diasCount ? Number((item.diasTotal / item.diasCount).toFixed(1)) : 0,
          motivoPrincipal: topMotivo,
        };
      })
      .sort((a, b) => b.recurrentes - a.recurrentes || b.total - a.total || a.cuadrilla.localeCompare(b.cuadrilla));

    const byMotivo = Array.from(byMotivoMap.values())
      .map((item) => ({
        label: item.label,
        total: item.total,
        recurrentes: item.recurrentes,
        tasaReincidenciaPct: pct(item.recurrentes, item.total),
      }))
      .sort((a, b) => b.total - a.total || b.recurrentes - a.recurrentes)
      .slice(0, 10);

    const byCoordinador = Array.from(byCoordinadorMap.values())
      .map((item) => ({
        uid: item.uid,
        nombre: item.nombre,
        total: item.total,
        recurrentes: item.recurrentes,
        tasaReincidenciaPct: pct(item.recurrentes, item.total),
      }))
      .sort((a, b) => b.recurrentes - a.recurrentes || b.total - a.total || a.nombre.localeCompare(b.nombre))
      .slice(0, 10);

    const byEstado = Array.from(byEstadoMap.entries())
      .map(([estado, total]) => ({ estado, total }))
      .sort((a, b) => b.total - a.total);

    const recientes = [...enrichedItems]
      .sort((a, b) => {
        if (a.recurrente !== b.recurrente) return a.recurrente ? -1 : 1;
        const cmp = b.fechaGarantiaYmd.localeCompare(a.fechaGarantiaYmd);
        if (cmp !== 0) return cmp;
        return a.cliente.localeCompare(b.cliente);
      })
      .slice(0, 40);

    const recurrenteItems = enrichedItems.filter((item) => item.recurrente).length;
    const recurrenteCasos = Array.from(recurrenceGroups.values()).filter((count) => count > 1).length;

    // Instalaciones finalizadas en el periodo de instalación (denominador para tasa de garantía)
    const instalacionesFinalizadas = docs.filter((x) => {
      if (isGarantia(x)) return false;
      if (normalizeEstado(String(x.estado || "")) !== "Finalizada") return false;
      const ymd = String(x.fSoliYmd || "").trim();
      if (instFrom && ymd < instFrom) return false;
      if (instTo && ymd > instTo) return false;
      return true;
    }).length;
    const tasaGarantiaPct = pct(finalizadas, instalacionesFinalizadas);

    // Agregación mensual (para gráfico evolutivo)
    const byMonthMap = new Map<string, { ym: string; total: number; finalizadas: number; canceladas: number; recurrentes: number }>();
    for (const day of byDayMap.values()) {
      const ym = day.ymd.slice(0, 7);
      const e = byMonthMap.get(ym) || { ym, total: 0, finalizadas: 0, canceladas: 0, recurrentes: 0 };
      e.total += day.total;
      e.finalizadas += day.finalizadas;
      e.canceladas += day.canceladas;
      e.recurrentes += day.recurrentes;
      byMonthMap.set(ym, e);
    }
    const byMonth = Array.from(byMonthMap.values()).sort((a, b) => a.ym.localeCompare(b.ym));

    return NextResponse.json({
      ok: true,
      ym,
      filters: {
        garantiaFrom: startYmd,
        garantiaTo: endYmd,
        instFrom,
        instTo,
        cuadrilla: cuadrillaFilter,
        coordinadorUid: coordinadorFilter,
      },
      kpi: {
        total: enrichedItems.length,
        finalizadas,
        canceladas,
        pendientes,
        recurrentes: recurrenteItems,
        casosRecurrentes: recurrenteCasos,
        reincidenciaPct: pct(recurrenteItems, enrichedItems.length),
        diasPromedio: avg(diasList),
        cuadrillasAfectadas: cuadrillaSet.size,
        coordinadoresAfectados: coordinadorSet.size,
        instalacionesFinalizadas,
        tasaGarantiaPct,
      },
      series: {
        byDay: Array.from(byDayMap.values()).sort((a, b) => a.ymd.localeCompare(b.ymd)),
        byMonth,
        byEstado,
        byCoordinador,
        byCuadrilla,
        byMotivo,
      },
      options: {
        cuadrillas: optionsCuadrillas,
        coordinadores: optionsCoordinadores,
      },
      detail: {
        items: enrichedItems,
        recientes,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
