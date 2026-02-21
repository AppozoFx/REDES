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
  liquidado: boolean;
  correccionPendiente: boolean;
  liquidacionAt: string | null;
};

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
    const fRegionOrden = String(searchParams.get("regionOrden") || "").trim();
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

    const orderDocs = await fetchAllOrdenesByRange(fromYmd, toYmdExclusive);

    const base = orderDocs.map((d) => {
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
        estado: String(x?.estado || "").trim().toUpperCase(),
        tipoOrden: String(x?.tipoOrden || x?.tipo || "").trim().toUpperCase(),
        tipoTraba: String(x?.tipoTraba || "").trim(),
        gestorUid: String(x?.gestorCuadrilla || "").trim(),
        coordinadorUid: String(x?.coordinadorCuadrilla || x?.coordinador || "").trim(),
        isGarantia: isGarantia(tipoMix),
      };
    });

    const codigos = Array.from(new Set(base.map((x) => x.codiSeguiClien).filter(Boolean)));
    const instMap = new Map<string, any>();
    for (let i = 0; i < codigos.length; i += 400) {
      const chunk = codigos.slice(i, i + 400);
      const refs = chunk.map((c) => adminDb().collection("instalaciones").doc(c));
      const snaps = await adminDb().getAll(...refs);
      for (const s of snaps) {
        if (s.exists) instMap.set(s.id, s.data() || {});
      }
    }

    const uidSet = new Set<string>();
    base.forEach((x) => {
      if (x.gestorUid) uidSet.add(x.gestorUid);
      if (x.coordinadorUid) uidSet.add(x.coordinadorUid);
    });
    const uids = Array.from(uidSet);
    const uidName = new Map<string, string>();
    for (let i = 0; i < uids.length; i += 400) {
      const chunk = uids.slice(i, i + 400);
      const refs = chunk.map((uid) => adminDb().collection("usuarios").doc(uid));
      const snaps = await adminDb().getAll(...refs);
      snaps.forEach((s) => {
        const data = (s.data() as any) || {};
        const full = String(data.displayName || `${data.nombres || ""} ${data.apellidos || ""}`.trim() || s.id);
        uidName.set(s.id, full);
      });
    }

    const enriched: DetailItem[] = base
      .filter((x) => !x.isGarantia)
      .map((x) => {
        const inst = x.codiSeguiClien ? instMap.get(x.codiSeguiClien) : null;
        const liqEstado = String(inst?.liquidacion?.estado || "").toUpperCase();
        const liqAt = toIso(inst?.liquidacion?.at);
        const correccionPendiente = !!(inst?.correccionPendiente || inst?.corregido);
        const liquidado = (liqEstado === "LIQUIDADO" || !!liqAt) && !correccionPendiente;
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
          tipoOrden: x.tipoOrden,
          tipoTraba: x.tipoTraba,
          gestorUid: x.gestorUid,
          gestorNombre: x.gestorUid ? uidName.get(x.gestorUid) || x.gestorUid : "",
          coordinadorUid: x.coordinadorUid,
          coordinadorNombre: x.coordinadorUid ? uidName.get(x.coordinadorUid) || x.coordinadorUid : "",
          regionOrden: x.regionOrden,
          liquidado,
          correccionPendiente,
          liquidacionAt: liqAt,
        };
      });

    const filtered = enriched.filter((x) => {
      if (fCuadrilla) {
        const cuadrillaFull = `${x.cuadrillaNombre || ""} ${x.cuadrillaId || ""}`;
        if (!norm(cuadrillaFull).includes(norm(fCuadrilla))) return false;
      }
      if (fRegionOrden && norm(x.regionOrden) !== norm(fRegionOrden)) return false;
      if (fGestorUid && x.gestorUid !== fGestorUid) return false;
      if (fCoordinadorUid && x.coordinadorUid !== fCoordinadorUid) return false;
      if (fEstado && x.estado !== fEstado) return false;
      if (fTipoOrden && x.tipoOrden !== fTipoOrden) return false;
      if (soloNoLiquidadas && x.liquidado) return false;
      return true;
    });

    const total = filtered.length;
    const finalizadas = filtered.filter((x) => normalizeOrderState(x.estado) === "FINALIZADA").length;
    const agendadas = filtered.filter((x) => normalizeOrderState(x.estado) === "AGENDADA").length;
    const iniciadas = filtered.filter((x) => normalizeOrderState(x.estado) === "INICIADA").length;
    const pendientes = agendadas + iniciadas;
    const finalizadasRows = filtered.filter((x) => normalizeOrderState(x.estado) === "FINALIZADA");
    const liquidadas = finalizadasRows.filter((x) => x.liquidado).length;
    const pendientesLiquidar = finalizadasRows.filter((x) => !x.liquidado).length;
    const correccionPendiente = filtered.filter((x) => x.correccionPendiente).length;
    const efectividadPct = total > 0 ? Number(((finalizadas / total) * 100).toFixed(2)) : 0;

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

    const gestoresMeta = Array.from(
      new Map(
        filtered
          .filter((x) => x.gestorUid)
          .map((x) => [x.gestorUid, { uid: x.gestorUid, nombre: x.gestorNombre || x.gestorUid }])
      ).values()
    ).sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));

    const coordinadoresMeta = Array.from(
      new Map(
        filtered
          .filter((x) => x.coordinadorUid)
          .map((x) => [x.coordinadorUid, { uid: x.coordinadorUid, nombre: x.coordinadorNombre || x.coordinadorUid }])
      ).values()
    ).sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));

    const cuadrillasMeta = Array.from(
      new Map(
        filtered
          .filter((x) => x.cuadrillaId || x.cuadrillaNombre)
          .map((x) => [x.cuadrillaId || x.cuadrillaNombre, { id: x.cuadrillaId || x.cuadrillaNombre, nombre: x.cuadrillaNombre || x.cuadrillaId }])
      ).values()
    ).sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));

    const tiposOrdenMeta = Array.from(new Set(filtered.map((x) => x.tipoOrden).filter(Boolean))).sort();
    const estadosMeta = Array.from(new Set(filtered.map((x) => x.estado).filter(Boolean))).sort();
    const regionesOrdenesMeta = Array.from(new Set(filtered.map((x) => x.regionOrden).filter(Boolean))).sort((a, b) =>
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
        total,
        finalizadas,
        agendadas,
        iniciadas,
        pendientes,
        efectividadPct,
        liquidadas,
        pendientesLiquidar,
        correccionPendiente,
      },
      series: {
        byDay,
        byCuadrillaEstado,
        topCuadrillasFinalizadas,
        byTipoOrden,
      },
      filtersMeta: {
        cuadrillas: cuadrillasMeta,
        regionesOrdenes: regionesOrdenesMeta,
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
