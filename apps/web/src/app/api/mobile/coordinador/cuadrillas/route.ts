import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getMobileAuthContext } from "@/core/auth/mobile";
import { getCoordinadorContext } from "@/core/auth/mobileCoordinador";
import { adminDb } from "@/lib/firebase/admin";

function normalizeText(v: unknown) {
  return String(v || "").trim().toUpperCase();
}

async function getLatestOrdersUpdateInfo() {
  const db = adminDb();
  const notifsSnap = await db.collection("notificaciones").orderBy("createdAt", "desc").limit(60).get();
  const notifImport = notifsSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .find((n) => {
      const title = normalizeText(n?.title);
      const entityType = normalizeText(n?.entityType);
      if (entityType !== "ORDENES") return false;
      return title.includes("IMPORT") || title.includes("WINBO");
    });
  if (!notifImport) return null;
  let byNombre = "";
  if (notifImport.createdBy) {
    try {
      const userSnap = await db.collection("usuarios").doc(String(notifImport.createdBy)).get();
      const u = (userSnap.data() as any) || {};
      byNombre = String(u.displayName || `${u.nombres || ""} ${u.apellidos || ""}`.trim() || u.email || notifImport.createdBy);
    } catch {}
  }
  const at = notifImport.createdAt?.toDate?.()?.toISOString?.() ?? null;
  return { at, byNombre };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function toFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function toInt(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return 0;
}

function toTimestampMs(v: unknown): number | null {
  if (!v) return null;
  if (typeof (v as any)?.toDate === "function") { try { return (v as any).toDate().getTime(); } catch { return null; } }
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1); const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(req: Request) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

    const coord = await getCoordinadorContext(mobile);
    if (!coord.cuadrillasIds.length) return NextResponse.json({ ok: true, cuadrillas: [] });

    const { searchParams } = new URL(req.url);
    const ymd = String(searchParams.get("ymd") || todayLimaYmd()).trim();
    const db = adminDb();

    const [cuadSnap, ordenesSnap1, ordenesSnap2, estadoDiarioSnap, iniciadasSnap, updateInfo] = await Promise.all([
      db.collection("cuadrillas").where("coordinadorUid", "==", mobile.uid).where("estado", "==", "HABILITADO").get(),
      db.collection("ordenes").where("fSoliYmd", "==", ymd).limit(3000).get(),
      db.collection("ordenes").where("fechaFinVisiYmd", "==", ymd).limit(3000).get(),
      // Estado de ruta del día
      Promise.all(coord.cuadrillasIds.map((id) => db.collection("cuadrilla_estado_diario").doc(`${ymd}_${id}`).get())),
      // Órdenes INICIADA para estadoActual
      db.collection("ordenes").where("fSoliYmd", "==", ymd).where("estado", "==", "INICIADA").get(),
      getLatestOrdersUpdateInfo(),
    ]);

    // Merge ordenes (deduplicar)
    const docsById = new Map<string, any>();
    for (const d of [...ordenesSnap1.docs, ...ordenesSnap2.docs]) docsById.set(d.id, d.data());

    // Conteos por cuadrillaId
    const conteos = new Map<string, { total: number; agendadas: number; iniciadas: number; finalizadas: number }>();
    for (const [, o] of docsById) {
      const cId = String(o?.cuadrillaId || "").trim();
      if (!coord.cuadrillasIds.includes(cId)) continue;
      if (!conteos.has(cId)) conteos.set(cId, { total: 0, agendadas: 0, iniciadas: 0, finalizadas: 0 });
      const c = conteos.get(cId)!;
      c.total++;
      const est = String(o?.estado || "").trim().toUpperCase();
      if (est === "AGENDADA") c.agendadas++;
      else if (est === "INICIADA" || est === "EN CAMINO") c.iniciadas++;
      else if (est.includes("FINAL")) c.finalizadas++;
    }

    // Estado de ruta por cuadrillaId
    const estadoRutaById = new Map<string, string>();
    for (const snap of estadoDiarioSnap) {
      if (snap.exists) {
        const x = snap.data() as any;
        const cId = String(x?.cuadrillaId || "").trim();
        estadoRutaById.set(cId, String(x?.estadoRuta || "OPERATIVA"));
      }
    }

    // Cuadrillas con INICIADA para estadoActual
    const iniciadasPorCuadrilla = new Map<string, Array<{ lat: number; lng: number }>>();
    for (const d of iniciadasSnap.docs) {
      const o = d.data() as any;
      const cId = String(o?.cuadrillaId || "").trim();
      const lat = toFiniteNumber(o?.lat); const lng = toFiniteNumber(o?.lng);
      if (!cId || lat === null || lng === null) continue;
      if (!iniciadasPorCuadrilla.has(cId)) iniciadasPorCuadrilla.set(cId, []);
      iniciadasPorCuadrilla.get(cId)!.push({ lat, lng });
    }

    // Items de órdenes agrupados por cuadrillaId
    const itemsByCuadrilla = new Map<string, any[]>();
    for (const [id, o] of docsById) {
      const cId = String(o?.cuadrillaId || "").trim();
      if (!coord.cuadrillasIds.includes(cId)) continue;
      if (!itemsByCuadrilla.has(cId)) itemsByCuadrilla.set(cId, []);
      itemsByCuadrilla.get(cId)!.push({
        id,
        ordenId: String(o?.ordenId || id),
        cliente: String(o?.cliente || "").trim(),
        estado: String(o?.estado || "").trim().toUpperCase(),
        motivoCancelacion: String(o?.motivoCancelacion || "").trim(),
        hora: String(o?.fSoliHm || o?.fechaFinVisiHm || "").trim(),
        tipo: String(o?.tipoTraba || o?.tipo || "").trim(),
        direccion: String(o?.direccion || o?.direccion1 || "").trim(),
        cantMesh: toInt(o?.cantMESHwin),
        cantFono: toInt(o?.cantFONOwin),
        cantBox: toInt(o?.cantBOXwin),
      });
    }

    const cuadrillas = cuadSnap.docs.map((d) => {
      const x = d.data() as any;
      const lat = toFiniteNumber(x.lat); const lng = toFiniteNumber(x.lng);
      const conteo = conteos.get(d.id) ?? { total: 0, agendadas: 0, iniciadas: 0, finalizadas: 0 };
      const estadoRuta = estadoRutaById.get(d.id) ?? "OPERATIVA";
      const iniciadas = iniciadasPorCuadrilla.get(d.id) ?? [];
      const estaEnOrden = lat !== null && lng !== null && iniciadas.length > 0 &&
        iniciadas.some((o) => distanceMeters(lat, lng, o.lat, o.lng) <= 50);
      const items = (itemsByCuadrilla.get(d.id) ?? []).sort((a, b) => a.hora.localeCompare(b.hora));
      return {
        id: d.id,
        nombre: String(x.nombre || d.id),
        categoria: String(x.categoria || ""),
        estadoRuta,
        lat, lng,
        lastLocationAt: toTimestampMs(x.lastLocationAt),
        estadoActual: estaEnOrden ? "EN_ORDEN" : "EN_RUTA",
        ordenes: { ...conteo, items },
      };
    }).sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));

    return NextResponse.json({ ok: true, ymd, updateInfo, cuadrillas });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
