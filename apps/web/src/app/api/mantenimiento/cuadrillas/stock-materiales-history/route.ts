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
      session.permissions.includes("MATERIALES_VIEW") ||
      session.permissions.includes("MATERIALES_TRANSFER_SERVICIO") ||
      session.permissions.includes("MATERIALES_DEVOLUCION");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const cuadrillaId = String(searchParams.get("cuadrillaId") || "").trim();
    const materialId = String(searchParams.get("materialId") || "").trim();
    if (!cuadrillaId) return NextResponse.json({ ok: false, error: "MISSING_CUADRILLA" }, { status: 400 });
    if (!materialId) return NextResponse.json({ ok: false, error: "MISSING_MATERIAL" }, { status: 400 });

    const db = adminDb();
    const snap = await db
      .collection("movimientos_inventario")
      .where("area", "==", "MANTENIMIENTO")
      .where("tipo", "==", "DESPACHO")
      .where("destino.id", "==", cuadrillaId)
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();

    const items: any[] = [];
    for (const doc of snap.docs) {
      const data = doc.data() as any;
      const guia = String(data?.guia || "").trim();
      const createdAt = data?.createdAt;
      let fecha = "";
      if (createdAt?.toDate) fecha = createdAt.toDate().toLocaleString("es-PE");
      else if (typeof createdAt?.seconds === "number") fecha = new Date(createdAt.seconds * 1000).toLocaleString("es-PE");

      const mats = Array.isArray(data?.itemsMateriales) ? data.itemsMateriales : [];
      for (const it of mats) {
        const id = String(it?.materialId || "").trim();
        if (id !== materialId) continue;
        items.push({
          guia,
          fecha,
          cantidad: Number(it?.und || 0),
          metros: Number(it?.metros || 0),
          unidad: String(it?.unidadTipo || "UND").toUpperCase(),
        });
      }
    }

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}