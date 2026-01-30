import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

export type AccessDoc = {
  roles: string[];
  areas: string[];
  estadoAcceso: "HABILITADO" | "INHABILITADO";
};

export type ServerSession = {
  uid: string;
  access: AccessDoc;
  isAdmin: boolean;
};

const COOKIE_NAME = "__session";

export async function getServerSession(): Promise<ServerSession | null> {
  const cookieStore = await cookies(); // ✅ importante en tu Next
  const cookie = cookieStore.get(COOKIE_NAME)?.value;
  if (!cookie) return null;

  // Verifica cookie y extrae UID
  const decoded = await adminAuth().verifySessionCookie(cookie, true);
  const uid = decoded.uid;

  // Lee access doc (RBAC)
  const snap = await adminDb().collection("usuarios_access").doc(uid).get();
  if (!snap.exists) return null;

  const data = snap.data() as Partial<AccessDoc>;

  const access: AccessDoc = {
    roles: Array.isArray(data.roles) ? data.roles : [],
    areas: Array.isArray(data.areas) ? data.areas : [],
    estadoAcceso: data.estadoAcceso === "HABILITADO" ? "HABILITADO" : "INHABILITADO",
  };

  return {
    uid,
    access,
    isAdmin: access.roles.includes("ADMIN"),
  };
}
