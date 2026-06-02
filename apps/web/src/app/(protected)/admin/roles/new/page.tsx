import Link from "next/link";
import { createRole } from "../actions";
import { requireAdmin } from "@/core/auth/guards";

const inputClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:ring-blue-900/40";

export default async function NewRolePage() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-2xl space-y-5 text-slate-900 dark:text-slate-100">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/roles"
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          title="Volver a roles"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-600 shadow-[0_8px_20px_rgba(124,58,237,.28)]">
            <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Nuevo rol</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Crea un rol con su identificador y descripción.</p>
          </div>
        </div>
      </div>

      {/* ── Formulario ── */}
      <form
        action={async (formData) => {
          "use server";
          await createRole(formData);
        }}
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Datos del rol</h2>
        </div>

        <div className="space-y-5 p-5">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              ID del rol
            </label>
            <input
              name="id"
              placeholder="Ej: ADMIN, COORDINADOR, TECNICO"
              className={inputClass + " font-mono uppercase"}
            />
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Identificador único, en mayúsculas. No se puede modificar después de creado.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Nombre
            </label>
            <input
              name="nombre"
              placeholder="Ej: Administrador del sistema"
              className={inputClass}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Descripción
            </label>
            <input
              name="descripcion"
              placeholder="Descripción breve del rol y sus responsabilidades"
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 dark:border-slate-700">
          <Link
            href="/admin/roles"
            className="text-sm text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-xl bg-[#30518c] px-5 py-2 text-sm font-medium text-white shadow-[0_4px_12px_rgba(48,81,140,.3)] transition hover:bg-[#2b4880] active:scale-[.98]"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Crear rol
          </button>
        </div>
      </form>

      {/* ── Info box ── */}
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-700/60 dark:bg-amber-900/20">
        <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p className="text-amber-800 dark:text-amber-300">
          Después de crear el rol podrás asignarle permisos desde la página de edición.
        </p>
      </div>
    </div>
  );
}
