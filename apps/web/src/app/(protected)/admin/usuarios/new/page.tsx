import { requirePermission } from "@/core/auth/guards";
import { adminDb } from "@/lib/firebase/admin";
import { FormCreateUsuario } from "./FormCreateUsuario";

export default async function NewUsuarioPage() {
  await requirePermission("USERS_CREATE");

  const rolesSnap = await adminDb()
    .collection("roles")
    .where("estado", "==", "ACTIVO")
    .get();

  // No listar rol ADMIN en el formulario de creación
  const roles = rolesSnap.docs.map(d => d.id).filter(r => r !== "ADMIN");


  const modSnap = await adminDb()
    .collection("modulos")
    .where("estado", "==", "ACTIVO")
    .orderBy("orden", "asc")
    .get();

  const areas = modSnap.docs
    .map((d) => (d.data() as any).key as string)
    .filter((k) => !["ROLES", "MODULOS", "USUARIOS", "PERMISSIONS"].includes(k));

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Nuevo usuario</h1>

      <FormCreateUsuario roles={roles} areas={areas} />
    </div>
  );
}
