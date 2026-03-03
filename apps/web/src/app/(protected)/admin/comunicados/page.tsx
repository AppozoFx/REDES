import Link from "next/link";
import { requirePermission } from "@/core/auth/guards";
import { listComunicados, syncBirthdayComunicadoToday } from "@/domain/comunicados/repo";
import LocalTime from "@/ui/LocalTime";
import { comunicadosToggleAction, syncBirthdayComunicadoAction } from "./actions";

const PERM = "ANNOUNCEMENTS_MANAGE";

function toMillis(ts: any): number | null {
  try {
    const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
    return d ? d.getTime() : null;
  } catch {
    return null;
  }
}

function labelTarget(target: string) {
  if (target === "ROLES") return "Por roles";
  if (target === "AREAS") return "Por areas";
  if (target === "USERS") return "Usuarios puntuales";
  return "Todos";
}

export default async function ComunicadosAdminListPage() {
  const session = await requirePermission(PERM);

  try {
    await syncBirthdayComunicadoToday(session.uid);
  } catch {}

  const rows = await listComunicados(120);
  const activos = rows.filter((r: any) => r?.estado === "ACTIVO").length;
  const autoCumple = rows.filter((r: any) => r?.autoType === "BIRTHDAY").length;
  const obligatorios = rows.filter((r: any) => !!r?.obligatorio).length;

  return (
    <div className="space-y-5 p-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Comunicados</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Panel moderno para crear comunicados en texto, imagen y enlace. Incluye sincronizacion automatica de cumpleanos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={syncBirthdayComunicadoAction}>
              <button
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
                type="submit"
              >
                Sincronizar cumpleanos
              </button>
            </form>
            <Link
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
              href="/admin/comunicados/new"
            >
              Nuevo comunicado
            </Link>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="text-xs text-slate-500 dark:text-slate-400">Activos</div>
            <div className="mt-1 text-2xl font-semibold">{activos}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="text-xs text-slate-500 dark:text-slate-400">Obligatorios</div>
            <div className="mt-1 text-2xl font-semibold">{obligatorios}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="text-xs text-slate-500 dark:text-slate-400">Cumpleanos automaticos</div>
            <div className="mt-1 text-2xl font-semibold">{autoCumple}</div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="px-4 py-3">Comunicado</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Alcance</th>
                <th className="px-4 py-3">Detalle</th>
                <th className="px-4 py-3">Creado</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c: any) => {
                const id = String(c?.id ?? "").trim();
                const estado = c?.estado === "ACTIVO" ? "ACTIVO" : "INACTIVO";
                const nextEstado = estado === "ACTIVO" ? "INACTIVO" : "ACTIVO";
                const isAutoBirthday = c?.autoType === "BIRTHDAY";

                return (
                  <tr key={id || String(c.titulo)} className="border-t border-slate-200 dark:border-slate-700">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800 dark:text-slate-100">{c.titulo}</div>
                      <div className="line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
                        {String(c.cuerpo ?? "").slice(0, 130)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          estado === "ACTIVO"
                            ? "rounded-md bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                            : "rounded-md bg-rose-100 px-2 py-1 text-xs font-medium text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                        }
                      >
                        {estado}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-600">
                        {labelTarget(String(c?.target ?? "ALL"))}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {c?.obligatorio ? (
                          <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                            Obligatorio
                          </span>
                        ) : null}
                        {isAutoBirthday ? (
                          <span className="rounded-md border border-indigo-300 bg-indigo-50 px-2 py-1 text-xs text-indigo-700 dark:border-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300">
                            Auto cumpleanos
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                      <LocalTime dateMs={toMillis(c.audit?.createdAt)} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs transition hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
                          href={id ? `/admin/comunicados/${id}` : "/admin/comunicados"}
                        >
                          Editar
                        </Link>
                        <form
                          action={async () => {
                            "use server";
                            if (!id) return;
                            await comunicadosToggleAction(id, { estado: nextEstado });
                          }}
                        >
                          <button
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs transition hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
                            type="submit"
                          >
                            {estado === "ACTIVO" ? "Desactivar" : "Activar"}
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!rows.length ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400" colSpan={6}>
                    No hay comunicados registrados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
