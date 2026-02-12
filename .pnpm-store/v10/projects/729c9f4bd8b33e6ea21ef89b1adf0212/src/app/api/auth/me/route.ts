import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

    const snap = await adminDb().collection("usuarios").doc(session.uid).get();
    const data = snap.exists ? (snap.data() as any) : {};
    const nombres = String(data?.nombres || "").trim();
    const apellidos = String(data?.apellidos || "").trim();
    const nombre = `${nombres} ${apellidos}`.trim() || session.uid;

    return NextResponse.json({ ok: true, uid: session.uid, nombre });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
