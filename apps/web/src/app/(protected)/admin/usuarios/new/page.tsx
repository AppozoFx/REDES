import Link from "next/link";
import { requirePermission } from "@/core/auth/guards";
import { adminDb } from "@/lib/firebase/admin";
import { FormCreateUsuario } from "./FormCreateUsuario";

export default async function NewUsuarioPage() {
  await requirePermission("USERS_CREATE");

  const rolesSnap = await adminDb().collection("roles").where("estado", "==", "ACTIVO").get();
  const roles = rolesSnap.docs.map((d) => d.id).filter((r) => r !== "ADMIN");

  const modSnap = await adminDb().collection("modulos").where("estado", "==", "ACTIVO").orderBy("orden", "asc").get();

  const areas = modSnap.docs
    .map((d) => (d.data() as any).key as string)
    .filter((k) => !["ROLES", "MODULOS", "USUARIOS", "PERMISSIONS"].includes(k));

  return (
    <div className="mx-auto max-w-5xl space-y-4 text-slate-900 dark:text-slate-100">
      <div className="flex items-center">
        <Link
          href="/admin/usuarios"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <span aria-hidden>←</span>
          Regresar a usuarios
        </Link>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-2xl font-semibold">Nuevo usuario</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Registra perfil, acceso y asignaciones iniciales del usuario.</p>
      </section>

      <FormCreateUsuario roles={roles} areas={areas} cancelHref="/admin/usuarios" />
    </div>
  );
}
