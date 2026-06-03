import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getMobileAuthContext } from "@/core/auth/mobile";
import { getSupervisorContext, getSupervisorAssignments } from "@/core/auth/mobileSupervisor";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

export async function POST(req: Request) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

    const ctx = await getSupervisorContext(mobile);
    const ymd = todayLimaYmd();
    const assignments = await getSupervisorAssignments(ctx.uid, ymd);

    const body = await req.json();
    const ordenId = clean(body?.ordenId);
    if (!ordenId) return NextResponse.json({ ok: false, error: "ORDEN_ID_REQUIRED" }, { status: 400 });

    const ref = adminDb().collection("ordenes").doc(ordenId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: "ORDEN_NOT_FOUND" }, { status: 404 });

    const data = snap.data() as any;
    const orderCuadrillaId = clean(data?.cuadrillaId);
    if (assignments.cuadrillasHoy.length && !assignments.cuadrillasHoy.includes(orderCuadrillaId)) {
      return NextResponse.json({ ok: false, error: "ORDER_NOT_IN_SUPERVISOR_CUADRILLAS" }, { status: 403 });
    }

    const payload = {
      motivoGarantia: clean(body?.motivoGarantia),
      diagnosticoGarantia: clean(body?.diagnosticoGarantia),
      solucionGarantia: clean(body?.solucionGarantia),
      responsableGarantia: clean(body?.responsableGarantia),
      casoGarantia: clean(body?.casoGarantia),
      imputadoGarantia: clean(body?.imputadoGarantia),
      garantiaUpdatedBy: ctx.uid,
      garantiaUpdatedAt: FieldValue.serverTimestamp(),
      "audit.updatedAt": FieldValue.serverTimestamp(),
      "audit.updatedBy": ctx.uid,
    };

    await ref.set(payload, { merge: true });
    return NextResponse.json({ ok: true, ordenId });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
