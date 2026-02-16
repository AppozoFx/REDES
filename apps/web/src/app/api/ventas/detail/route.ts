import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });

    const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
    const isCoord = roles.includes("COORDINADOR");
    const canViewAll = session.isAdmin || session.permissions.includes("VENTAS_VER_ALL");
    const canView = canViewAll || session.permissions.includes("VENTAS_VER");
    if (!canView) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const ventaId = searchParams.get("ventaId");
    if (!ventaId) return NextResponse.json({ ok: false, error: "MISSING_VENTA_ID" }, { status: 400 });

    const ventaRef = adminDb().collection("ventas").doc(ventaId);
    const ventaSnap = await ventaRef.get();
    if (!ventaSnap.exists) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    const ventaRaw = ventaSnap.data() as any;
    const createdAt = ventaRaw?.createdAt?.toDate?.();
    const venta = {
      ...ventaRaw,
      createdAtStr: createdAt ? createdAt.toISOString() : "",
    };

    if (!canViewAll) {
      if (!isCoord || String(venta.coordinadorUid || "") !== session.uid) {
        return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
      }
    }

    const cuotasSnap = await ventaRef.collection("cuotas").orderBy("n", "asc").get();
    const cuotas = cuotasSnap.docs.map((d) => {
      const data = d.data() as any;
      return { id: d.id, ...data };
    });

    return NextResponse.json({ ok: true, venta: { id: ventaId, ...venta }, cuotas });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
