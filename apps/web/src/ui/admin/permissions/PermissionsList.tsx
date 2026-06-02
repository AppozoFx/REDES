import Link from "next/link";
import type { Permission } from "@/types/permissions";
import { permissionsDisableAction, permissionsEnableAction } from "@/app/(protected)/admin/permissions/actions";

export function PermissionsList({ items }: { items: Permission[] }) {
  const grouped = items.reduce<Record<string, Permission[]>>((acc, p) => {
    const key = p.modulo || "OTROS";
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  const modules = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white py-14 text-slate-400 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500">
        <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <p className="text-sm">No hay permisos registrados.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {modules.map((modulo) => {
        const perms = grouped[modulo];
        const activos = perms.filter((p) => p.estado === "ACTIVO").length;

        return (
          <div key={modulo} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
            {/* Module header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
                  <svg className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{modulo}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                  {activos} activos
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {perms.length} total
                </span>
              </div>
            </div>

            {/* Permissions table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-700/60">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">ID</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Nombre</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Estado</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {perms.map((p, i) => {
                    const isActivo = p.estado === "ACTIVO";
                    return (
                      <tr
                        key={p.id}
                        className={`transition-colors hover:bg-blue-50/40 dark:hover:bg-blue-900/10 ${
                          i % 2 !== 0 ? "bg-slate-50/40 dark:bg-slate-800/10" : ""
                        }`}
                      >
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/admin/permissions/${p.id}`}
                            className="inline-flex items-center rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                          >
                            {p.id}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{p.nombre}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              isActivo
                                ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-300"
                                : "border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/60 dark:bg-rose-900/30 dark:text-rose-300"
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${isActivo ? "bg-emerald-500" : "bg-rose-500"}`} />
                            {isActivo ? "Activo" : "Inactivo"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {isActivo ? (
                            <form action={permissionsDisableAction.bind(null, p.id)}>
                              <button className="inline-flex h-7 items-center rounded-lg border border-rose-200 bg-white px-2.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 dark:border-rose-800/60 dark:bg-slate-800 dark:text-rose-400 dark:hover:bg-rose-900/20">
                                Desactivar
                              </button>
                            </form>
                          ) : (
                            <form action={permissionsEnableAction.bind(null, p.id)}>
                              <button className="inline-flex h-7 items-center rounded-lg border border-emerald-200 bg-white px-2.5 text-xs font-medium text-emerald-600 transition hover:bg-emerald-50 dark:border-emerald-800/60 dark:bg-slate-800 dark:text-emerald-400 dark:hover:bg-emerald-900/20">
                                Activar
                              </button>
                            </form>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
