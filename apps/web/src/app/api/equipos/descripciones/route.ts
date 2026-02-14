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
      session.permissions.includes("EQUIPOS_VIEW") ||
      session.permissions.includes("EQUIPOS_EDIT") ||
      session.permissions.includes("EQUIPOS_IMPORT") ||
      session.permissions.includes("EQUIPOS_DESPACHO") ||
      session.permissions.includes("EQUIPOS_DEVOLUCION");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const estados = searchParams.getAll("estado").map((e) => e.trim().toUpperCase()).filter(Boolean);
    const ubicacion = (searchParams.get("ubicacion") || "").trim().toUpperCase();
    const equipo = (searchParams.get("equipo") || "").trim().toUpperCase();

    const db = adminDb();
    let q: FirebaseFirestore.Query = db.collection("equipos");

    if (estados.length === 1) q = q.where("estado", "==", estados[0]);
    else if (estados.length > 1) q = q.where("estado", "in", estados.slice(0, 10));
    else q = q.where("estado", "in", ["ALMACEN", "CAMPO"]);

    if (ubicacion) q = q.where("ubicacion", "==", ubicacion);
    if (equipo) q = q.where("equipo", "==", equipo);

    q = q.select("descripcion").limit(2000);
    const snap = await q.get();
    const set = new Set<string>();
    snap.docs.forEach((d) => {
      const data = d.data() as any;
      const desc = String(data?.descripcion || "").trim();
      if (desc) set.add(desc);
    });

    return NextResponse.json({ ok: true, items: Array.from(set).sort((a, b) => a.localeCompare(b)) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
