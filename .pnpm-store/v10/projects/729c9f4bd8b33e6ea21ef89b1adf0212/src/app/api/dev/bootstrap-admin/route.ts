import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function POST() {
  try {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ ok: false, error: "DISABLED" }, { status: 403 });
    }

    const cookieStore = await cookies();
const sessionCookie = cookieStore.get("__session")?.value;

    if (!sessionCookie) {
      return NextResponse.json({ ok: false, error: "NO_SESSION" }, { status: 401 });
    }

    const decoded = await adminAuth().verifySessionCookie(sessionCookie, true);
    const uid = decoded.uid;

    const db = adminDb();

    const snap = await db
      .collection("usuarios_access")
      .where("roles", "array-contains", "ADMIN")
      .limit(1)
      .get();

    if (!snap.empty) {
      return NextResponse.json({ ok: false, error: "ADMIN_ALREADY_EXISTS" }, { status: 409 });
    }

    await db.collection("usuarios_access").doc(uid).set(
      {
        roles: ["ADMIN"],
        estadoAcceso: "HABILITADO",
        audit: {
          updatedAt: new Date(),
          updatedBy: uid,
        },
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, uid });
  } catch (e: any) {
    console.error("bootstrap-admin error:", e);
    return NextResponse.json(
      { ok: false, error: "INTERNAL", message: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
