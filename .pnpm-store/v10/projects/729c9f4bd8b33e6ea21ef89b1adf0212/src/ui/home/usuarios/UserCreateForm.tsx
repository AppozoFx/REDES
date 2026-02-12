"use client";

import * as React from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import { createUsuario } from "@/app/(protected)/admin/usuarios/actions";

type RoleOpt = { id: string; nombre: string };

type Props = {
  rolesAllowed: RoleOpt[];
};

type ActionState =
  | null
  | { ok: true; uid: string }
  | { ok: false; error: { formErrors?: string[]; fieldErrors?: Record<string, string[]> } };

function firstErr(err?: string[] | undefined) {
  return err && err.length ? err[0] : undefined;
}

export default function UserCreateForm({ rolesAllowed }: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createUsuario as any, null);

  // defaults UI
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
      const msg =
        firstErr(state.error?.formErrors) ??
        "No se pudo crear el usuario. Revisa los campos.";
      toast.error(msg);
    }
  }, [state]);

  const fe = state && !state.ok ? state.error?.fieldErrors ?? {} : {};

  return (
    <form action={action} className="space-y-4 rounded border p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Email" name="email" type="email" required error={firstErr(fe.email)} />
        <Field label="Password" name="password" type="password" required error={firstErr(fe.password)} />

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
        <Field label="Dirección" name="direccion" required error={firstErr(fe.direccion)} />

        <Select
          label="Género"
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

      <div className="grid gap-3 md:grid-cols-2">
        <MultiSelect
          label="Roles"
          name="roles"
          required
          options={rolesAllowed.map((r) => ({ value: r.id, label: r.nombre }))}
          helper="No incluye ADMIN (bloqueado por UI + server)."
          error={firstErr(fe.roles)}
        />

        {/* Áreas: aquí puedes cambiar el listado según tu negocio */}
        <MultiSelect
          label="Áreas"
          name="areas"
          required
          options={[
            { value: "COMUNICADOS", label: "COMUNICADOS" },
            { value: "INSTALACIONES", label: "INSTALACIONES" },
            { value: "AVERIAS", label: "AVERIAS" },
          ]}
          error={firstErr(fe.areas)}
        />
      </div>

      {/* permissions opcional: si no lo usas en Home, no lo incluyas */}
      {/* <MultiSelect ... name="permissions" /> */}

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Sede (opcional)" name="sede" error={firstErr(fe.sede)} />
        <Field label="Cargo (opcional)" name="cargo" error={firstErr(fe.cargo)} />
        <Field label="CuadrillaId (opcional)" name="cuadrillaId" error={firstErr(fe.cuadrillaId)} />
        <Field label="Supervisor UID (opcional)" name="supervisorUid" error={firstErr(fe.supervisorUid)} />
      </div>

      {/* errores generales */}
      {state && !state.ok && state.error?.formErrors?.length ? (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {state.error.formErrors[0]}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded border px-4 py-2 text-sm hover:bg-muted disabled:opacity-60"
        >
          {pending ? "Creando..." : "Crear usuario"}
        </button>

        {state && state.ok ? (
          <div className="text-xs text-muted-foreground">
            Creado UID: <span className="font-mono">{state.uid}</span>
          </div>
        ) : null}
      </div>
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
      <input
        name={props.name}
        type={props.type ?? "text"}
        required={props.required}
        defaultValue={props.defaultValue}
        className="w-full rounded border px-3 py-2 text-sm"
      />
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
      <select
        name={props.name}
        required={props.required}
        className="w-full rounded border px-3 py-2 text-sm"
        defaultValue={props.options[0]?.value ?? ""}
      >
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
      <select
        name={props.name}
        multiple
        required={props.required}
        className="w-full rounded border px-3 py-2 text-sm"
      >
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
