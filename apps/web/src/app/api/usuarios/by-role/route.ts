import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    const canUse =
      session.isAdmin ||
      session.permissions.includes("VENTAS_EDIT") ||
      session.permissions.includes("VENTAS_DESPACHO_INST") ||
      session.permissions.includes("VENTAS_DESPACHO_AVER");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const role = String(searchParams.get("role") || "").trim().toUpperCase();
    if (!role) return NextResponse.json({ ok: false, error: "MISSING_ROLE" }, { status: 400 });

    const accessSnap = await adminDb()
      .collection("usuarios_access")
      .where("roles", "array-contains", role)
      .limit(500)
      .get();

    const uids = accessSnap.docs.map((d) => d.id);
    const userRefs = uids.map((uid) => adminDb().collection("usuarios").doc(uid));
    const userSnaps = uids.length ? await adminDb().getAll(...userRefs) : [];
    const userMap = new Map(
      userSnaps.map((s) => {
        const data = s.data() as any;
        const nombres = String(data?.nombres || "").trim();
        const apellidos = String(data?.apellidos || "").trim();
        const displayName = `${nombres} ${apellidos}`.trim() || s.id;
        return [s.id, displayName];
      })
    );

    const items = uids.map((uid) => ({ uid, label: userMap.get(uid) || uid }));
    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
