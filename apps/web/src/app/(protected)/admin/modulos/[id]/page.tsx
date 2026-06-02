import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/core/auth/guards";
import { adminDb } from "@/lib/firebase/admin";
import { updateModule, softDeleteModule, reactivateModule } from "../actions";

const inputClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-blue-900/40";

export default async function ModuleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  if (!id) return notFound();

  const doc = await adminDb().collection("modulos").doc(id).get();
  if (!doc.exists) return notFound();

  const m = doc.data() as any;
  const isActivo = String(m.estado || "").toUpperCase() === "ACTIVO";

  return (
    <div className="mx-auto max-w-3xl space-y-5 text-slate-900 dark:text-slate-100">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/modulos"
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <div className="flex flex-1 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 shadow-[0_8px_20px_rgba(79,70,229,.28)]">
            <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight">Módulo:</h1>
              <span className="rounded-lg bg-slate-100 px-2 py-0.5 font-mono text-sm font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {m.id}
              </span>
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
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Actualiza datos base, orden y estado del módulo.</p>
          </div>
        </div>
      </div>

      {/* ── Editar ── */}
      <form
        action={async (formData) => {
          "use server";
          await updateModule(m.id, formData);
        }}
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 dark:border-slate-700">
          <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Datos del módulo</h2>
        </div>

        <div className="space-y-4 p-5">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Key</label>
            <input name="key" defaultValue={m.key} className={inputClass + " font-mono"} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Nombre</label>
            <input name="nombre" defaultValue={m.nombre} className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Descripción</label>
            <input name="descripcion" defaultValue={m.descripcion} className={inputClass} />
          </div>
          <div className="space-y-1.5 sm:max-w-[160px]">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Orden</label>
            <input name="orden" type="number" defaultValue={m.orden} className={inputClass} />
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-100 px-5 py-4 dark:border-slate-700">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-xl bg-[#30518c] px-5 py-2 text-sm font-medium text-white shadow-[0_4px_12px_rgba(48,81,140,.3)] transition hover:bg-[#2b4880] active:scale-[.98]"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Guardar cambios
          </button>
        </div>
      </form>

      {/* ── Desactivar ── */}
      {m.estado === "ACTIVO" && (
        <form
          action={async (formData) => {
            "use server";
            await softDeleteModule(m.id, formData);
          }}
          className="overflow-hidden rounded-2xl border border-rose-200 bg-white shadow-sm dark:border-rose-800/60 dark:bg-slate-900"
        >
          <div className="flex items-center gap-2 border-b border-rose-100 bg-rose-50/60 px-5 py-4 dark:border-rose-800/40 dark:bg-rose-900/10">
            <svg className="h-4 w-4 text-rose-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <h2 className="text-sm font-semibold text-rose-700 dark:text-rose-400">Zona de peligro — Desactivar módulo</h2>
          </div>
          <div className="space-y-4 p-5">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Desactivar este módulo lo ocultará del sistema. Los permisos asociados quedarán inoperativos.
            </p>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Motivo de baja <span className="text-rose-500">*</span>
              </label>
              <input
                name="motivoBaja"
                placeholder="Describe el motivo de desactivación"
                required
                className="h-10 w-full rounded-xl border border-rose-200 bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 dark:border-rose-800/60 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-rose-900/40"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100 dark:border-rose-700 dark:bg-rose-900/20 dark:text-rose-400 dark:hover:bg-rose-900/40"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                </svg>
                Desactivar módulo
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ── Reactivar ── */}
      {m.estado === "INACTIVO" && (
        <form
          action={async () => {
            "use server";
            await reactivateModule(m.id);
          }}
          className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm dark:border-amber-700/60 dark:bg-slate-900"
        >
          <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50/60 px-5 py-4 dark:border-amber-700/40 dark:bg-amber-900/10">
            <svg className="h-4 w-4 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <h2 className="text-sm font-semibold text-amber-700 dark:text-amber-400">Módulo inactivo</h2>
          </div>
          <div className="flex items-center justify-between gap-4 p-5">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Este módulo está <strong>INACTIVO</strong>. Reactivarlo lo dejará disponible en el sistema.
            </p>
            <button
              type="submit"
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/40"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              Reactivar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
