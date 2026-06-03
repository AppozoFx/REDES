import { NextResponse } from "next/server";
import { getMobileAuthContext } from "@/core/auth/mobile";
import { getSupervisorContext, getSupervisorAssignments, saveSupervisorSupervision } from "@/core/auth/mobileSupervisor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
}

export async function POST(req: Request) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

    const ctx = await getSupervisorContext(mobile);
    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.orderId || "").trim();
    const notas = String(body?.notas || "").trim();
    const observaciones = String(body?.observaciones || "").trim();

    if (!orderId) return NextResponse.json({ ok: false, error: "MISSING_ORDER_ID" }, { status: 400 });

    const ymd = todayLimaYmd();
    const assignments = await getSupervisorAssignments(ctx.uid, ymd);
    await saveSupervisorSupervision(orderId, ctx.uid, assignments.cuadrillasHoy, { notas, observaciones });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
