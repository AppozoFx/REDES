"use client";

import { useActionState } from "react";
import { useEffect, useRef, useState } from "react";
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
  const [saved, setSaved] = useState(false);
  const prevPending = useRef(false);

  useEffect(() => {
    if (pending) {
      prevPending.current = true;
      setSaved(false);
      return;
    }
    if (!pending && prevPending.current && state.ok) {
      setSaved(true);
      prevPending.current = false;
      const t = setTimeout(() => setSaved(false), 1300);
      return () => clearTimeout(t);
    }
  }, [pending, state.ok]);

  return (
    <form action={action} className="max-w-2xl space-y-4">
      <fieldset disabled={pending} aria-busy={pending} className={`space-y-4 ${pending ? "opacity-90" : ""}`}>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Nombres</label>
            <input name="nombres" defaultValue={defaults.nombres} className="ui-input-inline ui-input-inline ui-input" />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Apellidos</label>
            <input name="apellidos" defaultValue={defaults.apellidos} className="ui-input-inline ui-input-inline ui-input" />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Celular</label>
            <input name="celular" defaultValue={defaults.celular} className="ui-input-inline ui-input-inline ui-input" />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Direccion</label>
            <input name="direccion" defaultValue={defaults.direccion} className="ui-input-inline ui-input-inline ui-input" />
          </div>
        </div>

        {state.ok === false && (
          <div className="rounded border border-red-300 bg-red-50 p-3 text-sm">{state.error}</div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded border px-4 py-2 text-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-70"
        >
          <span className={`inline-flex items-center gap-2 ${pending ? "animate-pulse" : ""}`}>
            {pending ? (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-30" />
                <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="3" className="opacity-95" />
              </svg>
            ) : saved ? (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : null}
            {pending ? "Guardando..." : saved ? "Cambios guardados" : "Guardar"}
          </span>
        </button>
      </fieldset>

      {state.ok === true && !pending && saved && <div className="text-sm text-muted-foreground">Cambios guardados.</div>}
    </form>
  );
}
