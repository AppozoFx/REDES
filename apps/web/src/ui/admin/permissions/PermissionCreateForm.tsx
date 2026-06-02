"use client";

import { useState } from "react";
import { permissionsCreateAction } from "@/app/(protected)/admin/permissions/actions";

const inputClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:ring-blue-900/40";
const labelClass = "block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";

export function PermissionCreateForm() {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <form
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
      action={async (fd) => {
        setError(null);
        setSaving(true);
        const input = {
          id: String(fd.get("id") ?? ""),
          nombre: String(fd.get("nombre") ?? ""),
          modulo: String(fd.get("modulo") ?? ""),
          descripcion: String(fd.get("descripcion") ?? "") || undefined,
        };
        try {
          await permissionsCreateAction(input);
        } catch (e: any) {
          setError(e?.message ?? "Error creando permiso");
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 dark:border-slate-700">
        <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Datos del permiso</h2>
      </div>

      <div className="space-y-4 p-5">
        <div className="space-y-1.5">
          <label className={labelClass}>ID del permiso</label>
          <input name="id" placeholder="Ej: USERS_EDIT" className={inputClass + " font-mono uppercase"} />
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Solo mayúsculas, números y guion bajo. No modificable después de creado.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className={labelClass}>Módulo</label>
            <input name="modulo" placeholder="Ej: USUARIOS" className={inputClass + " uppercase"} />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Nombre</label>
            <input name="nombre" placeholder="Ej: Editar usuarios" className={inputClass} />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className={labelClass}>Descripción <span className="normal-case font-normal text-slate-400">(opcional)</span></label>
          <textarea
            name="descripcion"
            rows={3}
            placeholder="Descripción detallada del permiso y cuándo aplica"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-blue-900/40"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800/60 dark:bg-rose-900/20 dark:text-rose-400">
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 dark:border-slate-700">
        <a href="/admin/permissions" className="text-sm text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
          Cancelar
        </a>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-[#30518c] px-5 py-2 text-sm font-medium text-white shadow-[0_4px_12px_rgba(48,81,140,.3)] transition hover:bg-[#2b4880] active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? (
            <>
              <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Creando…
            </>
          ) : (
            <>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Crear permiso
            </>
          )}
        </button>
      </div>
    </form>
  );
}
