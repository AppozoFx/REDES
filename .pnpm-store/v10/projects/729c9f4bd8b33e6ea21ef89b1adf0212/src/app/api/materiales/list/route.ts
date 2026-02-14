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
      session.permissions.includes("MATERIALES_CREATE") ||
      session.permissions.includes("MATERIALES_EDIT") ||
      session.permissions.includes("MATERIALES_TRANSFER_SERVICIO") ||
      session.permissions.includes("MATERIALES_DEVOLUCION");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const area = searchParams.get("area");

    let q: FirebaseFirestore.Query = adminDb().collection("materiales");
    if (area) q = q.where("areas", "array-contains", area);
    q = q.where("estado", "==", "ACTIVO");

    const snap = await q.select("unidadTipo", "nombre").limit(500).get();
    const items = snap.docs.map((d) => ({
      id: d.id,
      unidadTipo: (d.data() as any)?.unidadTipo ?? null,
      nombre: (d.data() as any)?.nombre ?? "",
    }));

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || "ERROR") },
      { status: 500 }
    );
  }
}
