import { NextResponse } from "next/server";
import { getMobileAuthContext } from "@/core/auth/mobile";
import { getTecnicoContext, getTecnicoStock } from "@/core/auth/mobileTecnico";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const tecnico = await getTecnicoContext(mobile);
    const stock = await getTecnicoStock(tecnico.cuadrilla.id);

    return NextResponse.json({
      ok: true,
      cuadrilla: tecnico.cuadrilla,
      ...stock,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
