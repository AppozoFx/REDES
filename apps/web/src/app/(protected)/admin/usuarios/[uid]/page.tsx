import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission } from "@/core/auth/guards";
import { adminDb } from "@/lib/firebase/admin";
import {
  updateUsuarioPerfilForm,
  updateUsuarioAccessForm,
  disableUsuarioForm,
  enableUsuarioForm,
} from "../actions";
import { PendingFieldset, SubmitActionButton } from "./FormUi";
import { FormWrapper } from "./FormWrapper";

function tsToYmd(v: any): string {
  if (!v) return "";
  const d = typeof v?.toDate === "function" ? v.toDate() : v instanceof Date ? v : null;
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

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
function SelectWrap({ children }: { children: React.ReactNode }) {
  return <div className="relative">{children}<ChevronDown /></div>;
}

export default async function UsuarioDetailPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const session = await requirePermission("USERS_EDIT");

  const { uid } = await params;
  if (!uid) return notFound();

  const [profileDoc, accessDoc] = await Promise.all([
    adminDb().collection("usuarios").doc(uid).get(),
    adminDb().collection("usuarios_access").doc(uid).get(),
  ]);

  if (!accessDoc.exists) return notFound();

  const profile = profileDoc.exists ? (profileDoc.data() as any) : {};
  const access = accessDoc.data() as any;

  const rolesSnap = await adminDb().collection("roles").where("estado", "==", "ACTIVO").get();
  const roles = rolesSnap.docs
    .map((d) => d.id)
    .filter((r) => (session.isAdmin ? true : r !== "ADMIN"));

  const modSnap = await adminDb()
    .collection("modulos")
    .where("estado", "==", "ACTIVO")
    .orderBy("orden", "asc")
    .get();

  const areas = modSnap.docs
    .map((d) => (d.data() as any).key as string)
    .filter((k) => !["ROLES", "MODULOS", "USUARIOS", "PERMISSIONS"].includes(k));

  const hasRole = (r: string) => (access.roles ?? []).includes(r);
  const hasArea = (a: string) => (access.areas ?? []).includes(a);

  const displayName = String(profile.displayName || `${profile.nombres || ""} ${profile.apellidos || ""}`.trim() || uid);
  const accesoHabilitado = String(access.estadoAcceso || "HABILITADO") === "HABILITADO";
  const initials = displayName.split(/\s+/).filter(Boolean).map((p: string) => p[0]).slice(0, 2).join("").toUpperCase() || uid.slice(0, 2).toUpperCase();

  const perfilAction = updateUsuarioPerfilForm.bind(null, uid);
  const accessAction = updateUsuarioAccessForm.bind(null, uid);
  const disableAction = disableUsuarioForm.bind(null, uid);
  const enableAction = enableUsuarioForm.bind(null, uid);

  return (
    <div className="space-y-5 text-slate-900 dark:text-slate-100">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/usuarios"
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <div className="flex flex-1 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#30518c] text-sm font-bold text-white shadow-[0_8px_20px_rgba(48,81,140,.3)]">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-bold tracking-tight">{displayName}</h1>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  accesoHabilitado
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-300"
                    : "border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/60 dark:bg-rose-900/30 dark:text-rose-300"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${accesoHabilitado ? "bg-emerald-500" : "bg-rose-500"}`} />
                {accesoHabilitado ? "Habilitado" : "Inhabilitado"}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Perfil, acceso, roles, áreas y estado.</p>
          </div>
        </div>
      </div>

      {/* ── Info cards ── */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Nombre</p>
          <p className="mt-1 text-sm font-medium">{displayName}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Correo actual</p>
          <p className="mt-1 truncate text-sm font-medium">{profile.email ?? "—"}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">UID</p>
          <p className="mt-1 truncate font-mono text-xs text-slate-600 dark:text-slate-400">{uid}</p>
        </div>
      </div>

      {/* ── Perfil ── */}
      <FormWrapper
        action={perfilAction}
        successMsg="Perfil actualizado correctamente"
        failMsg="Error al guardar el perfil"
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 dark:border-slate-700">
          <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
          </svg>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Datos de perfil</h2>
          <p className="ml-auto text-xs text-slate-400 dark:text-slate-500">Incluye el correo de inicio de sesión</p>
        </div>

        <PendingFieldset>
          <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
            <div>
              <label className={labelClass}>Correo de acceso</label>
              <input name="email" type="email" defaultValue={profile.email ?? ""} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Estado de perfil</label>
              <SelectWrap>
                <select name="estadoPerfil" defaultValue={profile.estadoPerfil ?? "ACTIVO"} className={selectClass}>
                  <option value="ACTIVO">ACTIVO</option>
                  <option value="INACTIVO">INACTIVO</option>
                </select>
              </SelectWrap>
            </div>
            <div>
              <label className={labelClass}>Nombres</label>
              <input name="nombres" defaultValue={profile.nombres ?? ""} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Apellidos</label>
              <input name="apellidos" defaultValue={profile.apellidos ?? ""} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Tipo de documento</label>
              <SelectWrap>
                <select name="tipoDoc" defaultValue={profile.tipoDoc ?? "DNI"} className={selectClass}>
                  <option value="DNI">DNI</option>
                  <option value="CE">CE</option>
                </select>
              </SelectWrap>
            </div>
            <div>
              <label className={labelClass}>Nro. de documento</label>
              <input name="nroDoc" defaultValue={profile.nroDoc ?? ""} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Celular</label>
              <input name="celular" defaultValue={profile.celular ?? ""} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Dirección</label>
              <input name="direccion" defaultValue={profile.direccion ?? ""} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Género</label>
              <SelectWrap>
                <select name="genero" defaultValue={profile.genero ?? "NO_ESPECIFICA"} className={selectClass}>
                  <option value="NO_ESPECIFICA">No especifica</option>
                  <option value="M">Masculino</option>
                  <option value="F">Femenino</option>
                  <option value="OTRO">Otro</option>
                </select>
              </SelectWrap>
            </div>
            <div>
              <label className={labelClass}>Nacionalidad</label>
              <input name="nacionalidad" defaultValue={profile.nacionalidad ?? ""} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Fecha de ingreso</label>
              <input name="fIngreso" type="date" defaultValue={tsToYmd(profile.fIngreso)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Fecha de nacimiento</label>
              <input name="fNacimiento" type="date" defaultValue={tsToYmd(profile.fNacimiento)} className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 border-t border-slate-100 p-5 md:grid-cols-2 dark:border-slate-700">
            <div>
              <label className={labelClass}>Sede</label>
              <input name="sede" defaultValue={profile.sede ?? ""} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Cargo</label>
              <input name="cargo" defaultValue={profile.cargo ?? ""} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Cuadrilla ID</label>
              <input name="cuadrillaId" defaultValue={profile.cuadrillaId ?? ""} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Supervisor UID</label>
              <input name="supervisorUid" defaultValue={profile.supervisorUid ?? ""} className={inputClass} />
            </div>
          </div>

          <div className="flex justify-end border-t border-slate-100 px-5 py-4 dark:border-slate-700">
            <SubmitActionButton
              idleText="Guardar perfil"
              pendingText="Guardando…"
              doneText="Perfil guardado"
              className="inline-flex items-center gap-2 rounded-xl bg-[#30518c] px-5 py-2 text-sm font-medium text-white shadow-[0_4px_12px_rgba(48,81,140,.3)] transition hover:bg-[#2b4880] active:scale-[.98]"
            />
          </div>
        </PendingFieldset>
      </FormWrapper>

      {/* ── Acceso y permisos ── */}
      <FormWrapper
        action={accessAction}
        successMsg="Acceso actualizado correctamente"
        failMsg="Error al guardar el acceso"
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 dark:border-slate-700">
          <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Acceso y permisos</h2>
        </div>

        <PendingFieldset>
          <div className="p-5 space-y-4">
            <div className="max-w-xs space-y-1.5">
              <label className={labelClass}>Estado de acceso</label>
              <div className="relative">
                <select name="estadoAcceso" defaultValue={access.estadoAcceso} className={selectClass}>
                  <option value="HABILITADO">HABILITADO</option>
                  <option value="INHABILITADO">INHABILITADO</option>
                </select>
                <ChevronDown />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="border-b border-slate-100 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Roles</p>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
                  {roles.map((r) => (
                    <label key={r} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <input type="checkbox" name="roles" value={r} defaultChecked={hasRole(r)} className="h-4 w-4 rounded accent-[#30518c] cursor-pointer" />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{r}</span>
                    </label>
                  ))}
                  {roles.length === 0 && <p className="px-3 py-4 text-xs text-slate-400">Sin roles activos.</p>}
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="border-b border-slate-100 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Áreas</p>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
                  {areas.map((a) => (
                    <label key={a} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <input type="checkbox" name="areas" value={a} defaultChecked={hasArea(a)} className="h-4 w-4 rounded accent-[#30518c] cursor-pointer" />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{a}</span>
                    </label>
                  ))}
                  {areas.length === 0 && <p className="px-3 py-4 text-xs text-slate-400">Sin áreas activas.</p>}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end border-t border-slate-100 px-5 py-4 dark:border-slate-700">
            <SubmitActionButton
              idleText="Guardar acceso"
              pendingText="Guardando…"
              doneText="Acceso guardado"
              className="inline-flex items-center gap-2 rounded-xl bg-[#30518c] px-5 py-2 text-sm font-medium text-white shadow-[0_4px_12px_rgba(48,81,140,.3)] transition hover:bg-[#2b4880] active:scale-[.98]"
            />
          </div>
        </PendingFieldset>
      </FormWrapper>

      {/* ── Deshabilitar / Habilitar ── */}
      {accesoHabilitado ? (
        <FormWrapper
          action={disableAction}
          successMsg="Usuario deshabilitado"
          failMsg="No se pudo deshabilitar el usuario"
          className="overflow-hidden rounded-2xl border border-rose-200 bg-white shadow-sm dark:border-rose-800/60 dark:bg-slate-900"
        >
          <div className="flex items-center gap-2 border-b border-rose-100 bg-rose-50/60 px-5 py-4 dark:border-rose-800/40 dark:bg-rose-900/10">
            <svg className="h-4 w-4 text-rose-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <h2 className="text-sm font-semibold text-rose-700 dark:text-rose-400">Deshabilitar usuario</h2>
          </div>
          <PendingFieldset>
            <div className="space-y-4 p-5">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                El usuario perderá acceso al sistema hasta que sea habilitado nuevamente.
              </p>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Motivo de baja <span className="text-rose-500">*</span>
                </label>
                <input
                  name="motivoBaja"
                  placeholder="Describe el motivo"
                  required
                  className="h-10 w-full rounded-xl border border-rose-200 bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 dark:border-rose-800/60 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-rose-900/40"
                />
              </div>
              <div className="flex justify-end">
                <SubmitActionButton
                  idleText="Deshabilitar"
                  pendingText="Deshabilitando…"
                  doneText="Usuario deshabilitado"
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100 dark:border-rose-700 dark:bg-rose-900/20 dark:text-rose-400 dark:hover:bg-rose-900/40"
                />
              </div>
            </div>
          </PendingFieldset>
        </FormWrapper>
      ) : (
        <FormWrapper
          action={enableAction}
          successMsg="Usuario habilitado correctamente"
          failMsg="No se pudo habilitar el usuario"
          className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm dark:border-amber-700/60 dark:bg-slate-900"
        >
          <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50/60 px-5 py-4 dark:border-amber-700/40 dark:bg-amber-900/10">
            <svg className="h-4 w-4 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <h2 className="text-sm font-semibold text-amber-700 dark:text-amber-400">Usuario inhabilitado</h2>
          </div>
          <PendingFieldset>
            <div className="flex items-center justify-between gap-4 p-5">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Este usuario está <strong>INHABILITADO</strong>. Habilitarlo le devolverá el acceso al sistema.
              </p>
              <SubmitActionButton
                idleText="Habilitar"
                pendingText="Habilitando…"
                doneText="Usuario habilitado"
                className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/40"
              />
            </div>
          </PendingFieldset>
        </FormWrapper>
      )}
    </div>
  );
}
