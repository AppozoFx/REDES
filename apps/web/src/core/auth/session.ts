import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase/admin";
import { adminDb } from "@/lib/firebase/admin";
import { getUserAccessContextCached } from "@/core/auth/accessContext.cached";

export type ServerSession = {
  uid: string;
  access: {
    roles: string[];
    areas: string[];
    permissions: string[]; // directPermissions (doc)
    estadoAcceso: "HABILITADO" | "INHABILITADO";
  };
  isAdmin: boolean;
  permissions: string[]; // efectivos
};

const COOKIE_NAME = "__session";
const INACTIVITY_MS = 2 * 60 * 60 * 1000; // 2 horas
const AUTH_DEBUG = process.env.NODE_ENV !== "production";
const SESSION_METRICS_ENABLED = process.env.SESSION_METRICS_ENABLED !== "false";
const SESSION_METRICS_TTL_MS = 10 * 60 * 1000;

const sessionCallsByRequestId = new Map<string, { calls: number; updatedAt: number }>();
let sessionMetricsSeq = 0;

function debugLog(level: "log" | "warn" | "error", message: string, meta?: Record<string, unknown>) {
  if (!AUTH_DEBUG) return;
  try {
    // eslint-disable-next-line no-console
    console[level](message, meta || {});
  } catch {}
}

function metricsLog(payload: Record<string, unknown>) {
  if (!SESSION_METRICS_ENABLED) return;
  try {
    // eslint-disable-next-line no-console
    console.log(payload);
  } catch {}
}

function pruneSessionMetricsCounters(now: number) {
  for (const [key, value] of sessionCallsByRequestId.entries()) {
    if (now - value.updatedAt > SESSION_METRICS_TTL_MS) {
      sessionCallsByRequestId.delete(key);
    }
  }
}

function createSessionRequestId() {
  sessionMetricsSeq = (sessionMetricsSeq + 1) % 1_000_000_000;
  return `sess_${Date.now().toString(36)}_${sessionMetricsSeq.toString(36)}`;
}

function markSessionCall(requestId: string) {
  const now = Date.now();
  pruneSessionMetricsCounters(now);
  const current = sessionCallsByRequestId.get(requestId);
  const nextCalls = (current?.calls || 0) + 1;
  sessionCallsByRequestId.set(requestId, { calls: nextCalls, updatedAt: now });
  return nextCalls;
}

function toMillis(v: any): number {
  if (!v) return 0;
  if (typeof v?.toMillis === "function") return Number(v.toMillis() || 0);
  if (typeof v?.toDate === "function") {
    const d = v.toDate();
    return d instanceof Date ? d.getTime() : 0;
  }
  if (v instanceof Date) return v.getTime();
  return 0;
}

export async function getServerSession(options?: {
  forceAccessRefresh?: boolean;
  requestId?: string;
}): Promise<ServerSession | null> {
  const totalStart = Date.now();
  const requestId = options?.requestId || createSessionRequestId();
  const sessionCallIndex = markSessionCall(requestId);

  try {
    let cookieStore: Awaited<ReturnType<typeof cookies>>;
    try {
      cookieStore = await cookies();
    } catch (e: any) {
      debugLog("error", "[session] cookies() failed", {
        message: String(e?.message || e || "ERROR"),
        code: String(e?.code || ""),
      });
      metricsLog({
        tag: "session_metrics",
        requestId,
        sessionCallIndex,
        stage: "total",
        durationMs: Date.now() - totalStart,
        nodeEnv: process.env.NODE_ENV,
        status: "error",
        error: String(e?.code || e?.message || "COOKIES_FAILED"),
      });
      return null;
    }

    const cookie = cookieStore.get(COOKIE_NAME)?.value;
    debugLog("log", "[session] cookie read", {
      present: Boolean(cookie),
      len: cookie ? cookie.length : 0,
    });
    if (!cookie) {
      debugLog("warn", "[session] missing cookie", {
        cookieName: COOKIE_NAME,
        nodeEnv: process.env.NODE_ENV,
      });
      metricsLog({
        tag: "session_metrics",
        requestId,
        sessionCallIndex,
        stage: "total",
        durationMs: Date.now() - totalStart,
        nodeEnv: process.env.NODE_ENV,
        status: "no_cookie",
      });
      return null;
    }

    let decoded: any;
    const verifyStart = Date.now();
    try {
      decoded = await adminAuth().verifySessionCookie(cookie, true);
      metricsLog({
        tag: "session_metrics",
        requestId,
        sessionCallIndex,
        stage: "verify",
        durationMs: Date.now() - verifyStart,
        nodeEnv: process.env.NODE_ENV,
      });
    } catch (e: any) {
      metricsLog({
        tag: "session_metrics",
        requestId,
        sessionCallIndex,
        stage: "verify",
        durationMs: Date.now() - verifyStart,
        nodeEnv: process.env.NODE_ENV,
        status: "error",
        error: String(e?.code || e?.message || "VERIFY_FAILED"),
      });
      debugLog("error", "[session] verifySessionCookie failed", {
        message: String(e?.message || e || "ERROR"),
        code: String(e?.code || ""),
        nodeEnv: process.env.NODE_ENV,
      });
      return null;
    }
    const uid = decoded.uid;

    // Invalida por inactividad (sin heartbeat/focus) mayor a 2h.
    const presenceStart = Date.now();
    try {
      const pSnap = await adminDb().collection("usuarios_presencia").doc(uid).get();
      metricsLog({
        tag: "session_metrics",
        requestId,
        sessionCallIndex,
        stage: "presence",
        durationMs: Date.now() - presenceStart,
        nodeEnv: process.env.NODE_ENV,
      });
      if (pSnap.exists) {
        const p = pSnap.data() as any;
        const lastSeenMs = toMillis(p?.lastSeenAt) || toMillis(p?.updatedAt);
        debugLog("log", "[session] presence lastSeen", {
          uid,
          lastSeenMs,
          ageMs: lastSeenMs ? Date.now() - lastSeenMs : null,
        });
        if (lastSeenMs > 0 && Date.now() - lastSeenMs > INACTIVITY_MS) return null;
      }
    } catch (presenceError: any) {
      metricsLog({
        tag: "session_metrics",
        requestId,
        sessionCallIndex,
        stage: "presence",
        durationMs: Date.now() - presenceStart,
        nodeEnv: process.env.NODE_ENV,
        status: "error",
        error: String(presenceError?.code || presenceError?.message || "PRESENCE_ERROR"),
      });
    }

    let ctx: Awaited<ReturnType<typeof getUserAccessContextCached>> | null = null;
    const accessContextStart = Date.now();
    try {
      ctx = await getUserAccessContextCached(uid, {
        forceRefresh: options?.forceAccessRefresh === true,
      });
      metricsLog({
        tag: "session_metrics",
        requestId,
        sessionCallIndex,
        stage: "access_context",
        durationMs: Date.now() - accessContextStart,
        nodeEnv: process.env.NODE_ENV,
      });
    } catch (e: any) {
      metricsLog({
        tag: "session_metrics",
        requestId,
        sessionCallIndex,
        stage: "access_context",
        durationMs: Date.now() - accessContextStart,
        nodeEnv: process.env.NODE_ENV,
        status: "error",
        error: String(e?.code || e?.message || "ACCESS_CONTEXT_ERROR"),
      });
      debugLog("error", "[session] access context error", {
        uid,
        message: String(e?.message || e || "ERROR"),
        code: String(e?.code || ""),
      });
      return null;
    }
    if (!ctx) {
      debugLog("warn", "[session] access context missing", { uid });
      metricsLog({
        tag: "session_metrics",
        requestId,
        sessionCallIndex,
        stage: "total",
        durationMs: Date.now() - totalStart,
        nodeEnv: process.env.NODE_ENV,
        status: "access_context_missing",
      });
      return null;
    }

    const isAdmin = ctx.roles.includes("ADMIN");

    const session = {
      uid,
      access: {
        roles: ctx.roles,
        areas: ctx.areas,
        permissions: ctx.directPermissions,
        estadoAcceso: ctx.estadoAcceso,
      },
      isAdmin,
      permissions: ctx.effectivePermissions,
    };
    debugLog("log", "[session] ok", {
      uid,
      isAdmin,
      roles: session.access.roles?.length || 0,
      areas: session.access.areas?.length || 0,
      perms: session.permissions?.length || 0,
    });
    metricsLog({
      tag: "session_metrics",
      requestId,
      sessionCallIndex,
      stage: "total",
      durationMs: Date.now() - totalStart,
      nodeEnv: process.env.NODE_ENV,
      status: "ok",
    });
    return session;
  } catch (e: any) {
    metricsLog({
      tag: "session_metrics",
      requestId,
      sessionCallIndex,
      stage: "total",
      durationMs: Date.now() - totalStart,
      nodeEnv: process.env.NODE_ENV,
      status: "error",
      error: String(e?.code || e?.message || "UNEXPECTED_ERROR"),
    });
    debugLog("error", "[session] unexpected error", {
      nodeEnv: process.env.NODE_ENV,
      message: String(e?.message || e || "ERROR"),
      code: String(e?.code || ""),
    });
    return null;
  }
}

