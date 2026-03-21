import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { requireAreaScope } from "@/core/auth/apiGuards";
import { createMantenimientoCausaRaiz } from "@/domain/mantenimientoCausasRaiz/repo";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    requireAreaScope(session, ["MANTENIMIENTO"]);
    const body = await req.json().catch(() => ({}));
    const created = await createMantenimientoCausaRaiz(String(body?.nombre || ""), session!.uid);
    return NextResponse.json({ ok: true, id: created.id });
  } catch (e: any) {
    const msg = String(e?.message || "ERROR");
    const status = msg === "NOMBRE_REQUIRED" || msg === "CAUSA_DUPLICADA" ? 400 : msg === "UNAUTHENTICATED" ? 401 : msg === "ACCESS_DISABLED" || msg === "AREA_FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
