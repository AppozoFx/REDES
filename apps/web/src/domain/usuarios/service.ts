import { adminAuth, adminDb } from "@/lib/firebase/admin";

export type UserProfileDoc = {
  uid: string;
  displayName?: string;
  email?: string;
  phoneNumber?: string;
  estadoPerfil?: "ACTIVO" | "INACTIVO";
  audit?: any;
};

export type UserAccessDoc = {
  roles: string[];
  areas: string[];
  estadoAcceso: "HABILITADO" | "INHABILITADO";
  permissions: string[];
  audit: any;
};

export async function listUsuariosAccess(limit = 50) {
  const snap = await adminDb()
    .collection("usuarios_access")
    .orderBy("audit.createdAt", "desc")
    .limit(limit)
    .get();

  return snap.docs.map((d) => ({ uid: d.id, ...(d.data() as UserAccessDoc) }));
}

export async function getUserProfile(uid: string) {
  const doc = await adminDb().collection("usuarios").doc(uid).get();
  return doc.exists ? (doc.data() as UserProfileDoc) : null;
}

export async function getUserAccess(uid: string) {
  const doc = await adminDb().collection("usuarios_access").doc(uid).get();
  return doc.exists ? (doc.data() as UserAccessDoc) : null;
}

export async function createAuthUser(params: {
  email: string;
  password: string;
  displayName?: string;
}) {
  const rec = await adminAuth().createUser({
    email: params.email,
    password: params.password,
    displayName: params.displayName || undefined,
  });
  return rec; // contains uid
}
