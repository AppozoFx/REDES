"use client";
import * as React from "react";
import { useActionState } from "react";
import { createCuadrillaAction } from "../actions";
import ZonaTipoDependent from "./ZonaTipoDependent.client";
import ConductorAndCargos from "./ConductorAndCargos.client";

type UserOpt = { uid: string; label: string };
type ZonaOpt = { id: string; tipo: string };

type ActionState =
  | null
  | { ok: false; error: { formErrors?: string[] } };

function firstErr(err?: string[] | undefined) {
  return err && err.length ? err[0] : undefined;
}

export default function CuadrillaCreateForm({
  zonas,
  tecnicos,
  coordinadores,
  gestores,
}: {
  zonas: ZonaOpt[];
  tecnicos: UserOpt[];
  coordinadores: UserOpt[];
  gestores: UserOpt[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createCuadrillaAction as any, null);

  const formError = state && !state.ok ? firstErr(state.error?.formErrors) : undefined;

  return (
    <form action={action} className="space-y-4 rounded border p-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="text-sm">Categoría</label>
          <select name="categoria" className="w-full border rounded px-3 py-2">
            <option value="CONDOMINIO">CONDOMINIO</option>
            <option value="RESIDENCIAL">RESIDENCIAL</option>
          </select>
        </div>
        <div>
          <label className="text-sm">Estado</label>
          <select name="estado" className="w-full border rounded px-3 py-2" defaultValue="HABILITADO">
            <option value="HABILITADO">HABILITADO</option>
            <option value="INHABILITADO">INHABILITADO</option>
          </select>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        El número de cuadrilla se asigna automáticamente por categoría.
      </div>

      <ZonaTipoDependent zonas={zonas} />

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-sm">Placa</label>
          <input name="placa" className="w-full border rounded px-3 py-2" />
        </div>
        <div>
          <label className="text-sm">Modelo (opcional)</label>
          <input name="vehiculoModelo" className="w-full border rounded px-3 py-2" />
        </div>
        <div>
          <label className="text-sm">Marca (opcional)</label>
          <input name="vehiculoMarca" className="w-full border rounded px-3 py-2" />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-sm">Técnicos</label>
          <select name="tecnicosUids" multiple className="w-full border rounded px-3 py-2 h-40">
            {tecnicos.map((u) => (
              <option key={u.uid} value={u.uid}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
        <ConductorAndCargos tecnicos={tecnicos} coordinadores={coordinadores} gestores={gestores} />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="text-sm">Licencia (número)</label>
          <input name="licenciaNumero" className="w-full border rounded px-3 py-2" />
        </div>
        <div>
          <label className="text-sm">Licencia vence</label>
          <input name="licenciaVenceAt" type="date" className="w-full border rounded px-3 py-2" />
        </div>
        <div>
          <label className="text-sm">SOAT vence</label>
          <input name="soatVenceAt" type="date" className="w-full border rounded px-3 py-2" />
        </div>
        <div>
          <label className="text-sm">Rev. técnica vence</label>
          <input name="revTecVenceAt" type="date" className="w-full border rounded px-3 py-2" />
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
