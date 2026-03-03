import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

function createRequestId() {
  return `authme_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function resolveRequestId() {
  try {
    const h = await headers();
    const fromHeader =
      h.get("x-request-id") ||
      h.get("x-correlation-id") ||
      h.get("x-vercel-id") ||
      h.get("traceparent");
    if (fromHeader) return String(fromHeader);
  } catch {}
  return createRequestId();
}

function metricsLog(payload: Record<string, unknown>) {
  try {
    // eslint-disable-next-line no-console
    console.log(payload);
  } catch {}
}

export async function GET() {
  const startedAt = Date.now();
  const requestId = await resolveRequestId();
  try {
    const session = await getServerSession({ requestId });
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

    const snap = await adminDb().collection("usuarios").doc(session.uid).get();
    const data = snap.exists ? (snap.data() as any) : {};
    const nombres = String(data?.nombres || "").trim();
    const apellidos = String(data?.apellidos || "").trim();
    const nombre = `${nombres} ${apellidos}`.trim() || session.uid;

    const response = NextResponse.json({
      ok: true,
      uid: session.uid,
      nombre,
      isAdmin: session.isAdmin,
      roles: session.access.roles || [],
      areas: session.access.areas || [],
    });
    metricsLog({
      tag: "auth_me_metrics",
      requestId,
      durationMs: Date.now() - startedAt,
      nodeEnv: process.env.NODE_ENV,
      status: "ok",
    });
    return response;
  } catch (e: any) {
    metricsLog({
      tag: "auth_me_metrics",
      requestId,
      durationMs: Date.now() - startedAt,
      nodeEnv: process.env.NODE_ENV,
      status: "error",
      error: String(e?.code || e?.message || "ERROR"),
    });
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
