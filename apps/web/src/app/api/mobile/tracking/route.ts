import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getMobileAuthContext } from "@/core/auth/mobile";
import { getTecnicoContext } from "@/core/auth/mobileTecnico";
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

export async function POST(req: Request) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const roles = (mobile.access.roles || []).map((r) => String(r || "").trim().toUpperCase());
    const isTecnico = roles.includes("TECNICO");
    const isSupervisor = roles.includes("SUPERVISOR");
    const isAdmin = roles.includes("ADMIN");

    if (!isTecnico && !isSupervisor && !isAdmin) {
      return NextResponse.json({ ok: false, error: "ROLE_REQUIRED" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const lat = toFiniteNumber(body?.lat);
    const lng = toFiniteNumber(body?.lng);

    if (lat === null || lng === null) {
      return NextResponse.json({ ok: false, error: "LAT_LNG_REQUIRED" }, { status: 400 });
    }

    const accuracy = toFiniteNumber(body?.accuracy);
    const speed = toFiniteNumber(body?.speed);
    const db = adminDb();
    const ymd = todayLimaYmd();
    const trackingDocId = `${ymd}_${Date.now()}`;
    const trackingPayload = {
      lat, lng, uid: mobile.uid, ymd,
      ...(accuracy !== null && { accuracy }),
      ...(speed !== null && speed >= 0 && { speed }),
      at: FieldValue.serverTimestamp(),
    };

    if (isSupervisor && !isAdmin) {
      // Supervisor: escribe en supervisores/{uid}
      await Promise.all([
        db.collection("supervisores").doc(mobile.uid).set(
          { lat, lng, lastLocationAt: FieldValue.serverTimestamp() },
          { merge: true }
        ),
        db.collection("supervisores").doc(mobile.uid)
          .collection("tracking").doc(trackingDocId).set(trackingPayload),
      ]);
    } else {
      // Técnico / Admin: escribe en cuadrillas/{id}
      const tecnico = await getTecnicoContext(mobile);
      const cuadrillaId = tecnico.cuadrilla.id;
      await Promise.all([
        db.collection("cuadrillas").doc(cuadrillaId).set(
          { lat, lng, lastLocationAt: FieldValue.serverTimestamp() },
          { merge: true }
        ),
        db.collection("cuadrillas").doc(cuadrillaId)
          .collection("tracking").doc(trackingDocId).set(trackingPayload),
      ]);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = String(e?.message || "ERROR");
    if (msg === "TECNICO_WITHOUT_CUADRILLA") {
      return NextResponse.json({ ok: false, error: msg }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
