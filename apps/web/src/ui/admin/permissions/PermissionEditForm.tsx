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
    <div className="space-y-4 max-w-lg">
      {/* Guardar cambios */}
      <form
        className="space-y-3"
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
          <label className="text-sm font-medium">Módulo</label>
          <input
            name="modulo"
            defaultValue={permission.modulo}
            className="w-full rounded border p-2"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Nombre</label>
          <input
            name="nombre"
            defaultValue={permission.nombre}
            className="w-full rounded border p-2"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Descripción</label>
          <textarea
            name="descripcion"
            defaultValue={permission.descripcion ?? ""}
            className="w-full rounded border p-2"
            rows={3}
          />
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}

        <button className="rounded border px-3 py-2">Guardar</button>
      </form>

      {/* Activar / Desactivar (FORMA CORRECTA) */}
      {isActive ? (
        <form action={permissionsDisableAction.bind(null, permission.id)}>
          <button className="rounded border px-3 py-2">Desactivar</button>
        </form>
      ) : (
        <form action={permissionsEnableAction.bind(null, permission.id)}>
          <button className="rounded border px-3 py-2">Activar</button>
        </form>
      )}
    </div>
  );
}
