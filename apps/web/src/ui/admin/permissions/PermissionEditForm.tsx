"use client";

import { useState } from "react";
import {
  permissionsUpdateAction,
  permissionsDisableAction,
  permissionsEnableAction,
} from "@/app/(protected)/admin/permissions/actions";

export function PermissionEditForm({ permission }: { permission: any }) {
  const [error, setError] = useState<string | null>(null);
  const isActive = permission.estado === "ACTIVO";

  return (
    <div className="space-y-4">
      <form
        className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
        action={async (fd) => {
          setError(null);

          const input = {
            nombre: String(fd.get("nombre") ?? ""),
            modulo: String(fd.get("modulo") ?? ""),
            descripcion: String(fd.get("descripcion") ?? "") || undefined,
          };

          try {
            await permissionsUpdateAction(permission.id, input);
          } catch (e: any) {
            setError(e?.message ?? "Error actualizando permiso");
          }
        }}
      >
        <div className="space-y-1">
          <label className="text-sm font-medium">Modulo</label>
          <input name="modulo" defaultValue={permission.modulo} className="ui-input" />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Nombre</label>
          <input name="nombre" defaultValue={permission.nombre} className="ui-input" />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Descripcion</label>
          <textarea name="descripcion" defaultValue={permission.descripcion ?? ""} className="ui-textarea" rows={3} />
        </div>

        {error && <div className="text-sm text-rose-600 dark:text-rose-300">{error}</div>}

        <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700">Guardar</button>
      </form>

      {isActive ? (
        <form action={permissionsDisableAction.bind(null, permission.id)}>
          <button className="inline-flex h-9 items-center rounded-lg border border-rose-300 px-4 text-sm font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-900/30">
            Desactivar
          </button>
        </form>
      ) : (
        <form action={permissionsEnableAction.bind(null, permission.id)}>
          <button className="inline-flex h-9 items-center rounded-lg border border-emerald-300 px-4 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/30">
            Activar
          </button>
        </form>
      )}
    </div>
  );
}
