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
    q = q.where("estado", "==", "ACTIVO");

    const snap = await q
      .select("unidadTipo", "nombre", "fotoUrl", "imagenUrl", "imageUrl", "vendible", "areas")
      .limit(500)
      .get();
    const items = snap.docs
      .map((d) => ({
        id: d.id,
        unidadTipo: (d.data() as any)?.unidadTipo ?? null,
        nombre: (d.data() as any)?.nombre ?? "",
        vendible: Boolean((d.data() as any)?.vendible),
        areas: Array.isArray((d.data() as any)?.areas) ? (d.data() as any)?.areas : [],
        fotoUrl:
          (d.data() as any)?.fotoUrl ??
          (d.data() as any)?.imagenUrl ??
          (d.data() as any)?.imageUrl ??
          "",
      }))
      .filter((it) => {
        if (!area) return true;
        if (!it.areas || it.areas.length === 0) return true;
        return it.areas.includes(area);
      });

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || "ERROR") },
      { status: 500 }
    );
  }
}
