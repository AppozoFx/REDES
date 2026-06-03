import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getMobileAuthContext } from "@/core/auth/mobile";
import { getSupervisorContext } from "@/core/auth/mobileSupervisor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
}

function nowLima() {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date());
}

function haversineMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getOficinaConfig() {
  const snap = await adminDb().collection("configuracion_app").doc("supervisor_jornada").get();
  if (!snap.exists) return null;
  const data = snap.data() as any;
  const oficina = data?.oficina;
  if (!oficina?.lat || !oficina?.lng) return null;
  return {
    lat: Number(oficina.lat),
    lng: Number(oficina.lng),
    radioMetros: Number(oficina.radioMetros || 500),
  };
}

async function getJornadaDoc(uid: string, ymd: string) {
  const snap = await adminDb().collection("asistencia_supervisores").doc(`${uid}_${ymd}`).get();
  if (!snap.exists) return null;
  return snap.data() as any;
}

function docToJornada(data: any | null, uid: string, ymd: string) {
  return {
    uid,
    ymd,
    estado: String(data?.estado || "SIN_INICIAR"),
    horaInicio: data?.horaInicio || null,
    horaFin: data?.horaFin || null,
    horaInicioRefrigerio: data?.horaInicioRefrigerio || null,
    horaFinRefrigerio: data?.horaFinRefrigerio || null,
    latInicio: data?.latInicio || null,
    lngInicio: data?.lngInicio || null,
    latFin: data?.latFin || null,
    lngFin: data?.lngFin || null,
  };
}

// GET — estado de jornada de hoy
export async function GET(req: Request) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    await getSupervisorContext(mobile);

    const { searchParams } = new URL(req.url);
    const ymd = String(searchParams.get("ymd") || todayLimaYmd()).trim();

    const [jornadaData, oficina] = await Promise.all([
      getJornadaDoc(mobile.uid, ymd),
      getOficinaConfig(),
    ]);

    return NextResponse.json({
      ok: true,
      jornada: docToJornada(jornadaData, mobile.uid, ymd),
      oficina,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}

// POST — registrar evento de jornada
export async function POST(req: Request) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    await getSupervisorContext(mobile);

    const body = await req.json().catch(() => ({}));
    const tipo = String(body?.tipo || "").trim().toUpperCase();
    const lat = typeof body?.lat === "number" && Number.isFinite(body.lat) ? body.lat : null;
    const lng = typeof body?.lng === "number" && Number.isFinite(body.lng) ? body.lng : null;

    const validTipos = ["INICIO_RUTA", "FIN_RUTA", "INICIO_REFRIGERIO", "FIN_REFRIGERIO"];
    if (!validTipos.includes(tipo)) {
      return NextResponse.json({ ok: false, error: "TIPO_INVALIDO" }, { status: 400 });
    }

    const ymd = todayLimaYmd();
    const db = adminDb();
    const docRef = db.collection("asistencia_supervisores").doc(`${mobile.uid}_${ymd}`);

    // Geo-fence solo para INICIO_RUTA
    if (tipo === "INICIO_RUTA") {
      if (lat === null || lng === null) {
        return NextResponse.json({ ok: false, error: "UBICACION_REQUERIDA" }, { status: 400 });
      }
      const oficina = await getOficinaConfig();
      if (oficina) {
        const distancia = Math.round(haversineMetros(lat, lng, oficina.lat, oficina.lng));
        if (distancia > oficina.radioMetros) {
          return NextResponse.json({
            ok: false,
            error: "FUERA_DE_RADIO",
            distanciaMetros: distancia,
            radioMetros: oficina.radioMetros,
          }, { status: 400 });
        }
      }
    }

    const hora = nowLima();
    const existing = await getJornadaDoc(mobile.uid, ymd);

    const payload: Record<string, any> = {
      uid: mobile.uid,
      ymd,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (tipo === "INICIO_RUTA") {
      payload.estado = "EN_RUTA";
      payload.horaInicio = hora;
      if (lat !== null) payload.latInicio = lat;
      if (lng !== null) payload.lngInicio = lng;
      if (!existing) payload.createdAt = FieldValue.serverTimestamp();
    } else if (tipo === "FIN_RUTA") {
      payload.estado = "FINALIZADA";
      payload.horaFin = hora;
      if (lat !== null) payload.latFin = lat;
      if (lng !== null) payload.lngFin = lng;
    } else if (tipo === "INICIO_REFRIGERIO") {
      if (existing?.horaInicioRefrigerio) {
        return NextResponse.json({ ok: false, error: "REFRIGERIO_YA_REGISTRADO" }, { status: 400 });
      }
      payload.estado = "EN_REFRIGERIO";
      payload.horaInicioRefrigerio = hora;
    } else if (tipo === "FIN_REFRIGERIO") {
      if (!existing?.horaInicioRefrigerio) {
        return NextResponse.json({ ok: false, error: "REFRIGERIO_NO_INICIADO" }, { status: 400 });
      }
      if (existing?.horaFinRefrigerio) {
        return NextResponse.json({ ok: false, error: "REFRIGERIO_YA_FINALIZADO" }, { status: 400 });
      }
      payload.estado = "EN_RUTA";
      payload.horaFinRefrigerio = hora;
    }

    await docRef.set(payload, { merge: true });

    const updated = await getJornadaDoc(mobile.uid, ymd);
    return NextResponse.json({ ok: true, jornada: docToJornada(updated, mobile.uid, ymd) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
