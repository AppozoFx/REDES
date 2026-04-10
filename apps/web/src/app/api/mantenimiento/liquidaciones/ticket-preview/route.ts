import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { requireAreaScope } from "@/core/auth/apiGuards";
import { getTicketVisitaPreview } from "@/domain/mantenimientoLiquidaciones/repo";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    requireAreaScope(session, ["MANTENIMIENTO"]);
    const { searchParams } = new URL(req.url);
    const ticketNumero = String(searchParams.get("ticketNumero") || "").trim();
    const currentId = String(searchParams.get("currentId") || "").trim();
    if (!ticketNumero) return NextResponse.json({ ok: false, error: "TICKET_REQUIRED" }, { status: 400 });
    const preview = await getTicketVisitaPreview(ticketNumero, currentId || undefined);
    return NextResponse.json({ ok: true, preview });
  } catch (e: any) {
    const msg = String(e?.message || "ERROR");
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "ACCESS_DISABLED" || msg === "AREA_FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
