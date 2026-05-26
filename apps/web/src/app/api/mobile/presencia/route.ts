import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getMobileAuthContext } from "@/core/auth/mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }

    await adminDb()
      .collection("usuarios_presencia")
      .doc(mobile.uid)
      .set(
        {
          uid: mobile.uid,
          online: true,
          source: "MOBILE",
          roles: mobile.access.roles || [],
          areas: mobile.access.areas || [],
          estadoAcceso: mobile.access.estadoAcceso || "HABILITADO",
          lastSeenAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const message = String(e?.message || "ERROR");
    const code = String(e?.code || "");
    const status = code.includes("auth/") ? 401 : 500;
    return NextResponse.json({ ok: false, error: message, code }, { status });
  }
}

export async function DELETE(req: Request) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) return NextResponse.json({ ok: true });

    await adminDb()
      .collection("usuarios_presencia")
      .doc(mobile.uid)
      .set(
        {
          uid: mobile.uid,
          online: false,
          source: "MOBILE",
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
