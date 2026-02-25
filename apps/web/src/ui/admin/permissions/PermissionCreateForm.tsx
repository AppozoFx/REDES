"use client";

import { useState } from "react";
import { permissionsCreateAction } from "@/app/(protected)/admin/permissions/actions";

export function PermissionCreateForm() {
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-3 max-w-lg"
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
        <input name="id" className="ui-input-inline ui-input-inline ui-input font-mono" placeholder="USERS_EDIT" />
        <p className="text-xs opacity-70">Solo A-Z, 0-9 y _</p>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Módulo</label>
        <input name="modulo" className="ui-input-inline ui-input-inline ui-input" placeholder="USUARIOS" />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Nombre</label>
        <input name="nombre" className="ui-input-inline ui-input-inline ui-input" placeholder="Editar usuarios" />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Descripción</label>
        <textarea name="descripcion" className="ui-textarea-inline ui-textarea-inline ui-textarea" rows={3} />
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      <button className="rounded border px-3 py-2">Crear</button>
    </form>
  );
}


