import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";
import { FieldPath } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Mode = "day" | "week" | "month" | "range";

type DetailItem = {
  id: string;
  ymd: string;
  hm: string;
  ordenId: string;
  codiSeguiClien: string;
  cliente: string;
  cuadrillaId: string;
  cuadrillaNombre: string;
  estado: string;
  tipoOrden: string;
  tipoTraba: string;
  gestorUid: string;
  gestorNombre: string;
  coordinadorUid: string;
  coordinadorNombre: string;
  regionOrden: string;
  distritoOrden: string;
  lat: number | null;
  lng: number | null;
  liquidado: boolean;
  correccionPendiente: boolean;
  liquidacionAt: string | null;
};

type Kpi = {
  total: number;
  finalizadas: number;
  agendadas: number;
  iniciadas: number;
  pendientes: number;
  efectividadPct: number;
  liquidadas: number;
  pendientesLiquidar: number;
  correccionPendiente: number;
};

type CachedDataset = {
  createdAt: number;
  enriched: DetailItem[];
  enrichedPrev: DetailItem[];
};

const DATASET_CACHE_TTL_MS = 5 * 60 * 1000;
const DATASET_CACHE_MAX_ENTRIES = 6;
const datasetCache = new Map<string, CachedDataset>();

function norm(v: any) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function todayLimaYm() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function dateFromYmd(ymd: string) {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function ymdFromDate(d: Date) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(ymd: string, days: number) {
  const d = dateFromYmd(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return ymdFromDate(d);
}

function monthStart(ym: string) {
  return `${ym}-01`;
}

function monthEndExclusive(ym: string) {
  const [y, m] = ym.split("-").map((x) => Number(x));
  const d = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  return ymdFromDate(d);
}

function mondayOfWeek(ymd: string) {
  const d = dateFromYmd(ymd);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return ymdFromDate(d);
}

function normalizeOrderState(raw: string): "AGENDADA" | "INICIADA" | "FINALIZADA" | "OTROS" {
  const s = String(raw || "").trim().toUpperCase();
  if (s.includes("FINAL")) return "FINALIZADA";
  if (s.includes("INIC")) return "INICIADA";
  if (s.includes("CAMINO")) return "INICIADA";
  if (s.includes("AGEN")) return "AGENDADA";
  return "OTROS";
}

function isCancelledState(raw: string) {
  const s = String(raw || "").toUpperCase();
  return s.includes("CANCEL") || s.includes("ANUL");
}

function toIso(v: any): string | null {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate().toISOString();
  if (typeof v?.seconds === "number") return new Date(v.seconds * 1000).toISOString();
  if (typeof v?._seconds === "number") return new Date(v._seconds * 1000).toISOString();
  if (typeof v === "string") return v;
  return null;
}

function parseIntSafe(v: any, fallback = 1) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
}

function isGarantia(raw: string) {
  return String(raw || "").toUpperCase().includes("GARANTIA");
}

function parseCoord(v: any): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (Math.abs(n) > 180) return null;
  return n;
}

function parseGeoRaw(raw: any): { lat: number | null; lng: number | null } {
  const s = String(raw || "").trim();
  if (!s.includes(",")) return { lat: null, lng: null };
  const [a, b] = s.split(",").map((x) => parseCoord(x));
  return { lat: a, lng: b };
}

function normalizeTipoOrden(raw: any): string {
  return String(raw || "").trim().toUpperCase();
}

function diffDaysExclusive(fromYmd: string, toYmdExclusive: string) {
  const from = dateFromYmd(fromYmd).getTime();
  const to = dateFromYmd(toYmdExclusive).getTime();
  return Math.max(1, Math.round((to - from) / 86400000));
}

function computeKpi(rows: DetailItem[]): Kpi {
  const total = rows.length;
  const finalizadas = rows.filter((x) => normalizeOrderState(x.estado) === "FINALIZADA").length;
  const agendadas = rows.filter((x) => normalizeOrderState(x.estado) === "AGENDADA").length;
  const iniciadas = rows.filter((x) => normalizeOrderState(x.estado) === "INICIADA").length;
  const pendientes = agendadas + iniciadas;
  const finalizadasRows = rows.filter((x) => normalizeOrderState(x.estado) === "FINALIZADA");
  const liquidadas = finalizadasRows.filter((x) => x.liquidado).length;
  const pendientesLiquidar = finalizadasRows.filter((x) => !x.liquidado).length;
  const correccionPendiente = rows.filter((x) => x.correccionPendiente).length;
  const efectividadPct = total > 0 ? Number(((finalizadas / total) * 100).toFixed(2)) : 0;
  return {
    total,
    finalizadas,
    agendadas,
    iniciadas,
    pendientes,
    efectividadPct,
    liquidadas,
    pendientesLiquidar,
    correccionPendiente,
  };
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function getCachedDataset(key: string): CachedDataset | null {
  const entry = datasetCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > DATASET_CACHE_TTL_MS) {
    datasetCache.delete(key);
    return null;
  }
  return entry;
}

function pruneDatasetCache() {
  if (datasetCache.size <= DATASET_CACHE_MAX_ENTRIES) return;
  const ordered = Array.from(datasetCache.entries()).sort((a, b) => a[1].createdAt - b[1].createdAt);
  while (ordered.length > DATASET_CACHE_MAX_ENTRIES) {
    const [oldestKey] = ordered.shift()!;
    datasetCache.delete(oldestKey);
  }
}

function setCachedDataset(key: string, value: Omit<CachedDataset, "createdAt">) {
  datasetCache.set(key, { ...value, createdAt: Date.now() });
  pruneDatasetCache();
}

async function fetchAllOrdenesByRange(fromYmd: string, toYmdExclusive: string) {
  const db = adminDb();
  const out: any[] = [];
  let last: any = null;
  const pageSize = 2000;

  while (true) {
    let q = db
      .collection("ordenes")
      .where("fSoliYmd", ">=", fromYmd)
      .where("fSoliYmd", "<", toYmdExclusive)
      .orderBy("fSoliYmd", "asc")
      .orderBy(FieldPath.documentId(), "asc")
      .limit(pageSize);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    out.push(...snap.docs);
    last = snap.docs[snap.docs.length - 1];
  }

  return out;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    const canUse =
      session.isAdmin ||
      session.permissions.includes("ORDENES_LIQUIDAR") ||
      (session.access.areas || []).includes("INSTALACIONES");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const mode = (String(searchParams.get("mode") || "month").toLowerCase() as Mode);
    const ymd = String(searchParams.get("ymd") || todayLimaYmd());
    const ym = String(searchParams.get("ym") || todayLimaYm());
    const fromInput = String(searchParams.get("from") || "");
    const toInput = String(searchParams.get("to") || "");

    const page = parseIntSafe(searchParams.get("page"), 1);
    const pageSize = Math.min(500, parseIntSafe(searchParams.get("pageSize"), 50));

    const fCuadrilla = String(searchParams.get("cuadrilla") || searchParams.get("cuadrillaId") || "").trim();
    const fSearch = String(searchParams.get("q") || "").trim();
    const fRegionOrden = String(searchParams.get("regionOrden") || "").trim();
    const fDistritoOrden = String(searchParams.get("distritoOrden") || "").trim();
    const fGestorUid = String(searchParams.get("gestorUid") || "").trim();
    const fCoordinadorUid = String(searchParams.get("coordinadorUid") || "").trim();
    const fEstado = String(searchParams.get("estado") || "").trim().toUpperCase();
    const fTipoOrden = String(searchParams.get("tipoOrden") || "").trim().toUpperCase();
    const soloNoLiquidadas = String(searchParams.get("soloNoLiquidadas") || "0") === "1";

    let fromYmd = ymd;
    let toYmdExclusive = addDays(ymd, 1);
    if (mode === "month") {
      fromYmd = monthStart(ym);
      toYmdExclusive = monthEndExclusive(ym);
    } else if (mode === "week") {
      fromYmd = mondayOfWeek(ymd);
      toYmdExclusive = addDays(fromYmd, 7);
    } else if (mode === "range") {
      fromYmd = fromInput || ymd;
      toYmdExclusive = addDays(toInput || fromYmd, 1);
    }
    const toYmdInclusive = addDays(toYmdExclusive, -1);
    const periodLabel = `${fromYmd} - ${toYmdInclusive}`;
    let prevFromYmd = addDays(fromYmd, -1);
    let prevToYmdExclusive = fromYmd;
    if (mode === "week") {
      prevFromYmd = addDays(fromYmd, -7);
      prevToYmdExclusive = fromYmd;
    } else if (mode === "month") {
      const [cy, cm] = fromYmd.split("-").map((x) => Number(x));
      const prevDate = new Date(Date.UTC(cy, cm - 2, 1, 0, 0, 0, 0));
      const py = prevDate.getUTCFullYear();
      const pm = String(prevDate.getUTCMonth() + 1).padStart(2, "0");
      const prevYm = `${py}-${pm}`;
      prevFromYmd = monthStart(prevYm);
      prevToYmdExclusive = monthEndExclusive(prevYm);
    } else if (mode === "range") {
      const len = diffDaysExclusive(fromYmd, toYmdExclusive);
      prevToYmdExclusive = fromYmd;
      prevFromYmd = addDays(fromYmd, -len);
    }
    const prevToYmdInclusive = addDays(prevToYmdExclusive, -1);
    const periodPrevLabel = `${prevFromYmd} - ${prevToYmdInclusive}`;

    const datasetCacheKey = `${fromYmd}|${toYmdExclusive}|${prevFromYmd}|${prevToYmdExclusive}`;
    let cached = getCachedDataset(datasetCacheKey);
    let enriched: DetailItem[] = [];
    let enrichedPrev: DetailItem[] = [];

    if (cached) {
      enriched = cached.enriched;
      enrichedPrev = cached.enrichedPrev;
    } else {
      const [orderDocs, prevOrderDocs] = await Promise.all([
        fetchAllOrdenesByRange(fromYmd, toYmdExclusive),
        fetchAllOrdenesByRange(prevFromYmd, prevToYmdExclusive),
      ]);
      const toBase = (docs: any[]) => docs.map((d) => {
        const x = d.data() as any;
        const codigo = String(x?.codiSeguiClien || "").trim();
        const tipoMix = `${x?.tipo || ""} ${x?.tipoTraba || ""} ${x?.idenServi || ""} ${x?.estado || ""}`;
        return {
          id: d.id,
          ymd: String(x?.fSoliYmd || x?.fechaFinVisiYmd || "").trim(),
          hm: String(x?.fechaFinVisiHm || x?.fSoliHm || "").trim(),
          ordenId: String(x?.ordenId || d.id).trim(),
          codiSeguiClien: codigo,
          cliente: String(x?.cliente || "").trim(),
          cuadrillaId: String(x?.cuadrillaId || "").trim(),
          cuadrillaNombre: String(x?.cuadrillaNombre || "").trim(),
          regionOrden: String(x?.region || x?.regionNombre || "").trim(),
          distritoOrden: String(x?.zonaDistrito || x?.distrito || "").trim(),
          estado: String(x?.estado || "").trim().toUpperCase(),
          tipoOrden: String(x?.tipoOrden || x?.tipo || "").trim().toUpperCase(),
          tipoTraba: String(x?.tipoTraba || "").trim(),
          gestorUid: String(x?.gestorCuadrilla || "").trim(),
          coordinadorUid: String(x?.coordinadorCuadrilla || x?.coordinador || "").trim(),
          lat: parseCoord(x?.lat),
          lng: parseCoord(x?.lng),
          georeferenciaRaw: String(x?.georeferenciaRaw || "").trim(),
          isGarantia: isGarantia(tipoMix),
        };
      });
      const base = toBase(orderDocs);
      const basePrev = toBase(prevOrderDocs);

      const codigos = Array.from(new Set([...base, ...basePrev].map((x) => x.codiSeguiClien).filter(Boolean)));
      const instMap = new Map<string, any>();
      const codigoChunks = chunkArray(codigos, 400);
      const instChunkSnaps = await Promise.all(
        codigoChunks.map((chunk) => {
          const refs = chunk.map((c) => adminDb().collection("instalaciones").doc(c));
          return adminDb().getAll(...refs);
        })
      );
      for (const snaps of instChunkSnaps) {
        for (const s of snaps) {
          if (s.exists) instMap.set(s.id, s.data() || {});
        }
      }

      const uidSet = new Set<string>();
      [...base, ...basePrev].forEach((x) => {
        if (x.gestorUid) uidSet.add(x.gestorUid);
        if (x.coordinadorUid) uidSet.add(x.coordinadorUid);
      });
      const uids = Array.from(uidSet);
      const uidName = new Map<string, string>();
      const uidChunks = chunkArray(uids, 400);
      const uidChunkSnaps = await Promise.all(
        uidChunks.map((chunk) => {
          const refs = chunk.map((uid) => adminDb().collection("usuarios").doc(uid));
          return adminDb().getAll(...refs);
        })
      );
      for (const snaps of uidChunkSnaps) {
        snaps.forEach((s) => {
          const data = (s.data() as any) || {};
          const full = String(data.displayName || `${data.nombres || ""} ${data.apellidos || ""}`.trim() || s.id);
          uidName.set(s.id, full);
        });
      }

      const toEnriched = (rows: any[]): DetailItem[] =>
        rows
        .filter((x) => !x.isGarantia)
        .map((x) => {
          const inst = x.codiSeguiClien ? instMap.get(x.codiSeguiClien) : null;
          const tipoOrdenFromInst = normalizeTipoOrden(inst?.orden?.tipoOrden || inst?.tipoOrden);
          const tipoOrdenResolved = tipoOrdenFromInst || normalizeTipoOrden(x.tipoOrden);
          const liqEstado = String(inst?.liquidacion?.estado || "").toUpperCase();
          const liqAt = toIso(inst?.liquidacion?.at);
          const correccionPendiente = !!(inst?.correccionPendiente || inst?.corregido);
          const liquidado = (liqEstado === "LIQUIDADO" || !!liqAt) && !correccionPendiente;
          const geoRaw = parseGeoRaw((x as any).georeferenciaRaw);
          const lat = parseCoord((x as any).lat) ?? geoRaw.lat;
          const lng = parseCoord((x as any).lng) ?? geoRaw.lng;
          return {
            id: x.id,
            ymd: x.ymd,
            hm: x.hm,
            ordenId: x.ordenId,
            codiSeguiClien: x.codiSeguiClien,
            cliente: x.cliente,
            cuadrillaId: x.cuadrillaId,
            cuadrillaNombre: x.cuadrillaNombre,
            estado: x.estado,
            tipoOrden: tipoOrdenResolved,
            tipoTraba: x.tipoTraba,
            gestorUid: x.gestorUid,
            gestorNombre: x.gestorUid ? uidName.get(x.gestorUid) || x.gestorUid : "",
            coordinadorUid: x.coordinadorUid,
            coordinadorNombre: x.coordinadorUid ? uidName.get(x.coordinadorUid) || x.coordinadorUid : "",
            regionOrden: x.regionOrden,
            distritoOrden: x.distritoOrden,
            lat,
            lng,
            liquidado,
            correccionPendiente,
            liquidacionAt: liqAt,
          };
        });
      enriched = toEnriched(base);
      enrichedPrev = toEnriched(basePrev);
      setCachedDataset(datasetCacheKey, { enriched, enrichedPrev });
    }

    const matchesFilters = (x: DetailItem, includeDistrito: boolean) => {
      if (fSearch) {
        const hay = `${x.ordenId || ""} ${x.codiSeguiClien || ""} ${x.cliente || ""} ${x.cuadrillaNombre || ""} ${x.cuadrillaId || ""}`;
        if (!norm(hay).includes(norm(fSearch))) return false;
      }
      if (fCuadrilla) {
        const cuadrillaFull = `${x.cuadrillaNombre || ""} ${x.cuadrillaId || ""}`;
        if (!norm(cuadrillaFull).includes(norm(fCuadrilla))) return false;
      }
      if (fRegionOrden && norm(x.regionOrden) !== norm(fRegionOrden)) return false;
      if (includeDistrito && fDistritoOrden && norm(x.distritoOrden) !== norm(fDistritoOrden)) return false;
      if (fGestorUid && x.gestorUid !== fGestorUid) return false;
      if (fCoordinadorUid && x.coordinadorUid !== fCoordinadorUid) return false;
      if (fEstado && x.estado !== fEstado) return false;
      if (fTipoOrden && x.tipoOrden !== fTipoOrden) return false;
      if (soloNoLiquidadas && x.liquidado) return false;
      return true;
    };
    const filtered = enriched.filter((x) => matchesFilters(x, true));
    const filteredPrev = enrichedPrev.filter((x) => matchesFilters(x, true));
    const kpi = computeKpi(filtered);
    const kpiPrev = computeKpi(filteredPrev);

    const byDayMap = new Map<string, { total: number; finalizadas: number; liquidadas: number }>();
    filtered.forEach((x) => {
      const cur = byDayMap.get(x.ymd) || { total: 0, finalizadas: 0, liquidadas: 0 };
      cur.total += 1;
      if (normalizeOrderState(x.estado) === "FINALIZADA") cur.finalizadas += 1;
      if (x.liquidado) cur.liquidadas += 1;
      byDayMap.set(x.ymd, cur);
    });
    const byDay = Array.from(byDayMap.entries())
      .map(([ymdKey, v]) => ({ ymd: ymdKey, ...v }))
      .sort((a, b) => a.ymd.localeCompare(b.ymd));

    const byCuad = new Map<string, { cuadrillaId: string; cuadrillaNombre: string; agendada: number; iniciada: number; finalizada: number; canceladas: number }>();
    filtered.forEach((x) => {
      const key = x.cuadrillaId || x.cuadrillaNombre || "-";
      const cur = byCuad.get(key) || {
        cuadrillaId: x.cuadrillaId || "",
        cuadrillaNombre: x.cuadrillaNombre || "-",
        agendada: 0,
        iniciada: 0,
        finalizada: 0,
        canceladas: 0,
      };
      const st = normalizeOrderState(x.estado);
      if (st === "AGENDADA") cur.agendada += 1;
      else if (st === "INICIADA") cur.iniciada += 1;
      else if (st === "FINALIZADA") cur.finalizada += 1;
      if (isCancelledState(x.estado)) cur.canceladas += 1;
      byCuad.set(key, cur);
    });
    const byCuadrillaEstado = Array.from(byCuad.values()).sort((a, b) => {
      const ta = a.finalizada + a.iniciada + a.agendada;
      const tb = b.finalizada + b.iniciada + b.agendada;
      return tb - ta;
    });

    const topCuadrillasFinalizadas = byCuadrillaEstado
      .filter((x) => x.finalizada > 0)
      .sort((a, b) => b.finalizada - a.finalizada)
      .slice(0, 10)
      .map((x) => ({ cuadrillaId: x.cuadrillaId, cuadrillaNombre: x.cuadrillaNombre, finalizadas: x.finalizada }));

    const byTipoMap = new Map<string, number>();
    filtered.forEach((x) => {
      const k = x.tipoOrden || "SIN_TIPO";
      byTipoMap.set(k, (byTipoMap.get(k) || 0) + 1);
    });
    const byTipoOrden = Array.from(byTipoMap.entries())
      .map(([tipoOrden, totalVal]) => ({ tipoOrden, total: totalVal }))
      .sort((a, b) => b.total - a.total);
    const byRegionDistritoMap = new Map<string, { regionOrden: string; distritoOrden: string; totalFinalizadas: number; label: string }>();
    filtered.forEach((x) => {
      if (normalizeOrderState(x.estado) !== "FINALIZADA") return;
      const region = String(x.regionOrden || "").trim();
      const distrito = String(x.distritoOrden || "").trim();
      const key = `${region}::${distrito}`;
      const label = distrito ? `${region || "SIN REGION"} / ${distrito}` : region || "SIN REGION";
      const cur = byRegionDistritoMap.get(key) || {
        regionOrden: region,
        distritoOrden: distrito,
        totalFinalizadas: 0,
        label,
      };
      cur.totalFinalizadas += 1;
      byRegionDistritoMap.set(key, cur);
    });
    const byRegionDistritoFinalizadas = Array.from(byRegionDistritoMap.values()).sort((a, b) => b.totalFinalizadas - a.totalFinalizadas);
    const finalizadasMap = filtered
      .filter((x) => normalizeOrderState(x.estado) === "FINALIZADA" && Number.isFinite(x.lat) && Number.isFinite(x.lng))
      .slice(0, 1200)
      .map((x) => ({
        id: x.id,
        lat: Number(x.lat),
        lng: Number(x.lng),
        cliente: x.cliente || x.codiSeguiClien || x.ordenId,
        cuadrilla: x.cuadrillaNombre || x.cuadrillaId || "-",
        regionOrden: x.regionOrden || "",
        distritoOrden: x.distritoOrden || "",
        ymd: x.ymd,
      }));

    const gestoresMeta = Array.from(
      new Map(
        enriched
          .filter((x) => x.gestorUid)
          .map((x) => [x.gestorUid, { uid: x.gestorUid, nombre: x.gestorNombre || x.gestorUid }])
      ).values()
    ).sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));

    const coordinadoresMeta = Array.from(
      new Map(
        enriched
          .filter((x) => x.coordinadorUid)
          .map((x) => [x.coordinadorUid, { uid: x.coordinadorUid, nombre: x.coordinadorNombre || x.coordinadorUid }])
      ).values()
    ).sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));

    const cuadrillasMeta = Array.from(
      new Map(
        enriched
          .filter((x) => x.cuadrillaId || x.cuadrillaNombre)
          .map((x) => [x.cuadrillaId || x.cuadrillaNombre, { id: x.cuadrillaId || x.cuadrillaNombre, nombre: x.cuadrillaNombre || x.cuadrillaId }])
      ).values()
    ).sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));

    const tiposOrdenMeta = Array.from(new Set(enriched.map((x) => x.tipoOrden).filter(Boolean))).sort();
    const estadosMeta = Array.from(new Set(enriched.map((x) => x.estado).filter(Boolean))).sort();
    const regionesOrdenesMeta = Array.from(new Set(enriched.map((x) => x.regionOrden).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, "es", { sensitivity: "base" })
    );
    const distritosOrdenesMeta = Array.from(new Set(enriched.map((x) => x.distritoOrden).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, "es", { sensitivity: "base" })
    );

    const sortedDetail = [...filtered].sort((a, b) => {
      const y = b.ymd.localeCompare(a.ymd);
      if (y !== 0) return y;
      return String(b.hm || "").localeCompare(String(a.hm || ""));
    });

    const start = (page - 1) * pageSize;
    const items = sortedDetail.slice(start, start + pageSize);

    return NextResponse.json({
      ok: true,
      period: {
        fromYmd,
        toYmd: toYmdInclusive,
        label: periodLabel,
        mode,
      },
      kpi: {
        ...kpi,
      },
      kpiPrev: {
        ...kpiPrev,
      },
      periodPrev: {
        fromYmd: prevFromYmd,
        toYmd: prevToYmdInclusive,
        label: periodPrevLabel,
      },
      series: {
        byDay,
        byCuadrillaEstado,
        topCuadrillasFinalizadas,
        byTipoOrden,
        byRegionDistritoFinalizadas,
        finalizadasMap,
      },
      filtersMeta: {
        cuadrillas: cuadrillasMeta,
        regionesOrdenes: regionesOrdenesMeta,
        distritosOrdenes: distritosOrdenesMeta,
        gestores: gestoresMeta,
        coordinadores: coordinadoresMeta,
        tiposOrden: tiposOrdenMeta,
        estados: estadosMeta,
      },
      detail: {
        page,
        pageSize,
        total: sortedDetail.length,
        items,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
