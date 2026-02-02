"use client";

import { useActionState } from "react";
import { homeUpdateUsuarioAction, type EditState } from "@/app/(protected)/home/usuarios/[uid]/actions";

export default function UserEditOperativeForm({
  uid,
  defaults,
}: {
  uid: string;
  defaults: { nombres: string; apellidos: string; celular: string; direccion: string };
}) {
  const bound = homeUpdateUsuarioAction.bind(null, uid);
  const [state, action, pending] = useActionState<EditState, FormData>(bound, { ok: true });

  return (
    <form action={action} className="space-y-4 max-w-2xl">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-sm font-medium">Nombres</label>
          <input name="nombres" defaultValue={defaults.nombres} className="w-full rounded border px-3 py-2 text-sm" />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Apellidos</label>
          <input name="apellidos" defaultValue={defaults.apellidos} className="w-full rounded border px-3 py-2 text-sm" />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Celular</label>
          <input name="celular" defaultValue={defaults.celular} className="w-full rounded border px-3 py-2 text-sm" />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Dirección</label>
          <input name="direccion" defaultValue={defaults.direccion} className="w-full rounded border px-3 py-2 text-sm" />
        </div>
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
