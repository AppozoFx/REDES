import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";
import { requireAreaScope, requirePermission } from "@/core/auth/apiGuards";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await getServerSession({ forceAccessRefresh: true });
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (!session.isAdmin) {
      let hasPermission = false;
      for (const perm of ["MATERIALES_VIEW", "MATERIALES_TRANSFER_SERVICIO", "MATERIALES_DEVOLUCION"]) {
        try {
          requirePermission(session, perm);
          hasPermission = true;
          break;
        } catch {}
      }
      if (!hasPermission) throw new Error("FORBIDDEN");
      requireAreaScope(session, ["MANTENIMIENTO"]);
    }

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
    const msg = String(e?.message || "");
    if (msg === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (msg === "ACCESS_DISABLED") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    if (msg === "FORBIDDEN" || msg === "AREA_FORBIDDEN") {
      return NextResponse.json({ ok: false, error: msg === "AREA_FORBIDDEN" ? "AREA_FORBIDDEN" : "FORBIDDEN" }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
