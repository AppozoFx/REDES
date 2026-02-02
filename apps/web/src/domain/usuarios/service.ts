import { adminAuth, adminDb } from "@/lib/firebase/admin";
import type { HomeUserCreateInput } from "./schema";

export type UserProfileDoc = {
  uid: string;
  displayName?: string;
  email?: string;
  phoneNumber?: string;
  estadoPerfil?: "ACTIVO" | "INACTIVO";
  audit?: any;
};

export function ymdToLocalDateStart(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map((n) => Number(n));
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

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

export async function createUserFromHome(input: HomeUserCreateInput, actorUid: string) {
  // Seguridad extra: no permitir ADMIN como rol inicial
  if (input.rolInicial === "ADMIN") {
    throw new Error("No se permite crear usuarios con rol ADMIN desde Home.");
  }

  // 1) Crear usuario en Auth
  const userRecord = await adminAuth().createUser({
    email: input.email,
    password: input.password,
  });

  const uid = userRecord.uid;
  const db = adminDb();
  const now = new Date();

  // 2) Guardar perfil y acceso (timestamps: Date → Firestore Timestamp)
  const perfil = {
    nombres: input.nombres,
    apellidos: input.apellidos,
    tipoDoc: input.tipoDoc,
    nroDoc: input.nroDoc,
    celular: input.celular,
    direccion: input.direccion,
    genero: input.genero,
    nacionalidad: input.nacionalidad,

    // ✅ Persistir como Timestamp con hora local normalizada
    fIngreso: ymdToLocalDateStart(input.fIngreso),
    fNacimiento: ymdToLocalDateStart(input.fNacimiento),

    estadoPerfil: "ACTIVO",

    audit: {
      createdAt: now,
      createdBy: actorUid,
      updatedAt: now,
      updatedBy: actorUid,
    },
  };

  const access = {
    roles: [input.rolInicial],
    areas: [],
    permissions: [],
    estadoAcceso: "HABILITADO",
    audit: {
      createdAt: now,
      createdBy: actorUid,
      updatedAt: now,
      updatedBy: actorUid,
    },
  };

  const batch = db.batch();
  batch.set(db.collection("usuarios").doc(uid), perfil, { merge: false });
  batch.set(db.collection("usuarios_access").doc(uid), access, { merge: false });
  await batch.commit();

  return { uid };
}