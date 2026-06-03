import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { canViewSupervisores } from "@/domain/supervisores/access";
import { listSupervisoresForGestion } from "@/domain/supervisores/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    if (!canViewSupervisores(session)) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const area = String(searchParams.get("area") || "INSTALACIONES").trim().toUpperCase();
    const items = await listSupervisoresForGestion(area);
    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
