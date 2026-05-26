import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { getUserAccessContextCached } from "@/core/auth/accessContext.cached";

export type MobileAuthContext = {
  uid: string;
  email: string;
  access: NonNullable<Awaited<ReturnType<typeof getUserAccessContextCached>>>;
};

function getBearerToken(req: Request) {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

export async function getMobileAuthContext(req: Request): Promise<MobileAuthContext | null> {
  const token = getBearerToken(req);
  if (!token) return null;

  const decoded = await adminAuth().verifyIdToken(token, true);
  const uid = String(decoded?.uid || "").trim();
  if (!uid) return null;

  const access = await getUserAccessContextCached(uid);
  if (!access || access.estadoAcceso !== "HABILITADO") return null;

  return {
    uid,
    email: String(decoded?.email || ""),
    access,
  };
}

export async function getMobileProfile(uid: string) {
  const snap = await adminDb().collection("usuarios").doc(uid).get();
  const data = snap.exists ? (snap.data() as any) : {};
  const nombres = String(data?.nombres || "").trim();
  const apellidos = String(data?.apellidos || "").trim();
  const nombre = `${nombres} ${apellidos}`.trim() || uid;
  return {
    uid,
    nombre,
    data,
  };
}
