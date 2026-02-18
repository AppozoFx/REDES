import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    const canUse = session.isAdmin || session.access.roles.includes("GESTOR");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const raw = (await req.json().catch(() => ({}))) as { cuadrillaId?: string; estadoRuta?: string };
    const cuadrillaId = String(raw?.cuadrillaId || "").trim();
    const estadoRuta = String(raw?.estadoRuta || "").trim().toUpperCase();
    if (!cuadrillaId) return NextResponse.json({ ok: false, error: "CUADRILLA_REQUIRED" }, { status: 400 });
    if (!["OPERATIVA", "EN_CAMPO", "RUTA_CERRADA"].includes(estadoRuta)) {
      return NextResponse.json({ ok: false, error: "ESTADO_INVALIDO" }, { status: 400 });
    }

    const db = adminDb();
    const cuadrillaSnap = await db.collection("cuadrillas").doc(cuadrillaId).get();
    if (!cuadrillaSnap.exists) return NextResponse.json({ ok: false, error: "CUADRILLA_NOT_FOUND" }, { status: 404 });
    const cuadrilla = cuadrillaSnap.data() as any;
    if (!session.isAdmin && String(cuadrilla?.gestorUid || "") !== session.uid) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    const ymd = todayLimaYmd();
    const docId = `${ymd}_${cuadrillaId}`;
    await db.collection("cuadrilla_estado_diario").doc(docId).set(
      {
        ymd,
        cuadrillaId,
        cuadrillaNombre: String(cuadrilla?.nombre || cuadrillaId),
        gestorUid: session.uid,
        estadoRuta,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: session.uid,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
