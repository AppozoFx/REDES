import { NextResponse } from "next/server";
import { getMobileAuthContext } from "@/core/auth/mobile";
import { getTecnicoContext, getTecnicoOrderDetail } from "@/core/auth/mobileTecnico";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const tecnico = await getTecnicoContext(mobile);
    const { id } = await context.params;
    const detail = await getTecnicoOrderDetail(tecnico.cuadrilla.id, String(id || "").trim());
    if (!detail) {
      return NextResponse.json({ ok: false, error: "ORDER_NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      cuadrilla: tecnico.cuadrilla,
      item: detail,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
