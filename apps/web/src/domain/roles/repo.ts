import { adminDb } from "@/lib/firebase/admin";

export type RoleDoc = {
  id: string;
  nombre: string;
  descripcion: string;
  estado: "ACTIVO" | "INACTIVO";
  permisos: string[];
  areasDefault: string[];
  audit: any;
};

const col = () => adminDb().collection("roles");

export async function rolesList() {
  const snap = await col().orderBy("audit.createdAt", "desc").get();
  return snap.docs.map(d => d.data() as RoleDoc);
}

export async function roleGet(id: string) {
  const doc = await col().doc(id).get();
  return doc.exists ? (doc.data() as RoleDoc) : null;
}

export async function roleCreate(input: RoleDoc) {
  await col().doc(input.id).set(input, { merge: false });
}

export async function roleUpdate(id: string, patch: Partial<RoleDoc>) {
  await col().doc(id).set(patch, { merge: true });
}
