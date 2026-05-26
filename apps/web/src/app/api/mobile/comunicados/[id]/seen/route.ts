import { NextResponse } from "next/server";
import { getMobileAuthContext } from "@/core/auth/mobile";
import { markMobileComunicadoSeen } from "@/core/auth/mobileBootstrap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const { id } = await context.params;
    const comunicadoId = String(id ?? "").trim();
    if (!comunicadoId) {
      return NextResponse.json({ ok: false, error: "INVALID_COMUNICADO_ID" }, { status: 400 });
    }

    await markMobileComunicadoSeen(mobile.uid, comunicadoId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const message = String(e?.message || "ERROR");
    const code = String(e?.code || "");
    const status = code.includes("auth/") ? 401 : 500;
    return NextResponse.json({ ok: false, error: message, code }, { status });
  }
}
