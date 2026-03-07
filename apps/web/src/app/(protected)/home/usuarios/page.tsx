import Link from "next/link";
import { requireAuth, requirePermission } from "@/core/auth/guards";
import { listUsuariosForHome } from "@/domain/usuarios/repo";
import HomeUsuariosTableClient from "./HomeUsuariosTableClient";

export default async function HomeUsuariosPage() {
  const session = await requireAuth();
  await requirePermission("USERS_LIST");

  const canCreate = session.permissions?.includes("USERS_CREATE") ?? false;
  const rowsRaw = await listUsuariosForHome();
  const rows = rowsRaw.map((r) => ({
    uid: r.uid,
    nombres: String(r.nombres ?? ""),
    apellidos: String(r.apellidos ?? ""),
    roles: Array.isArray(r.roles) ? r.roles.map((x: unknown) => String(x)) : [],
    areas: Array.isArray(r.areas) ? r.areas.map((x: unknown) => String(x)) : [],
    estadoAcceso: String(r.estadoAcceso ?? "INHABILITADO"),
  }));

  return (
    <div className="space-y-4 text-slate-900 dark:text-slate-100">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Usuarios</h1>

        <div className="flex items-center gap-2">
          {canCreate && (
            <Link
              className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              href="/home/usuarios/new"
            >
              Crear
            </Link>
          )}

          <Link
            className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            href="/home"
          >
            Inicio
          </Link>
        </div>
      </div>

      <HomeUsuariosTableClient rows={rows} />

      <p className="text-xs text-slate-500 dark:text-slate-400">
        En Home se edita solo perfil (nombres/apellidos/contacto). RBAC se gestiona en Admin.
      </p>
    </div>
  );
}
