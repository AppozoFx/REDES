import { NextResponse } from "next/server";
import { getMobileAuthContext } from "@/core/auth/mobile";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function toFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function toTimestampMs(v: unknown): number | null {
  if (!v) return null;
  if (typeof (v as any)?.toDate === "function") {
    try { return (v as any).toDate().getTime(); } catch { return null; }
  }
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

/** Distancia en metros entre dos coordenadas (Haversine). */
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const RADIO_EN_ORDEN_METROS = 50;

export async function GET(req: Request) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const roles = (mobile.access.roles || []).map((r) => String(r || "").trim().toUpperCase());
    if (!roles.includes("TECNICO") && !roles.includes("COORDINADOR") && !roles.includes("ADMIN")) {
      return NextResponse.json({ ok: false, error: "ROLE_REQUIRED" }, { status: 403 });
    }

    const db = adminDb();
    const ymd = todayLimaYmd();

    // Dos queries en paralelo
    const [cuadrillasSnap, iniciadasSnap] = await Promise.all([
      db.collection("cuadrillas").where("estado", "==", "HABILITADO").limit(200).get(),
      // Órdenes INICIADA hoy con coordenadas → para detectar proximidad
      db.collection("ordenes")
        .where("fSoliYmd", "==", ymd)
        .where("estado", "==", "INICIADA")
        .get(),
    ]);

    // Mapa cuadrillaId → array de coordenadas de órdenes INICIADA con lat/lng válidos
    const ordenesIniciadasPorCuadrilla = new Map<string, Array<{ lat: number; lng: number }>>();
    for (const doc of iniciadasSnap.docs) {
      const data = doc.data() as any;
      const cId = String(data?.cuadrillaId || "").trim();
      const lat = toFiniteNumber(data?.lat);
      const lng = toFiniteNumber(data?.lng);
      if (!cId || lat === null || lng === null) continue;
      if (!ordenesIniciadasPorCuadrilla.has(cId)) ordenesIniciadasPorCuadrilla.set(cId, []);
      ordenesIniciadasPorCuadrilla.get(cId)!.push({ lat, lng });
    }

    const items = cuadrillasSnap.docs
      .map((d) => {
        const x = d.data() as any;
        const lat = toFiniteNumber(x.lat);
        const lng = toFiniteNumber(x.lng);
        if (lat === null || lng === null) return null;

        // Determinar estadoActual: EN_ORDEN solo si hay orden INICIADA
        // Y la cuadrilla está a ≤50m de esa orden
        const ordenesIniadas = ordenesIniciadasPorCuadrilla.get(d.id) ?? [];
        const estaEnOrden =
          ordenesIniadas.length > 0 &&
          ordenesIniadas.some(
            (o) => distanceMeters(lat, lng, o.lat, o.lng) <= RADIO_EN_ORDEN_METROS
          );

        return {
          id: d.id,
          nombre: String(x.nombre || d.id),
          categoria: String(x.categoria || ""),
          vehiculo: String(x.vehiculo || ""),
          lat,
          lng,
          lastLocationAt: toTimestampMs(x.lastLocationAt),
          estadoActual: estaEnOrden ? "EN_ORDEN" : "EN_RUTA",
        };
      })
      .filter(Boolean);

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
