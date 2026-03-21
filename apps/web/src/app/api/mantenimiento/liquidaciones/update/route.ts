import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { requireAreaScope } from "@/core/auth/apiGuards";
import { updateMantenimientoLiquidacion } from "@/domain/mantenimientoLiquidaciones/repo";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    requireAreaScope(session, ["MANTENIMIENTO"]);
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    if (!id) return NextResponse.json({ ok: false, error: "ID_REQUIRED" }, { status: 400 });
    await updateMantenimientoLiquidacion(id, body, session!.uid);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = String(e?.message || "ERROR");
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "ACCESS_DISABLED" || msg === "AREA_FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
