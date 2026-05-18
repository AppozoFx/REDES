import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";
import { resolveTramoNombre } from "@/domain/ordenes/tramo";

export const runtime = "nodejs";

const PERM_VIEW = "ORDENES_GARANTIAS_VIEW";
const PERM_EDIT = "ORDENES_GARANTIAS_EDIT";

type Row = {
  id: string;
  ordenId: string;
  fechaGarantiaYmd: string;
  cliente: string;
  codigoCliente: string;
  plan: string;
  direccion: string;
  cuadrilla: string;
  tipoServicio: string;
  tramo: string;
  estado: string;
  horaInicio: string;
  horaFin: string;
  motivoCancelacion: string;
  coordinadorUid: string;
  coordinadorNombre: string;
  motivoGarantia: string;
  diagnosticoGarantia: string;
  solucionGarantia: string;
  responsableGarantia: string;
  casoGarantia: string;
  imputadoGarantia: string;
  fechaInstalacionBase: string;
  diasDesdeInstalacion: number | null;
};

function todayLimaYm() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function daysInMonth(ym: string): string[] {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || "").trim());
  if (!m) return [];
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return [];

  const lastDay = new Date(year, month, 0).getDate();
  const out: string[] = [];
  for (let day = 1; day <= lastDay; day += 1) {
    out.push(
      `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    );
  }
  return out;
}

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

function addUtcDays(date: Date, days: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
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

function parseLimaYmd(ymd: string) {
  const parts = String(ymd || "").split("-");
  if (parts.length !== 3) return Number.NaN;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!y || !m || !d) return Number.NaN;
  return Date.UTC(y, m - 1, d, 5, 0, 0);
}

function isGarantia(x: any) {
  const txt = `${String(x?.tipo || "")} ${String(x?.tipoTraba || "")} ${String(x?.idenServi || "")} ${String(x?.tipoServicio || "")} ${String(x?.estado || "")}`.toUpperCase();
  return txt.includes("GARANTIA");
}

function findBestInstalacionBase(
  related: any[],
  cliente: string,
  fechaGarantiaYmd: string
) {
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
    const ym = String(searchParams.get("ym") || todayLimaYm()); // YYYY-MM
    const docsById = new Map<string, any>();
    const analysisMode = String(searchParams.get("analysisMode") || "garantia").trim().toLowerCase();
    const instYm = String(searchParams.get("instYm") || "").trim() || ym;

    if (analysisMode === "instalacion") {
      const bounds = monthBounds(instYm);
      if (!bounds) {
        return NextResponse.json({ ok: false, error: "INVALID_INSTALLATION_MONTH" }, { status: 400 });
      }
      const todayYmd = todayLimaYmd();
      const maxGarantiaYmd = formatUtcYmd(addUtcDays(bounds.endDateUtc, 30));
      const fetchEndYmd = todayYmd < maxGarantiaYmd ? todayYmd : maxGarantiaYmd;
      const snap = await adminDb()
        .collection("ordenes")
        .where("fSoliYmd", ">=", bounds.startYmd)
        .where("fSoliYmd", "<=", fetchEndYmd)
        .orderBy("fSoliYmd")
        .limit(12000)
        .get();
      for (const d of snap.docs) {
        docsById.set(d.id, { id: d.id, ...(d.data() as any) });
      }
    } else {
      const ymds = daysInMonth(ym);
      const dailySnaps = await Promise.all(
        ymds.map((ymd) =>
          adminDb()
            .collection("ordenes")
            .where("fSoliYmd", "==", ymd)
            .limit(3000)
            .get()
        )
      );
      for (const snap of dailySnaps) {
        for (const d of snap.docs) {
          docsById.set(d.id, { id: d.id, ...(d.data() as any) });
        }
      }
    }
    const docs = Array.from(docsById.values());
    const onlyGarantias = docs.filter((x) => isGarantia(x));
    const finalizadasSinGarantia = docs.filter((x) => !isGarantia(x) && String(x?.estado || "").trim().toUpperCase() === "FINALIZADA").length;

    const monthDocsByCode = new Map<string, any[]>();
    for (const doc of docs) {
      const code = String(doc?.codiSeguiClien || "").trim();
      if (!code) continue;
      const bucket = monthDocsByCode.get(code);
      if (bucket) bucket.push(doc);
      else monthDocsByCode.set(code, [doc]);
    }

    const missingRelatedCodes = Array.from(
      new Set(
        onlyGarantias
          .filter((x) => {
            const cliente = String(x?.cliente || "").trim();
            const code = String(x?.codiSeguiClien || "").trim();
            const fechaGarantiaYmd = String(x?.fSoliYmd || "").trim();
            if (!cliente || !code) return false;
            const monthRelated = monthDocsByCode.get(code) || [];
            return !findBestInstalacionBase(monthRelated, cliente, fechaGarantiaYmd);
          })
          .map((x) => String(x?.codiSeguiClien || "").trim())
          .filter(Boolean)
      )
    );

    const relatedByCode = new Map<string, any[]>();
    for (const [code, items] of monthDocsByCode.entries()) {
      relatedByCode.set(code, items);
    }

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

    const coordUids = Array.from(new Set(onlyGarantias.map((x) => String(x.coordinadorCuadrilla || "")).filter(Boolean)));
    const coordRefs = coordUids.map((uid) => adminDb().collection("usuarios").doc(uid));
    const coordSnaps = coordUids.length ? await adminDb().getAll(...coordRefs) : [];
    const coordMap = new Map(
      coordSnaps.map((s) => {
        const d = s.data() as any;
        const full = `${String(d?.nombres || "").trim()} ${String(d?.apellidos || "").trim()}`.trim() || s.id;
        return [s.id, shortName(full)];
      })
    );

    let items: Row[] = onlyGarantias.map((x: any) => {
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
        plan: String(x.idenServi || ""),
        direccion: String(x.direccion || x.direccion1 || ""),
        cuadrilla: String(x.cuadrillaNombre || x.cuadrillaId || ""),
        tipoServicio: String(x.tipoTraba || x.tipoOrden || ""),
        tramo: resolveTramoNombre(String(x.fSoliHm || ""), String(x.fechaFinVisiHm || "")),
        estado: String(x.estado || ""),
        horaInicio: String(x.fechaIniVisiHm || x.horaInicio || ""),
        horaFin: String(x.fechaFinVisiHm || x.horaFin || ""),
        motivoCancelacion: String(x.motivoCancelacion || ""),
        coordinadorUid: String(x.coordinadorCuadrilla || ""),
        coordinadorNombre: coordMap.get(String(x.coordinadorCuadrilla || "")) || String(x.coordinadorCuadrilla || "-"),
        motivoGarantia: String(x.motivoGarantia || ""),
        diagnosticoGarantia: String(x.diagnosticoGarantia || ""),
        solucionGarantia: String(x.solucionGarantia || ""),
        responsableGarantia: String(x.responsableGarantia || ""),
        casoGarantia: String(x.casoGarantia || ""),
        imputadoGarantia: String(x.imputadoGarantia || ""),
        fechaInstalacionBase,
        diasDesdeInstalacion,
      };
    });

    if (analysisMode === "instalacion") {
      items = items.filter((item) => String(item.fechaInstalacionBase || "").slice(0, 7) === instYm);
    }

    const coordinadores = Array.from(new Map(items.filter((i) => i.coordinadorUid).map((i) => [i.coordinadorUid, i.coordinadorNombre])))
      .map(([uid, nombre]) => ({ uid, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    return NextResponse.json({
      ok: true,
      ym,
      analysisMode,
      instYm,
      canEdit,
      items,
      options: { coordinadores },
      stats: { finalizadasSinGarantia },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
