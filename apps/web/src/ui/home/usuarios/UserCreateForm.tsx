"use client";

import { useActionState } from "react";
import { homeCreateUserAction, type CreateState } from "@/app/(protected)/home/usuarios/new/actions";

export default function UserCreateForm({
  rolesAllowed,
}: {
  rolesAllowed: { id: string; nombre: string }[];
}) {
  const [state, action, pending] = useActionState<CreateState, FormData>(
    homeCreateUserAction,
    { ok: true }
  );

  return (
    <form action={action} className="space-y-4 max-w-2xl">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-sm font-medium">Email</label>
          <input name="email" className="w-full rounded border px-3 py-2 text-sm" />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Password</label>
          <input name="password" type="password" className="w-full rounded border px-3 py-2 text-sm" />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Nombres</label>
          <input name="nombres" className="w-full rounded border px-3 py-2 text-sm" />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Apellidos</label>
          <input name="apellidos" className="w-full rounded border px-3 py-2 text-sm" />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Tipo Doc</label>
          <select name="tipoDoc" className="w-full rounded border px-3 py-2 text-sm">
            <option value="DNI">DNI</option>
            <option value="CE">CE</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Nro Doc</label>
          <input name="nroDoc" className="w-full rounded border px-3 py-2 text-sm" />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Celular</label>
          <input name="celular" className="w-full rounded border px-3 py-2 text-sm" />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Dirección</label>
          <input name="direccion" className="w-full rounded border px-3 py-2 text-sm" />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Género</label>
          <select name="genero" className="w-full rounded border px-3 py-2 text-sm">
            <option value="M">M</option>
            <option value="F">F</option>
            <option value="OTRO">OTRO</option>
            <option value="NO_ESPECIFICA">NO ESPECIFICA</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Nacionalidad</label>
          <input name="nacionalidad" className="w-full rounded border px-3 py-2 text-sm" />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">F. Ingreso</label>
          <input name="fIngreso" type="date" className="w-full rounded border px-3 py-2 text-sm" />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">F. Nacimiento</label>
          <input name="fNacimiento" type="date" className="w-full rounded border px-3 py-2 text-sm" />
        </div>

        <div className="space-y-1 col-span-2">
          <label className="text-sm font-medium">Rol inicial</label>
          <select name="rolInicial" className="w-full rounded border px-3 py-2 text-sm">
            {rolesAllowed.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre} ({r.id})
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            No se asignan áreas ni permisos directos desde Home.
          </p>
        </div>
      </div>

      {state.ok === false && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm">
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded border px-4 py-2 text-sm hover:bg-muted disabled:opacity-60"
      >
        {pending ? "Creando..." : "Crear usuario"}
      </button>
    </form>
  );
}
