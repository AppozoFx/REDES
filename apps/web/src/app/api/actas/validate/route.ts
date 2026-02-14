import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    const canUse =
      session.isAdmin ||
      session.permissions.includes("ORDENES_LIQUIDAR") ||
      (session.access.areas || []).includes("INSTALACIONES");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const code = String(searchParams.get("code") || "").trim();
    if (!code) return NextResponse.json({ ok: false, error: "ACTA_REQUIRED" }, { status: 400 });

    const ref = adminDb().collection("actas").doc(code);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: true, estado: "NO_RECEPCIONADA" });
    }
    const data = snap.data() as any;
    const estado = String(data?.estado || "").toUpperCase();
    if (estado === "LIQUIDADA") {
      return NextResponse.json({ ok: false, error: "ACTA_YA_LIQUIDADA" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, estado });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
