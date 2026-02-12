import { adminDb } from "@/lib/firebase/admin";

export type ModuleDoc = {
  id: string;
  key: string;
  nombre: string;
  descripcion: string;
  estado: "ACTIVO" | "INACTIVO";
  orden: number;
  audit: any;
};

const col = () => adminDb().collection("modulos");

export async function modulesList() {
  const snap = await col().orderBy("orden", "asc").get();
  return snap.docs.map(d => d.data() as ModuleDoc);
}

export async function moduleGet(id: string) {
  const doc = await col().doc(id).get();
  return doc.exists ? (doc.data() as ModuleDoc) : null;
}

export async function moduleCreate(input: ModuleDoc) {
  await col().doc(input.id).set(input, { merge: false });
}

export async function moduleUpdate(id: string, patch: Partial<ModuleDoc>) {
  await col().doc(id).set(patch, { merge: true });
}
