import { NextResponse } from "next/server";
import { getMobileAuthContext } from "@/core/auth/mobile";
import { sustainCoordinadorEquipo } from "@/core/auth/mobileCoordinador";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

    const form = await req.formData();
    const cuadrillaId = String(form.get("cuadrillaId") || "").trim();
    const sn = String(form.get("sn") || "").trim();
    const file = form.get("file");

    if (!cuadrillaId) return NextResponse.json({ ok: false, error: "CUADRILLA_REQUIRED" }, { status: 400 });
    if (!sn) return NextResponse.json({ ok: false, error: "SN_REQUIRED" }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "FILE_REQUIRED" }, { status: 400 });

    const item = await sustainCoordinadorEquipo(mobile, cuadrillaId, sn, file);
    return NextResponse.json({ ok: true, item });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
