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
      session.permissions.includes("EQUIPOS_DESPACHO") ||
      session.permissions.includes("EQUIPOS_DEVOLUCION") ||
      session.permissions.includes("MATERIALES_TRANSFER_SERVICIO") ||
      session.permissions.includes("MATERIALES_DEVOLUCION") ||
      session.permissions.includes("EQUIPOS_VIEW");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const uid = String(searchParams.get("uid") || "").trim();
    if (!uid) return NextResponse.json({ ok: false, error: "UID_REQUIRED" }, { status: 400 });

    const db = adminDb();
    const [materialesSnap, equiposStockSnap, equiposSeriesSnap] = await Promise.all([
      db.collection("personal_stock").doc(uid).collection("stock").get(),
      db.collection("personal_stock").doc(uid).collection("equipos_stock").get(),
      db.collection("personal_stock").doc(uid).collection("equipos_series").limit(500).get(),
    ]);

    const materiales = materialesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const equipos = equiposStockSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const series = equiposSeriesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    return NextResponse.json({ ok: true, materiales, equipos, series });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
