import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";
import { derivePrecioPorMetroCents } from "@/domain/materiales/repo";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    const canUse =
      session.isAdmin ||
      session.permissions.includes("VENTAS_DESPACHO_INST") ||
      session.permissions.includes("VENTAS_DESPACHO_MANT") ||
      session.permissions.includes("VENTAS_EDIT") ||
      session.permissions.includes("VENTAS_VER") ||
      session.permissions.includes("VENTAS_VER_ALL");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const area = searchParams.get("area");

    let q: FirebaseFirestore.Query = adminDb()
      .collection("materiales")
      .where("vendible", "==", true)
      .where("estado", "==", "ACTIVO");

    if (area) q = q.where("areas", "array-contains", area);

    const snap = await q.limit(1000).get();
    const items = snap.docs.map((d) => {
      const data = d.data() as any;
      const precioPorMetroCents = derivePrecioPorMetroCents({
        precioPorMetroCents: data?.precioPorMetroCents,
        precioUndCents: data?.precioUndCents,
        metrosPorUndCm: data?.metrosPorUndCm,
      });
      return {
        id: d.id,
        nombre: data?.nombre ?? "",
        unidadTipo: data?.unidadTipo ?? "",
        ventaUnidadTipos: Array.isArray(data?.ventaUnidadTipos) ? data.ventaUnidadTipos : null,
        precioUndCents: data?.precioUndCents ?? null,
        precioPorMetroCents,
        precioPorCmCents: data?.precioPorCmCents ?? null,
        areas: data?.areas ?? [],
      };
    });

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
