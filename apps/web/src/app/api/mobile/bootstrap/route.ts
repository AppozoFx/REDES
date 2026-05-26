import { NextResponse } from "next/server";
import { getMobileAuthContext } from "@/core/auth/mobile";
import { buildMobileBootstrap } from "@/core/auth/mobileBootstrap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const bootstrap = await buildMobileBootstrap(mobile);
    return NextResponse.json({
      ok: true,
      ...bootstrap,
    });
  } catch (e: any) {
    const message = String(e?.message || "ERROR");
    const code = String(e?.code || "");
    const status = code.includes("auth/") ? 401 : 500;
    return NextResponse.json({ ok: false, error: message, code }, { status });
  }
}
