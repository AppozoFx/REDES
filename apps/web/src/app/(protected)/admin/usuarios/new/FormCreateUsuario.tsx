"use client";

import Link from "next/link";
import React from "react";
import { useFormStatus } from "react-dom";
import { createUsuario } from "../actions";
import { toast } from "sonner";

const inputClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-blue-900/40";
const selectClass =
  "h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white py-0 pl-3 pr-8 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-blue-900/40 cursor-pointer";
const labelClass = "block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5";

const ChevronDown = () => (
  <svg className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

function SelectWrapper({ children }: { children: React.ReactNode }) {
  return <div className="relative">{children}<ChevronDown /></div>;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  const [done, setDone] = React.useState(false);
  const [wasPending, setWasPending] = React.useState(false);

  React.useEffect(() => {
    if (pending) { setWasPending(true); setDone(false); return; }
    if (!pending && wasPending) {
      setDone(true); setWasPending(false);
      const t = setTimeout(() => setDone(false), 1300);
      return () => clearTimeout(t);
    }
  }, [pending, wasPending]);

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-xl bg-[#30518c] px-5 py-2 text-sm font-medium text-white shadow-[0_4px_12px_rgba(48,81,140,.3)] transition hover:bg-[#2b4880] active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (
        <><span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Creando…</>
      ) : done ? (
        <><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>Usuario creado</>
      ) : (
        <><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>Crear usuario</>
      )}
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
    <form action={formAction} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <fieldset disabled={pending} aria-busy={pending} className={`${pending ? "opacity-80" : ""}`}>

        {/* ── Credenciales ── */}
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Credenciales de acceso</h2>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
          <div>
            <label className={labelClass}>Email</label>
            <input name="email" type="email" placeholder="correo@empresa.com" className={inputClass} required />
          </div>
          <div>
            <label className={labelClass}>Contraseña</label>
            <input name="password" type="password" placeholder="Mínimo 8 caracteres" className={inputClass} required />
          </div>
        </div>

        {/* ── Perfil ── */}
        <div className="border-y border-slate-100 px-5 py-4 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Perfil personal</h2>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
          <div>
            <label className={labelClass}>Nombres</label>
            <input name="nombres" placeholder="Pedro Luis" className={inputClass} required />
          </div>
          <div>
            <label className={labelClass}>Apellidos</label>
            <input name="apellidos" placeholder="García Pérez" className={inputClass} required />
          </div>
          <div>
            <label className={labelClass}>Tipo de documento</label>
            <SelectWrapper>
              <select name="tipoDoc" className={selectClass} defaultValue="DNI">
                <option value="DNI">DNI</option>
                <option value="CE">CE</option>
              </select>
            </SelectWrapper>
          </div>
          <div>
            <label className={labelClass}>Nro. de documento</label>
            <input name="nroDoc" placeholder="12345678" className={inputClass} required />
          </div>
          <div>
            <label className={labelClass}>Celular</label>
            <input name="celular" placeholder="999 888 777" className={inputClass} required />
          </div>
          <div>
            <label className={labelClass}>Dirección</label>
            <input name="direccion" placeholder="Av. Principal 123" className={inputClass} required />
          </div>
          <div>
            <label className={labelClass}>Género</label>
            <SelectWrapper>
              <select name="genero" className={selectClass} defaultValue="NO_ESPECIFICA">
                <option value="NO_ESPECIFICA">No especifica</option>
                <option value="M">Masculino</option>
                <option value="F">Femenino</option>
                <option value="OTRO">Otro</option>
              </select>
            </SelectWrapper>
          </div>
          <div>
            <label className={labelClass}>Nacionalidad</label>
            <input name="nacionalidad" defaultValue="PERUANA" className={inputClass} required />
          </div>
          <div>
            <label className={labelClass}>Fecha de ingreso</label>
            <input name="fIngreso" type="date" className={inputClass} required />
          </div>
          <div>
            <label className={labelClass}>Fecha de nacimiento</label>
            <input name="fNacimiento" type="date" className={inputClass} required />
          </div>
          <div>
            <label className={labelClass}>Estado de perfil</label>
            <SelectWrapper>
              <select name="estadoPerfil" className={selectClass} defaultValue="ACTIVO">
                <option value="ACTIVO">ACTIVO</option>
                <option value="INACTIVO">INACTIVO</option>
              </select>
            </SelectWrapper>
          </div>
        </div>

        {/* ── Asignaciones ── */}
        <div className="border-y border-slate-100 px-5 py-4 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
            </svg>
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Asignaciones operativas (opcional)</h2>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
          <div>
            <label className={labelClass}>Sede</label>
            <input name="sede" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Cargo</label>
            <input name="cargo" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Cuadrilla ID</label>
            <input name="cuadrillaId" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Supervisor UID</label>
            <input name="supervisorUid" className={inputClass} />
          </div>
        </div>

        {/* ── Roles & Áreas ── */}
        <div className="border-y border-slate-100 px-5 py-4 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Acceso inicial</h2>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="border-b border-slate-100 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Roles</p>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {roles.map((r) => (
                <label key={r} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <input type="checkbox" name="roles" value={r} className="h-4 w-4 rounded accent-[#30518c] cursor-pointer" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{r}</span>
                </label>
              ))}
              {roles.length === 0 && <div className="px-3 py-4 text-xs text-slate-400 dark:text-slate-500">No hay roles activos.</div>}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="border-b border-slate-100 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Áreas</p>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {areas.map((a) => (
                <label key={a} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <input type="checkbox" name="areas" value={a} className="h-4 w-4 rounded accent-[#30518c] cursor-pointer" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{a}</span>
                </label>
              ))}
              {areas.length === 0 && <div className="px-3 py-4 text-xs text-slate-400 dark:text-slate-500">No hay áreas activas.</div>}
            </div>
          </div>
        </div>

        {/* ── Error & Footer ── */}
        {state?.ok === false && state?.error?.formErrors?.length > 0 && (
          <div className="mx-5 mb-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800/60 dark:bg-rose-900/20 dark:text-rose-400">
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {state.error.formErrors[0]}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 dark:border-slate-700">
          <Link
            href={cancelHref}
            className="text-sm text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Cancelar
          </Link>
          <SubmitButton />
        </div>
      </fieldset>
    </form>
  );
}
