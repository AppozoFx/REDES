import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase/admin";
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

export async function getServerSession(): Promise<ServerSession | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(COOKIE_NAME)?.value;
  if (!cookie) return null;

  const decoded = await adminAuth().verifySessionCookie(cookie, true);
  const uid = decoded.uid;

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
}
