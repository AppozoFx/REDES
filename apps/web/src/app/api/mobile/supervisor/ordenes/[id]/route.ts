import { NextResponse } from "next/server";
import { getMobileAuthContext } from "@/core/auth/mobile";
import { getSupervisorContext, getSupervisorAssignments, getSupervisorOrderDetail } from "@/core/auth/mobileSupervisor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const mobile = await getMobileAuthContext(req);
    if (!mobile) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

    const ctx = await getSupervisorContext(mobile);
    const ymd = todayLimaYmd();
    const assignments = await getSupervisorAssignments(ctx.uid, ymd);
    const detail = await getSupervisorOrderDetail(id, assignments.cuadrillasHoy);

    if (!detail) return NextResponse.json({ ok: false, error: "ORDER_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ ok: true, item: detail });
  } catch (e: any) {
    const status = String(e?.message || "").includes("NOT_FOUND") ? 404 : 500;
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status });
  }
}
