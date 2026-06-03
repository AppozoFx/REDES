import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["ADMIN", "GERENCIA", "JEFATURA", "SUPERVISOR", "COORDINADOR"];

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
}

function tsToMs(v: any): number | null {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate().getTime();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  if (typeof v === "number") return v;
  return null;
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    const roles = (session.access.roles || []).map((r: string) => String(r).toUpperCase());
    if (!session.isAdmin && !roles.some((r) => ALLOWED_ROLES.includes(r))) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    const ymd = todayLimaYmd();
    const db = adminDb();

    // Jornadas activas hoy (EN_RUTA o EN_REFRIGERIO)
    const jornadasSnap = await db.collection("asistencia_supervisores")
      .where("ymd", "==", ymd)
      .get();

    const activeUids: { uid: string; estadoJornada: string }[] = [];
    jornadasSnap.docs.forEach((doc) => {
      const data = doc.data() as any;
      const estado = String(data?.estado || "").toUpperCase();
      if (estado === "EN_RUTA" || estado === "EN_REFRIGERIO") {
        const uid = String(data?.uid || "").trim();
        if (uid) activeUids.push({ uid, estadoJornada: estado });
      }
    });

    if (!activeUids.length) {
      return NextResponse.json({ ok: true, items: [] });
    }

    // Datos de supervisores con ubicación
    const supDocs = await Promise.all(
      activeUids.map(({ uid }) => db.collection("supervisores").doc(uid).get())
    );

    const items = activeUids
      .map(({ uid, estadoJornada }, i) => {
        const snap = supDocs[i];
        if (!snap.exists) return null;
        const data = snap.data() as any;
        const lat = toNum(data?.lat);
        const lng = toNum(data?.lng);
        if (lat === null || lng === null) return null;
        return {
          uid,
          nombre: String(data?.nombre || uid),
          nombreCorto: String(data?.nombreCorto || data?.nombre || uid),
          vehiculoPlaca: String(data?.vehiculoPlaca || ""),
          lat,
          lng,
          lastLocationAt: tsToMs(data?.lastLocationAt),
          estadoJornada,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
