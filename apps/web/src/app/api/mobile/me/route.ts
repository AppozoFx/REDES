import { NextResponse } from "next/server";
import { getMobileAuthContext, getMobileProfile } from "@/core/auth/mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const profile = await getMobileProfile(mobile.uid);

    return NextResponse.json({
      ok: true,
      uid: mobile.uid,
      email: mobile.email || null,
      nombre: profile.nombre,
      roles: mobile.access.roles || [],
      areas: mobile.access.areas || [],
      permissions: mobile.access.effectivePermissions || [],
      estadoAcceso: mobile.access.estadoAcceso || "INHABILITADO",
    });
  } catch (e: any) {
    const message = String(e?.message || "ERROR");
    const code = String(e?.code || "");
    const status = code.includes("auth/") ? 401 : 500;
    return NextResponse.json({ ok: false, error: message, code }, { status });
  }
}
