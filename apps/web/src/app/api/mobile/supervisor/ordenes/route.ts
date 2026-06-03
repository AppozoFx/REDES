import { NextResponse } from "next/server";
import { getMobileAuthContext } from "@/core/auth/mobile";
import { getSupervisorContext, getSupervisorAssignments, listSupervisorOrders, getLatestOrdersUpdateInfoForSupervisor } from "@/core/auth/mobileSupervisor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
}

export async function GET(req: Request) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

    const ctx = await getSupervisorContext(mobile);
    const { searchParams } = new URL(req.url);
    const ymd = String(searchParams.get("ymd") || todayLimaYmd()).trim();
    const soloGarantias = searchParams.get("garantias") === "true";

    const assignments = await getSupervisorAssignments(ctx.uid, ymd);
    const [allItems, updateInfo] = await Promise.all([
      listSupervisorOrders(assignments.cuadrillasHoy, ymd),
      getLatestOrdersUpdateInfoForSupervisor(),
    ]);
    const items = soloGarantias
      ? allItems.filter((o) => o.isGarantia)
      : allItems.filter((o) => !o.isGarantia);

    return NextResponse.json({ ok: true, ymd, updateInfo, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
