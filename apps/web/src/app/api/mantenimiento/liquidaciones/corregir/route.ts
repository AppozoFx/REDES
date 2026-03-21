import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { requireAreaScope } from "@/core/auth/apiGuards";
import { corregirMantenimientoLiquidacion } from "@/domain/mantenimientoLiquidaciones/repo";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    requireAreaScope(session, ["MANTENIMIENTO"]);
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    if (!id) return NextResponse.json({ ok: false, error: "ID_REQUIRED" }, { status: 400 });
    const out = await corregirMantenimientoLiquidacion(id, body, session!.uid);
    return NextResponse.json({ ok: true, ...out });
  } catch (e: any) {
    const msg = String(e?.message || "ERROR");
    const status =
      msg === "UNAUTHENTICATED"
        ? 401
        : msg === "ACCESS_DISABLED" || msg === "AREA_FORBIDDEN"
        ? 403
        : msg === "ID_REQUIRED" || msg === "MATERIALES_REQUIRED" || msg === "SIN_CAMBIOS" || msg === "LIQUIDACION_NO_CONFIRMADA"
        ? 400
        : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
