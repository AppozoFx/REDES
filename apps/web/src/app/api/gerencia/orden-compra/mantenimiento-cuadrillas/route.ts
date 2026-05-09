import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERM_GERENCIA_ORDEN_COMPRA = "GERENCIA_ORDEN_COMPRA";

function hasGerenciaOcAccess(session: NonNullable<Awaited<ReturnType<typeof getServerSession>>>) {
  const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
  return session.isAdmin || (roles.includes("GERENCIA") && session.permissions.includes(PERM_GERENCIA_ORDEN_COMPRA));
}

function toStr(v: unknown) {
  return String(v || "").trim();
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    if (!hasGerenciaOcAccess(session)) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const coordinadorUid = toStr(searchParams.get("coordinadorUid"));
    if (!coordinadorUid) return NextResponse.json({ ok: false, error: "COORDINADOR_REQUIRED" }, { status: 400 });

    const snap = await adminDb()
      .collection("cuadrillas")
      .where("area", "==", "MANTENIMIENTO")
      .limit(3000)
      .get();

    const items = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .filter((row) => toStr(row.coordinadorUid) === coordinadorUid)
      .filter((row) => {
        const estado = toStr(row.estado).toUpperCase();
        return !estado || estado === "HABILITADO";
      })
      .map((row) => ({
        id: String(row.id || ""),
        nombre: toStr(row.nombre || row.id),
        zona: toStr(row.zona),
        turno: toStr(row.turno),
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
