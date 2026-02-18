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
    const tecnicoUid = String(searchParams.get("tecnicoUid") || "").trim();
    if (!tecnicoUid) return NextResponse.json({ ok: false, error: "TECNICO_REQUIRED" }, { status: 400 });

    const db = adminDb();
    const [histSnap, stockSnap, activosSnap] = await Promise.all([
      db.collection("usuarios").doc(tecnicoUid).collection("materiales_historial").orderBy("createdAt", "desc").limit(120).get(),
      db.collection("usuarios").doc(tecnicoUid).collection("stock_materiales").orderBy("materialId", "asc").limit(300).get(),
      db.collection("usuarios").doc(tecnicoUid).collection("activos_asignados").orderBy("materialId", "asc").limit(300).get(),
    ]);

    const historial = histSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    const stock = stockSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    const activos = activosSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    return NextResponse.json({ ok: true, historial, stock, activos });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}

