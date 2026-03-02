"use client";

import React from "react";
import { useFormStatus } from "react-dom";
import { createUsuario } from "../actions";
import { toast } from "sonner";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
    >
      {pending ? "Creando..." : "Crear usuario"}
    </button>
  );
}

export function FormCreateUsuario({ roles, areas }: { roles: string[]; areas: string[] }) {
  const [state, formAction] = React.useActionState(createUsuario as any, undefined as any);

  React.useEffect(() => {
    if (!state) return;
    if ((state as any).ok) toast.success("Usuario creado");
    else if ((state as any)?.error) {
      const msg = (state as any)?.error?.formErrors?.[0] ?? "Error al crear usuario";
      toast.error(msg);
    }
  }, [state]);

  return (
    <form action={formAction} className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Credenciales</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm">Email</label>
            <input name="email" className="ui-input mt-1" required />
          </div>
          <div>
            <label className="text-sm">Password</label>
            <input name="password" type="password" className="ui-input mt-1" required />
          </div>
        </div>
      </section>

      <section className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Perfil</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm">Nombres</label>
            <input name="nombres" className="ui-input mt-1" required />
          </div>
          <div>
            <label className="text-sm">Apellidos</label>
            <input name="apellidos" className="ui-input mt-1" required />
          </div>

          <div>
            <label className="text-sm">Tipo doc</label>
            <select name="tipoDoc" className="ui-select mt-1" defaultValue="DNI">
              <option value="DNI">DNI</option>
              <option value="CE">CE</option>
            </select>
          </div>
          <div>
            <label className="text-sm">Nro doc</label>
            <input name="nroDoc" className="ui-input mt-1" required />
          </div>

          <div>
            <label className="text-sm">Celular</label>
            <input name="celular" className="ui-input mt-1" required />
          </div>
          <div>
            <label className="text-sm">Direccion</label>
            <input name="direccion" className="ui-input mt-1" required />
          </div>

          <div>
            <label className="text-sm">Genero</label>
            <select name="genero" className="ui-select mt-1" defaultValue="NO_ESPECIFICA">
              <option value="NO_ESPECIFICA">No especifica</option>
              <option value="M">Masculino</option>
              <option value="F">Femenino</option>
              <option value="OTRO">Otro</option>
            </select>
          </div>
          <div>
            <label className="text-sm">Nacionalidad</label>
            <input name="nacionalidad" defaultValue="PERUANA" className="ui-input mt-1" required />
          </div>

          <div>
            <label className="text-sm">F. ingreso</label>
            <input name="fIngreso" type="date" className="ui-input mt-1" required />
          </div>
          <div>
            <label className="text-sm">F. nacimiento</label>
            <input name="fNacimiento" type="date" className="ui-input mt-1" required />
          </div>

          <div>
            <label className="text-sm">Estado perfil</label>
            <select name="estadoPerfil" className="ui-select mt-1" defaultValue="ACTIVO">
              <option value="ACTIVO">ACTIVO</option>
              <option value="INACTIVO">INACTIVO</option>
            </select>
          </div>
        </div>
      </section>

      <section className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Asignaciones opcionales</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm">Sede</label>
            <input name="sede" className="ui-input mt-1" />
          </div>
          <div>
            <label className="text-sm">Cargo</label>
            <input name="cargo" className="ui-input mt-1" />
          </div>
          <div>
            <label className="text-sm">CuadrillaId</label>
            <input name="cuadrillaId" className="ui-input mt-1" />
          </div>
          <div>
            <label className="text-sm">Supervisor UID</label>
            <input name="supervisorUid" className="ui-input mt-1" />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 border-t border-slate-200 pt-4 md:grid-cols-2 dark:border-slate-700">
        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <div className="mb-2 font-medium">Roles</div>
          <div className="space-y-2">
            {roles.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="roles" value={r} />
                {r}
              </label>
            ))}
            {roles.length === 0 && <div className="text-sm text-slate-500 dark:text-slate-400">No hay roles activos.</div>}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <div className="mb-2 font-medium">Areas</div>
          <div className="space-y-2">
            {areas.map((a) => (
              <label key={a} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="areas" value={a} />
                {a}
              </label>
            ))}
            {areas.length === 0 && <div className="text-sm text-slate-500 dark:text-slate-400">No hay areas activas.</div>}
          </div>
        </div>
      </section>

      {state && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/50">
          <div className="font-medium">Resultado</div>
          <pre className="mt-1 whitespace-pre-wrap break-words">{JSON.stringify(state, null, 2)}</pre>

          {state?.ok === false && state?.error?.formErrors?.length > 0 && (
            <ul className="mt-2 list-disc pl-5">
              {state.error.formErrors.map((e: string, i: number) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <SubmitButton />
    </form>
  );
}
