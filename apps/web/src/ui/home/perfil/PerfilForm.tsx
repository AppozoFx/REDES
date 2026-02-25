"use client";

import { useActionState } from "react";
import type { PerfilUpdateState } from "@/app/(protected)/home/perfil/actions";
import { updateMyProfileAction } from "@/app/(protected)/home/perfil/actions";

export default function PerfilForm({
  defaults,
}: {
  defaults: { celular: string; direccion: string };
}) {
  const [state, action, pending] = useActionState<PerfilUpdateState, FormData>(
    updateMyProfileAction,
    { ok: true }
  );

  return (
    <form action={action} className="space-y-4 max-w-xl">
      <div className="space-y-1">
        <label className="text-sm font-medium">Celular</label>
        <input
          name="celular"
          defaultValue={defaults.celular}
          className="ui-input"
          placeholder="Ej: 999999999"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Dirección</label>
        <input
          name="direccion"
          defaultValue={defaults.direccion}
          className="ui-input"
          placeholder="Ej: Av. ..."
        />
      </div>

      {state.ok === false && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm">
          {state.error}
        </div>
      )}

      {state.ok === true && !pending && (
        <div className="text-sm text-muted-foreground">Cambios guardados.</div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded border px-4 py-2 text-sm hover:bg-muted disabled:opacity-60"
      >
        {pending ? "Guardando..." : "Guardar"}
      </button>
    </form>
  );
}

