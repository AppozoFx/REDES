import Link from "next/link";
import { requireAdmin } from "@/core/auth/guards";
import { adminDb } from "@/lib/firebase/admin";

export default async function ModulesPage() {
  await requireAdmin();

  const snap = await adminDb().collection("modulos").orderBy("orden", "asc").get();
  const modulos = snap.docs.map((d) => d.data() as any);

  const activos = modulos.filter((m) => String(m.estado || "").toUpperCase() === "ACTIVO").length;
  const inactivos = modulos.length - activos;

  return (
    <div className="space-y-5 text-slate-900 dark:text-slate-100">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 shadow-[0_8px_20px_rgba(79,70,229,.28)]">
            <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Módulos del sistema</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Gestiona el catálogo de módulos y su orden de navegación.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            {modulos.length} módulos
          </span>
          <Link
            href="/admin/modulos/new"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#30518c] px-4 py-2 text-sm font-medium text-white shadow-[0_4px_12px_rgba(48,81,140,.3)] transition hover:bg-[#2b4880] active:scale-[.98]"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nuevo módulo
          </Link>
        </div>
      </div>

      {/* ── KPI mini ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Total</p>
          <p className="mt-1 text-2xl font-bold">{modulos.length}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-3 shadow-sm dark:border-emerald-800 dark:from-emerald-900/20 dark:to-slate-900">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Activos</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-300">{activos}</p>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white p-3 shadow-sm dark:border-rose-800 dark:from-rose-900/20 dark:to-slate-900">
          <p className="text-xs font-medium uppercase tracking-wide text-rose-600 dark:text-rose-400">Inactivos</p>
          <p className="mt-1 text-2xl font-bold text-rose-700 dark:text-rose-300">{inactivos}</p>
        </div>
      </div>

      {/* ── Tabla ── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Key</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Nombre</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Orden</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {modulos.map((m, i) => {
                const isActivo = String(m.estado || "").toUpperCase() === "ACTIVO";
                return (
                  <tr
                    key={m.id}
                    className={`transition-colors hover:bg-blue-50/40 dark:hover:bg-blue-900/10 ${
                      i % 2 !== 0 ? "bg-slate-50/50 dark:bg-slate-800/20" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {m.id}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-lg bg-indigo-50 px-2 py-1 font-mono text-xs font-semibold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                        {m.key}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium">{m.nombre || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {m.orden ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          isActivo
                            ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-300"
                            : "border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/60 dark:bg-rose-900/30 dark:text-rose-300"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${isActivo ? "bg-emerald-500" : "bg-rose-500"}`} />
                        {isActivo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/modulos/${m.id}`}
                        className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        Editar
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {modulos.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400 dark:text-slate-500">
                      <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                        <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                      </svg>
                      <p className="text-sm">No hay módulos todavía.</p>
                      <Link href="/admin/modulos/new" className="text-xs font-medium text-[#30518c] hover:underline dark:text-blue-400">
                        Crear el primero →
                      </Link>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
