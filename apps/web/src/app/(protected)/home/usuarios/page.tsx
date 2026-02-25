import Link from "next/link";
import { requireAuth, requirePermission } from "@/core/auth/guards";
import { listUsuariosForHome } from "@/domain/usuarios/repo";

export default async function HomeUsuariosPage() {
  const session = await requireAuth();
  await requirePermission("USERS_LIST");

  const canCreate = session.permissions?.includes("USERS_CREATE") ?? false;
  const rows = await listUsuariosForHome(60);

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

      <div className="overflow-auto rounded border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 dark:bg-slate-800 dark:text-slate-100">
            <tr className="text-left">
              <th className="p-2">Nombre</th>
              <th className="p-2">Roles</th>
              <th className="p-2">Áreas</th>
              <th className="p-2">Estado</th>
              <th className="p-2">Acción</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.uid} className="border-t border-slate-200 dark:border-slate-700">
                <td className="p-2">
                  {u.nombres} {u.apellidos}
                </td>
                <td className="p-2">{(u.roles ?? []).join(", ")}</td>
                <td className="p-2">{(u.areas ?? []).join(", ")}</td>
                <td className="p-2">{u.estadoAcceso}</td>
                <td className="p-2">
                  <Link className="underline" href={`/home/usuarios/${u.uid}`}>
                    Ver / editar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        En Home se edita solo perfil (nombres/apellidos/contacto). RBAC se gestiona en Admin.
      </p>
    </div>
  );
}
