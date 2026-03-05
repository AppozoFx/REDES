"use client";

import Link from "next/link";
import React from "react";
import { useFormStatus } from "react-dom";
import { createUsuario } from "../actions";
import { toast } from "sonner";

function SubmitButton() {
  const { pending } = useFormStatus();
  const [done, setDone] = React.useState(false);
  const [wasPending, setWasPending] = React.useState(false);

  React.useEffect(() => {
    if (pending) {
      setWasPending(true);
      setDone(false);
      return;
    }
    if (!pending && wasPending) {
      setDone(true);
      setWasPending(false);
      const t = setTimeout(() => setDone(false), 1300);
      return () => clearTimeout(t);
    }
  }, [pending, wasPending]);

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className={`inline-flex items-center gap-2 ${pending ? "animate-pulse" : ""}`}>
        {pending ? (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-30" />
            <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="3" className="opacity-95" />
          </svg>
        ) : done ? (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        ) : null}
        {pending ? "Creando..." : done ? "Usuario creado" : "Crear usuario"}
      </span>
    </button>
  );
}

export function FormCreateUsuario({
  roles,
  areas,
  cancelHref = "/admin/usuarios",
}: {
  roles: string[];
  areas: string[];
  cancelHref?: string;
}) {
  const [state, formAction, pending] = React.useActionState(createUsuario as any, undefined as any);

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
      <fieldset disabled={pending} aria-busy={pending} className={`space-y-5 ${pending ? "opacity-90" : ""}`}>
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

        {state?.ok === false && state?.error?.formErrors?.length > 0 && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200">
            {state.error.formErrors[0]}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <SubmitButton />
          <Link
            href={cancelHref}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Cancelar
          </Link>
        </div>
      </fieldset>
    </form>
  );
}
