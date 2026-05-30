import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES_PERMITIDOS = ["GESTOR", "JEFATURA", "GERENCIA"];

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }

    const userRoles = session.access.roles.map((r) => r.toUpperCase());
    const canView = session.isAdmin || userRoles.some((r) => ROLES_PERMITIDOS.includes(r));
    if (!canView) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const db = adminDb();
    const { searchParams } = new URL(req.url);
    const estadoFilter = searchParams.get("estado") || "PENDIENTE";

    let query = db
      .collection("alertas_app")
      .where("estado", "==", estadoFilter)
      .orderBy("creadoAt", "desc")
      .limit(50);

    const snap = await query.get();
    const allItems = snap.docs.map((d) => {
      const x = d.data() as any;
      return {
        id: d.id,
        tipo: String(x.tipo || ""),
        estado: String(x.estado || ""),
        cuadrillaId: String(x.cuadrillaId || ""),
        cuadrillaNombre: String(x.cuadrillaNombre || ""),
        emisorUid: String(x.emisorUid || ""),
        emisorNombre: String(x.emisorNombre || ""),
        rolesDestino: Array.isArray(x.rolesDestino) ? x.rolesDestino : [],
        ymd: String(x.ymd || ""),
        creadoAt: x.creadoAt?.toDate?.()?.toISOString?.() ?? null,
        respondidoAt: x.respondidoAt?.toDate?.()?.toISOString?.() ?? null,
        respondidoPorUid: x.respondidoPorUid ?? null,
        respondidoPorNombre: x.respondidoPorNombre ?? null,
        respondidoPorRol: x.respondidoPorRol ?? null,
      };
    });

    // GESTOR solo ve alertas de sus propias cuadrillas
    let items = allItems;
    if (!session.isAdmin && userRoles.includes("GESTOR") && !userRoles.includes("JEFATURA") && !userRoles.includes("GERENCIA")) {
      const cuadrillasSnap = await db
        .collection("cuadrillas")
        .where("gestorUid", "==", session.uid)
        .where("estado", "==", "HABILITADO")
        .get();
      const misCuadrillas = new Set(cuadrillasSnap.docs.map((d) => d.id));
      items = allItems.filter((item) => misCuadrillas.has(item.cuadrillaId));
    }

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
