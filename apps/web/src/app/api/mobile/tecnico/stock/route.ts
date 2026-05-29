import { NextResponse } from "next/server";
import { getMobileAuthContext } from "@/core/auth/mobile";
import { getTecnicoContext, getTecnicoStock, sustainTecnicoStockEquipment } from "@/core/auth/mobileTecnico";

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

export async function POST(req: Request) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const form = await req.formData();
    const sn = String(form.get("sn") || form.get("SN") || "").trim();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "FILE_REQUIRED" }, { status: 400 });
    }
    if (!sn) {
      return NextResponse.json({ ok: false, error: "SN_REQUIRED" }, { status: 400 });
    }

    const item = await sustainTecnicoStockEquipment(mobile, sn, file);
    return NextResponse.json({
      ok: true,
      item,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
