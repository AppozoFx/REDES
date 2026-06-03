import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { canManageSupervisores } from "@/domain/supervisores/access";
import { upsertSupervisorConfig } from "@/domain/supervisores/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    if (!canManageSupervisores(session)) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const result = await upsertSupervisorConfig(body, session.uid);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    const message = String(e?.message || "ERROR");
    const status = message.includes("REQUIRED") || message.includes("NOT_ENABLED") ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
