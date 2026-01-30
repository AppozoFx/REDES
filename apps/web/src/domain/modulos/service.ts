import { adminDb } from "@/lib/firebase/admin";

export type ModuleDoc = {
  id: string;
  key: string;
  nombre: string;
  descripcion: string;
  estado: "ACTIVO" | "INACTIVO";
  orden: number;
};

export async function listActiveModules(): Promise<ModuleDoc[]> {
  const snap = await adminDb()
    .collection("modulos")
    .where("estado", "==", "ACTIVO")
    .orderBy("orden", "asc")
    .get();

  return snap.docs.map((d) => d.data() as ModuleDoc);
}
