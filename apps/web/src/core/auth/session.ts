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

function debugLog(level: "log" | "warn" | "error", message: string, meta?: Record<string, unknown>) {
  if (!AUTH_DEBUG) return;
  try {
    // eslint-disable-next-line no-console
    console[level](message, meta || {});
  } catch {}
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
}): Promise<ServerSession | null> {
  try {
    let cookieStore: Awaited<ReturnType<typeof cookies>>;
    try {
      cookieStore = await cookies();
    } catch (e: any) {
      debugLog("error", "[session] cookies() failed", {
        message: String(e?.message || e || "ERROR"),
        code: String(e?.code || ""),
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
      return null;
    }

    let decoded: any;
    try {
      decoded = await adminAuth().verifySessionCookie(cookie, true);
    } catch (e: any) {
      debugLog("error", "[session] verifySessionCookie failed", {
        message: String(e?.message || e || "ERROR"),
        code: String(e?.code || ""),
        nodeEnv: process.env.NODE_ENV,
      });
      return null;
    }
    const uid = decoded.uid;

    // Invalida por inactividad (sin heartbeat/focus) mayor a 2h.
    try {
      const pSnap = await adminDb().collection("usuarios_presencia").doc(uid).get();
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
    } catch {}

    let ctx: Awaited<ReturnType<typeof getUserAccessContextCached>> | null = null;
    try {
      ctx = await getUserAccessContextCached(uid, {
        forceRefresh: options?.forceAccessRefresh === true,
      });
    } catch (e: any) {
      debugLog("error", "[session] access context error", {
        uid,
        message: String(e?.message || e || "ERROR"),
        code: String(e?.code || ""),
      });
      return null;
    }
    if (!ctx) {
      debugLog("warn", "[session] access context missing", { uid });
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
    return session;
  } catch (e: any) {
    debugLog("error", "[session] unexpected error", {
      nodeEnv: process.env.NODE_ENV,
      message: String(e?.message || e || "ERROR"),
      code: String(e?.code || ""),
    });
    return null;
  }
}
