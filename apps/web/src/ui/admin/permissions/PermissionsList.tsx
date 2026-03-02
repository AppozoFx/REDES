import Link from "next/link";
import type { Permission } from "@/types/permissions";
import { permissionsDisableAction, permissionsEnableAction } from "@/app/(protected)/admin/permissions/actions";

export function PermissionsList({ items }: { items: Permission[] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 dark:bg-slate-800">
            <tr>
              <th className="p-3 text-left font-semibold">ID</th>
              <th className="p-3 text-left font-semibold">Modulo</th>
              <th className="p-3 text-left font-semibold">Nombre</th>
              <th className="p-3 text-left font-semibold">Estado</th>
              <th className="p-3 text-right font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-t border-slate-200 dark:border-slate-700">
                <td className="p-3 font-mono text-xs">
                  <Link className="underline decoration-slate-400 underline-offset-2 dark:decoration-slate-500" href={`/admin/permissions/${p.id}`}>
                    {p.id}
                  </Link>
                </td>
                <td className="p-3">{p.modulo}</td>
                <td className="p-3">{p.nombre}</td>
                <td className="p-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      p.estado === "ACTIVO"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                        : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                    }`}
                  >
                    {p.estado}
                  </span>
                </td>
                <td className="p-3 text-right">
                  {p.estado === "ACTIVO" ? (
                    <form action={permissionsDisableAction.bind(null, p.id)}>
                      <button className="inline-flex h-8 items-center rounded-lg border border-rose-300 px-3 text-xs font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-900/30">
                        Desactivar
                      </button>
                    </form>
                  ) : (
                    <form action={permissionsEnableAction.bind(null, p.id)}>
                      <button className="inline-flex h-8 items-center rounded-lg border border-emerald-300 px-3 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/30">
                        Activar
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-500 dark:text-slate-400">No hay permisos registrados.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
