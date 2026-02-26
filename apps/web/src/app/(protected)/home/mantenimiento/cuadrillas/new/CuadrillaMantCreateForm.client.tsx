"use client";
import * as React from "react";
import { useActionState } from "react";
import { createCuadrillaMantenimientoAction } from "../actions";

type UserOpt = { uid: string; label: string };

type ActionState =
  | null
  | { ok: false; error: { formErrors?: string[] } };

function firstErr(err?: string[] | undefined) {
  return err && err.length ? err[0] : undefined;
}

const ZONAS = ["NORTE", "SUR", "ESTE", "CENTRO"] as const;
const TURNOS = [
  { value: "", label: "Sin turno" },
  { value: "MANANA", label: "MAÑANA" },
  { value: "TARDE", label: "TARDE" },
] as const;

export default function CuadrillaMantCreateForm({
  tecnicos,
  coordinadores,
  gestores,
}: {
  tecnicos: UserOpt[];
  coordinadores: UserOpt[];
  gestores: UserOpt[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createCuadrillaMantenimientoAction as any, null);
  const formError = state && !state.ok ? firstErr(state.error?.formErrors) : undefined;

  return (
    <form action={action} className="space-y-4 rounded border p-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="text-sm">Zona</label>
          <select name="zona" className="ui-select-inline ui-select-inline ui-select" defaultValue="NORTE">
            {ZONAS.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm">Turno</label>
          <select name="turno" className="ui-select-inline ui-select-inline ui-select" defaultValue="">
            {TURNOS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm">Estado</label>
          <select name="estado" className="ui-select-inline ui-select-inline ui-select" defaultValue="HABILITADO">
            <option value="HABILITADO">HABILITADO</option>
            <option value="INHABILITADO">INHABILITADO</option>
          </select>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-sm">Tecnicos</label>
          <select name="tecnicosUids" multiple className="ui-select-inline ui-select-inline ui-select h-40">
            {tecnicos.map((u) => (
              <option key={u.uid} value={u.uid}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-sm">Coordinador</label>
            <select name="coordinadorUid" className="ui-select-inline ui-select-inline ui-select">
              <option value="">-</option>
              {coordinadores.map((u) => (
                <option key={u.uid} value={u.uid}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm">Gestor</label>
            <select name="gestorUid" className="ui-select-inline ui-select-inline ui-select">
              <option value="">-</option>
              {gestores.map((u) => (
                <option key={u.uid} value={u.uid}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {formError ? (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{formError}</div>
      ) : null}

      <button disabled={pending} className="rounded border px-3 py-2 hover:bg-black/5">
        {pending ? "Creando..." : "Crear"}
      </button>
    </form>
  );
}
