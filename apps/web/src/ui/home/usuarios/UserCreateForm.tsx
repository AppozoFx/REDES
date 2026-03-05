"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { toast } from "sonner";
import { createUsuario } from "@/app/(protected)/admin/usuarios/actions";

type RoleOpt = { id: string; nombre: string };

type Props = {
  rolesAllowed: RoleOpt[];
  cancelHref?: string;
};

type ActionState =
  | null
  | { ok: true; uid: string }
  | { ok: false; error: { formErrors?: string[]; fieldErrors?: Record<string, string[]> } };

function firstErr(err?: string[] | undefined) {
  return err && err.length ? err[0] : undefined;
}

export default function UserCreateForm({ rolesAllowed, cancelHref = "/home/usuarios" }: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createUsuario as any, null);
  const [done, setDone] = React.useState(false);
  const [wasPending, setWasPending] = React.useState(false);

  const todayYMD = React.useMemo(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
  }, []);

  React.useEffect(() => {
    if (!state) return;

    if (state.ok) {
      toast.success("Usuario creado");
    } else {
      const msg = firstErr(state.error?.formErrors) ?? "No se pudo crear el usuario. Revisa los campos.";
      toast.error(msg);
    }
  }, [state]);

  React.useEffect(() => {
    if (pending) {
      setWasPending(true);
      setDone(false);
      return;
    }
    if (!pending && wasPending && state?.ok) {
      setDone(true);
      setWasPending(false);
      const t = setTimeout(() => setDone(false), 1300);
      return () => clearTimeout(t);
    }
  }, [pending, wasPending, state?.ok]);

  const fe = state && !state.ok ? state.error?.fieldErrors ?? {} : {};

  return (
    <form action={action} className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <fieldset disabled={pending} aria-busy={pending} className={`space-y-5 ${pending ? "opacity-90" : ""}`}>
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Credenciales</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Email" name="email" type="email" required error={firstErr(fe.email)} />
            <Field label="Password" name="password" type="password" required error={firstErr(fe.password)} />
          </div>
        </section>

        <section className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Perfil</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Nombres" name="nombres" required error={firstErr(fe.nombres)} />
            <Field label="Apellidos" name="apellidos" required error={firstErr(fe.apellidos)} />

            <Select
              label="Tipo doc"
              name="tipoDoc"
              required
              options={[
                { value: "DNI", label: "DNI" },
                { value: "CE", label: "CE" },
              ]}
              error={firstErr(fe.tipoDoc)}
            />

            <Field label="Nro doc" name="nroDoc" required error={firstErr(fe.nroDoc)} />
            <Field label="Celular" name="celular" required error={firstErr(fe.celular)} />
            <Field label="Direccion" name="direccion" required error={firstErr(fe.direccion)} />

            <Select
              label="Genero"
              name="genero"
              options={[
                { value: "", label: "-" },
                { value: "M", label: "M" },
                { value: "F", label: "F" },
              ]}
              error={firstErr(fe.genero)}
            />

            <Field label="Nacionalidad" name="nacionalidad" required defaultValue="PERUANA" error={firstErr(fe.nacionalidad)} />

            <Field label="Fecha ingreso" name="fIngreso" type="date" required defaultValue={todayYMD} error={firstErr(fe.fIngreso)} />
            <Field label="Fecha nacimiento" name="fNacimiento" type="date" required error={firstErr(fe.fNacimiento)} />

            <Select
              label="Estado perfil"
              name="estadoPerfil"
              required
              options={[
                { value: "ACTIVO", label: "ACTIVO" },
                { value: "INACTIVO", label: "INACTIVO" },
              ]}
              error={firstErr(fe.estadoPerfil)}
            />
          </div>
        </section>

        <section className="grid gap-3 border-t border-slate-200 pt-4 md:grid-cols-2 dark:border-slate-700">
          <MultiSelect
            label="Roles"
            name="roles"
            required
            options={rolesAllowed.map((r) => ({ value: r.id, label: r.nombre }))}
            helper="No incluye ADMIN (bloqueado por UI + server)."
            error={firstErr(fe.roles)}
          />

          <MultiSelect
            label="Areas"
            name="areas"
            required
            options={[
              { value: "COMUNICADOS", label: "COMUNICADOS" },
              { value: "INSTALACIONES", label: "INSTALACIONES" },
              { value: "MANTENIMIENTO", label: "MANTENIMIENTO" },
            ]}
            error={firstErr(fe.areas)}
          />
        </section>

        <section className="grid gap-3 border-t border-slate-200 pt-4 md:grid-cols-2 dark:border-slate-700">
          <Field label="Sede (opcional)" name="sede" error={firstErr(fe.sede)} />
          <Field label="Cargo (opcional)" name="cargo" error={firstErr(fe.cargo)} />
          <Field label="CuadrillaId (opcional)" name="cuadrillaId" error={firstErr(fe.cuadrillaId)} />
          <Field label="Supervisor (opcional)" name="supervisorUid" error={firstErr(fe.supervisorUid)} />
        </section>

        {state && !state.ok && state.error?.formErrors?.length ? (
          <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{state.error.formErrors[0]}</div>
        ) : null}

        <div className="flex items-center gap-3 pt-1">
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
          <Link
            href={cancelHref}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Cancelar
          </Link>
          {state && state.ok ? <div className="text-xs text-muted-foreground">Usuario creado correctamente</div> : null}
        </div>
      </fieldset>
    </form>
  );
}

function Field(props: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  error?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{props.label}</label>
      <input name={props.name} type={props.type ?? "text"} required={props.required} defaultValue={props.defaultValue} className="ui-input" />
      {props.error ? <div className="text-xs text-red-600">{props.error}</div> : null}
    </div>
  );
}

function Select(props: {
  label: string;
  name: string;
  required?: boolean;
  options: { value: string; label: string }[];
  error?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{props.label}</label>
      <select name={props.name} required={props.required} className="ui-select" defaultValue={props.options[0]?.value ?? ""}>
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {props.error ? <div className="text-xs text-red-600">{props.error}</div> : null}
    </div>
  );
}

function MultiSelect(props: {
  label: string;
  name: string;
  required?: boolean;
  options: { value: string; label: string }[];
  helper?: string;
  error?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{props.label}</label>
      <select name={props.name} multiple required={props.required} className="ui-select">
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {props.helper ? <div className="text-xs text-muted-foreground">{props.helper}</div> : null}
      {props.error ? <div className="text-xs text-red-600">{props.error}</div> : null}
    </div>
  );
}
