import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { updateZona } from "@/domain/zonas/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERM = "ZONAS_MANAGE";

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    if (!session.isAdmin && !session.permissions.includes(PERM)) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    const { id } = await props.params;
    const body = await req.json().catch(() => ({}));
    const geometry = Object.prototype.hasOwnProperty.call(body || {}, "geometry") ? body.geometry : undefined;

    await updateZona(id, { geometry }, session.uid);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
