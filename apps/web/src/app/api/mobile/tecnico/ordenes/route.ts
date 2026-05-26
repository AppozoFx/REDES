import { NextResponse } from "next/server";
import { getMobileAuthContext } from "@/core/auth/mobile";
import { getTecnicoContext, listTecnicoOrders } from "@/core/auth/mobileTecnico";

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const tecnico = await getTecnicoContext(mobile);
    const { searchParams } = new URL(req.url);
    const ymd = String(searchParams.get("ymd") || todayLimaYmd()).trim();
    const items = await listTecnicoOrders(tecnico.cuadrilla.id, ymd);

    return NextResponse.json({
      ok: true,
      ymd,
      cuadrilla: tecnico.cuadrilla,
      items,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
