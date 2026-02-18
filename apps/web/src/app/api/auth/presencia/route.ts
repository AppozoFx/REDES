import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

    const ref = adminDb().collection("usuarios_presencia").doc(session.uid);
    await ref.set(
      {
        uid: session.uid,
        online: true,
        source: "WEB",
        roles: session.access.roles || [],
        areas: session.access.areas || [],
        estadoAcceso: session.access.estadoAcceso || "HABILITADO",
        lastSeenAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: true });

    const ref = adminDb().collection("usuarios_presencia").doc(session.uid);
    await ref.set(
      {
        uid: session.uid,
        online: false,
        source: "WEB",
        lastSeenAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}

