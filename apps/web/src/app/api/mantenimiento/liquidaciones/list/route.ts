import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { requireAreaScope } from "@/core/auth/apiGuards";
import { listMantenimientoLiquidaciones } from "@/domain/mantenimientoLiquidaciones/repo";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getServerSession();
    requireAreaScope(session, ["MANTENIMIENTO"]);
    const items = await listMantenimientoLiquidaciones();
    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    const msg = String(e?.message || "ERROR");
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "ACCESS_DISABLED" || msg === "AREA_FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
