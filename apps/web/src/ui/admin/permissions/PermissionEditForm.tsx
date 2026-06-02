"use client";

import { useState } from "react";
import {
  permissionsUpdateAction,
  permissionsDisableAction,
  permissionsEnableAction,
} from "@/app/(protected)/admin/permissions/actions";

const inputClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-blue-900/40";
const labelClass = "block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";

export function PermissionEditForm({ permission }: { permission: any }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isActive = permission.estado === "ACTIVO";

  return (
    <div className="space-y-5">
      {/* ── Editar datos ── */}
      <form
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
        action={async (fd) => {
          setError(null);
          setSaving(true);
          const input = {
            nombre: String(fd.get("nombre") ?? ""),
            modulo: String(fd.get("modulo") ?? ""),
            descripcion: String(fd.get("descripcion") ?? "") || undefined,
          };
          try {
            await permissionsUpdateAction(permission.id, input);
          } catch (e: any) {
            setError(e?.message ?? "Error actualizando permiso");
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 dark:border-slate-700">
          <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Editar permiso</h2>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className={labelClass}>Módulo</label>
              <input name="modulo" defaultValue={permission.modulo} className={inputClass + " uppercase"} />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Nombre</label>
              <input name="nombre" defaultValue={permission.nombre} className={inputClass} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className={labelClass}>Descripción <span className="normal-case font-normal text-slate-400">(opcional)</span></label>
            <textarea
              name="descripcion"
              defaultValue={permission.descripcion ?? ""}
              rows={3}
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

        <div className="flex justify-end border-t border-slate-100 px-5 py-4 dark:border-slate-700">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-[#30518c] px-5 py-2 text-sm font-medium text-white shadow-[0_4px_12px_rgba(48,81,140,.3)] transition hover:bg-[#2b4880] active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <>
                <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Guardando…
              </>
            ) : (
              <>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Guardar cambios
              </>
            )}
          </button>
        </div>
      </form>

      {/* ── Cambiar estado ── */}
      {isActive ? (
        <form
          action={permissionsDisableAction.bind(null, permission.id)}
          className="overflow-hidden rounded-2xl border border-rose-200 bg-white shadow-sm dark:border-rose-800/60 dark:bg-slate-900"
        >
          <div className="flex items-center gap-2 border-b border-rose-100 bg-rose-50/60 px-5 py-4 dark:border-rose-800/40 dark:bg-rose-900/10">
            <svg className="h-4 w-4 text-rose-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <h2 className="text-sm font-semibold text-rose-700 dark:text-rose-400">Desactivar permiso</h2>
          </div>
          <div className="flex items-center justify-between gap-4 p-5">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Desactivar este permiso lo quitará de todos los roles que lo tengan asignado.
            </p>
            <button
              type="submit"
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100 dark:border-rose-700 dark:bg-rose-900/20 dark:text-rose-400 dark:hover:bg-rose-900/40"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
              </svg>
              Desactivar
            </button>
          </div>
        </form>
      ) : (
        <form
          action={permissionsEnableAction.bind(null, permission.id)}
          className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm dark:border-emerald-800/60 dark:bg-slate-900"
        >
          <div className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50/60 px-5 py-4 dark:border-emerald-800/40 dark:bg-emerald-900/10">
            <svg className="h-4 w-4 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <h2 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Permiso inactivo</h2>
          </div>
          <div className="flex items-center justify-between gap-4 p-5">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Este permiso está <strong>INACTIVO</strong>. Activarlo lo dejará disponible para asignarlo a roles.
            </p>
            <button
              type="submit"
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Activar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
