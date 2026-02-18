import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";

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
      session.permissions.includes("MATERIALES_TRANSFER_SERVICIO") ||
      session.permissions.includes("MATERIALES_DEVOLUCION");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const cuadrillaId = String(searchParams.get("cuadrillaId") || "").trim();
    if (!cuadrillaId) return NextResponse.json({ ok: false, error: "CUADRILLA_REQUIRED" }, { status: 400 });

    const db = adminDb();
    const [histSnap, stockSnap] = await Promise.all([
      db
        .collection("cuadrillas")
        .doc(cuadrillaId)
        .collection("reposicion_historial")
        .orderBy("createdAt", "desc")
        .limit(120)
        .get(),
      db.collection("cuadrillas").doc(cuadrillaId).collection("stock").orderBy("materialId", "asc").limit(300).get(),
    ]);

    const historial = histSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    const stock = stockSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    return NextResponse.json({ ok: true, historial, stock });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
