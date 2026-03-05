import Link from "next/link";
import { requireAuth, requirePermission } from "@/core/auth/guards";
import { listRoles } from "@/domain/roles/repo";
import UserCreateForm from "@/ui/home/usuarios/UserCreateForm";

export default async function HomeUsuariosNewPage() {
  await requireAuth();
  await requirePermission("USERS_CREATE");

  const roles = await listRoles(200); // all roles
  
  


  const rolesAllowed = roles
    .filter((r: any) => r.id !== "ADMIN" && (r.estado ?? "ACTIVO") === "ACTIVO")
    .map((r: any) => ({ id: r.id, nombre: r.nombre ?? r.id }));

  return (
    <div className="mx-auto max-w-5xl space-y-4 text-slate-900 dark:text-slate-100">
      <div className="flex items-center">
        <Link
          href="/home/usuarios"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <span aria-hidden>←</span>
          Regresar a usuarios
        </Link>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-2xl font-semibold">Crear usuario</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Se crea en Auth + usuarios + usuarios_access. Fechas se guardan como Timestamp (hora local).
        </p>
      </section>

      <UserCreateForm rolesAllowed={rolesAllowed} cancelHref="/home/usuarios" />
    </div>
  );
}
