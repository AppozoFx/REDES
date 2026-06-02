"use client";

import { useMemo, useState } from "react";
import { roleUpdatePermissionsAction } from "@/app/(protected)/admin/roles/actions";

type PermissionItem = {
  id: string;
  modulo: string;
  nombre: string;
};

type SaveState = "idle" | "saving" | "saved" | "error";

export function RolePermissionsEditor(props: {
  roleId: string;
  available: PermissionItem[];
  selected: string[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>(props.selected);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [openModules, setOpenModules] = useState<Set<string>>(() => new Set());

  const grouped = useMemo(() => {
    const map = new Map<string, PermissionItem[]>();
    for (const p of props.available) {
      const key = p.modulo || "OTROS";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [props.available]);

  function toggle(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    if (saveState === "saved") setSaveState("idle");
  }

  function toggleModule(modulo: string) {
    setOpenModules((prev) => {
      const next = new Set(prev);
      if (next.has(modulo)) next.delete(modulo);
      else next.add(modulo);
      return next;
    });
  }

  function selectAllInModule(items: PermissionItem[]) {
    const ids = items.map((p) => p.id);
    setPicked((prev) => Array.from(new Set([...prev, ...ids])));
    if (saveState === "saved") setSaveState("idle");
  }

  function clearAllInModule(items: PermissionItem[]) {
    const ids = new Set(items.map((p) => p.id));
    setPicked((prev) => prev.filter((x) => !ids.has(x)));
    if (saveState === "saved") setSaveState("idle");
  }

  const pickedSet = useMemo(() => new Set(picked), [picked]);
  const totalSelected = picked.length;
  const totalAvailable = props.available.length;
  const hasChanges = JSON.stringify([...picked].sort()) !== JSON.stringify([...props.selected].sort());

  return (
    <div className="space-y-4">

      {/* ── Summary bar ── */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold text-slate-700 dark:text-slate-200">{totalSelected}</span>
          <span className="text-slate-400 dark:text-slate-500">de</span>
          <span className="font-semibold text-slate-700 dark:text-slate-200">{totalAvailable}</span>
          <span className="text-slate-500 dark:text-slate-400">permisos asignados</span>
        </div>
        {hasChanges && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Cambios sin guardar
          </span>
        )}
      </div>

      {/* ── Módulos ── */}
      {grouped.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-8 text-slate-400 dark:text-slate-500">
          <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <p className="text-sm">No hay permisos disponibles.</p>
        </div>
      )}

      <div className="space-y-2">
        {grouped.map(([modulo, items]) => {
          const isOpen = openModules.has(modulo);
          const moduleSelected = items.filter((p) => pickedSet.has(p.id)).length;
          const allSelected = moduleSelected === items.length;
          const noneSelected = moduleSelected === 0;

          return (
            <div
              key={modulo}
              className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700"
            >
              {/* Módulo header */}
              <button
                type="button"
                onClick={() => toggleModule(modulo)}
                className="flex w-full items-center justify-between gap-3 bg-white px-4 py-3 transition hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800"
              >
                <div className="flex items-center gap-2.5">
                  <svg
                    className={`h-4 w-4 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-90" : ""} text-slate-400`}
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{modulo}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      allSelected
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                        : moduleSelected > 0
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                        : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                    }`}
                  >
                    {moduleSelected}/{items.length}
                  </span>
                </div>
              </button>

              {/* Módulo body */}
              {isOpen && (
                <div className="border-t border-slate-100 bg-white dark:border-slate-700 dark:bg-slate-900/60">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 dark:border-slate-700/60">
                    <span className="text-xs text-slate-400 dark:text-slate-500">{items.length} permiso{items.length !== 1 ? "s" : ""}</span>
                    <div className="flex items-center gap-2">
                      {!allSelected && (
                        <button
                          type="button"
                          onClick={() => selectAllInModule(items)}
                          className="text-xs font-medium text-blue-600 transition hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          Seleccionar todos
                        </button>
                      )}
                      {!noneSelected && (
                        <>
                          {!allSelected && <span className="text-slate-300 dark:text-slate-600">·</span>}
                          <button
                            type="button"
                            onClick={() => clearAllInModule(items)}
                            className="text-xs font-medium text-rose-500 transition hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
                          >
                            Quitar todos
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {items.map((p) => {
                      const isChecked = pickedSet.has(p.id);
                      return (
                        <label
                          key={p.id}
                          className={`flex cursor-pointer items-start gap-3 px-4 py-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                            isChecked ? "bg-blue-50/50 dark:bg-blue-900/10" : ""
                          }`}
                        >
                          <div className="relative mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggle(p.id)}
                              className="sr-only"
                            />
                            <div
                              className={`h-4 w-4 rounded border-2 transition-all ${
                                isChecked
                                  ? "border-[#30518c] bg-[#30518c]"
                                  : "border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900"
                              }`}
                            >
                              {isChecked && (
                                <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5}>
                                  <polyline points="10 3 5 9 2 6" />
                                </svg>
                              )}
                            </div>
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="block font-mono text-xs font-semibold text-slate-600 dark:text-slate-300">{p.id}</span>
                            <span className="block text-xs text-slate-400 dark:text-slate-500">{p.nombre}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800/60 dark:bg-rose-900/20 dark:text-rose-400">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </div>
      )}

      {/* ── Guardar ── */}
      <form
        action={async () => {
          setError(null);
          setSaveState("saving");
          try {
            await roleUpdatePermissionsAction(props.roleId, { permissions: picked });
            setSaveState("saved");
            setTimeout(() => setSaveState("idle"), 3000);
          } catch (e: any) {
            setError(e?.message ?? "Error guardando permisos del rol");
            setSaveState("error");
          }
        }}
      >
        <div className="flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-700">
          <div className="text-xs text-slate-400 dark:text-slate-500">
            {saveState === "saved" && (
              <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Permisos guardados correctamente
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={saveState === "saving"}
            className="inline-flex items-center gap-2 rounded-xl bg-[#30518c] px-5 py-2 text-sm font-medium text-white shadow-[0_4px_12px_rgba(48,81,140,.3)] transition hover:bg-[#2b4880] active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saveState === "saving" ? (
              <>
                <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Guardando…
              </>
            ) : (
              <>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Guardar permisos
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
