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

export async function getServerSession(): Promise<ServerSession | null> {
  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(COOKIE_NAME)?.value;
    if (!cookie) return null;

    const decoded = await adminAuth().verifySessionCookie(cookie, true);
    const uid = decoded.uid;

    // Invalida por inactividad (sin heartbeat/focus) mayor a 2h.
    try {
      const pSnap = await adminDb().collection("usuarios_presencia").doc(uid).get();
      if (pSnap.exists) {
        const p = pSnap.data() as any;
        const lastSeenMs = toMillis(p?.lastSeenAt) || toMillis(p?.updatedAt);
        if (lastSeenMs > 0 && Date.now() - lastSeenMs > INACTIVITY_MS) return null;
      }
    } catch {}

    const ctx = await getUserAccessContextCached(uid);
    if (!ctx) return null;

    const isAdmin = ctx.roles.includes("ADMIN");

    return {
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
  } catch {
    return null;
  }
}
