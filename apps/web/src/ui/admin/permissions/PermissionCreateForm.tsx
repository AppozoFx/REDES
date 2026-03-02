"use client";

import { useState } from "react";
import { permissionsCreateAction } from "@/app/(protected)/admin/permissions/actions";

export function PermissionCreateForm() {
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
      action={async (fd) => {
        setError(null);

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
        }
      }}
    >
      <div className="space-y-1">
        <label className="text-sm font-medium">ID (ej: USERS_EDIT)</label>
        <input name="id" className="ui-input font-mono" placeholder="USERS_EDIT" />
        <p className="text-xs text-slate-500 dark:text-slate-400">Solo A-Z, 0-9 y _</p>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Modulo</label>
        <input name="modulo" className="ui-input" placeholder="USUARIOS" />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Nombre</label>
        <input name="nombre" className="ui-input" placeholder="Editar usuarios" />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Descripcion</label>
        <textarea name="descripcion" className="ui-textarea" rows={3} />
      </div>

      {error && <div className="text-sm text-rose-600 dark:text-rose-300">{error}</div>}

      <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700">Crear</button>
    </form>
  );
}
