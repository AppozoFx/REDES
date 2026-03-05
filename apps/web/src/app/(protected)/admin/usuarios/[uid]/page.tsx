import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission } from "@/core/auth/guards";
import { adminDb } from "@/lib/firebase/admin";
import {
  disableUsuario,
  enableUsuario,
  updateUsuarioAccess,
  updateUsuarioPerfil,
} from "../actions";
import { PendingFieldset, SubmitActionButton } from "./FormUi";

function tsToYmd(v: any): string {
  if (!v) return "";
  const d = typeof v?.toDate === "function" ? v.toDate() : v instanceof Date ? v : null;
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
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

  return (
    <div className="space-y-5 text-slate-900 dark:text-slate-100">
      <div className="flex items-center">
        <Link
          href="/admin/usuarios"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <span aria-hidden>←</span>
          Regresar a usuarios
        </Link>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Editar usuario</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Perfil, correo de ingreso, roles, areas y estado de acceso.
            </p>
          </div>
          <span
            className={cx(
              "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
              accesoHabilitado
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
            )}
          >
            {accesoHabilitado ? "HABILITADO" : "INHABILITADO"}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/50">
            <div className="text-xs text-slate-500">Usuario</div>
            <div className="mt-1 font-medium">{displayName}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/50">
            <div className="text-xs text-slate-500">Correo actual</div>
            <div className="mt-1 font-medium break-all">{profile.email ?? "-"}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/50">
            <div className="text-xs text-slate-500">UID</div>
            <div className="mt-1 font-mono text-xs break-all">{uid}</div>
          </div>
        </div>
      </section>

      <form
        action={async (formData) => {
          "use server";
          await updateUsuarioPerfil(uid, formData);
        }}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
      >
        <PendingFieldset>
          <div>
            <h2 className="text-base font-semibold">Perfil</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Puedes actualizar aqui el correo que usa para iniciar sesion.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="text-sm">Correo de acceso</label>
              <input name="email" type="email" defaultValue={profile.email ?? ""} className="ui-input" />
            </div>
            <div>
              <label className="text-sm">Estado perfil</label>
              <select name="estadoPerfil" defaultValue={profile.estadoPerfil ?? "ACTIVO"} className="ui-select">
                <option value="ACTIVO">ACTIVO</option>
                <option value="INACTIVO">INACTIVO</option>
              </select>
            </div>

            <div>
              <label className="text-sm">Nombres</label>
              <input name="nombres" defaultValue={profile.nombres ?? ""} className="ui-input" />
            </div>
            <div>
              <label className="text-sm">Apellidos</label>
              <input name="apellidos" defaultValue={profile.apellidos ?? ""} className="ui-input" />
            </div>

            <div>
              <label className="text-sm">Tipo doc</label>
              <select name="tipoDoc" defaultValue={profile.tipoDoc ?? "DNI"} className="ui-select">
                <option value="DNI">DNI</option>
                <option value="CE">CE</option>
              </select>
            </div>
            <div>
              <label className="text-sm">Nro doc</label>
              <input name="nroDoc" defaultValue={profile.nroDoc ?? ""} className="ui-input" />
            </div>

            <div>
              <label className="text-sm">Celular</label>
              <input name="celular" defaultValue={profile.celular ?? ""} className="ui-input" />
            </div>
            <div>
              <label className="text-sm">Direccion</label>
              <input name="direccion" defaultValue={profile.direccion ?? ""} className="ui-input" />
            </div>

            <div>
              <label className="text-sm">Genero</label>
              <select name="genero" defaultValue={profile.genero ?? "NO_ESPECIFICA"} className="ui-select">
                <option value="NO_ESPECIFICA">No especifica</option>
                <option value="M">Masculino</option>
                <option value="F">Femenino</option>
                <option value="OTRO">Otro</option>
              </select>
            </div>
            <div>
              <label className="text-sm">Nacionalidad</label>
              <input name="nacionalidad" defaultValue={profile.nacionalidad ?? ""} className="ui-input" />
            </div>

            <div>
              <label className="text-sm">F. ingreso</label>
              <input name="fIngreso" type="date" defaultValue={tsToYmd(profile.fIngreso)} className="ui-input" />
            </div>
            <div>
              <label className="text-sm">F. nacimiento</label>
              <input name="fNacimiento" type="date" defaultValue={tsToYmd(profile.fNacimiento)} className="ui-input" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 border-t border-slate-200 pt-4 md:grid-cols-2 dark:border-slate-700">
            <div>
              <label className="text-sm">Sede</label>
              <input name="sede" defaultValue={profile.sede ?? ""} className="ui-input" />
            </div>
            <div>
              <label className="text-sm">Cargo</label>
              <input name="cargo" defaultValue={profile.cargo ?? ""} className="ui-input" />
            </div>
            <div>
              <label className="text-sm">CuadrillaId</label>
              <input name="cuadrillaId" defaultValue={profile.cuadrillaId ?? ""} className="ui-input" />
            </div>
            <div>
              <label className="text-sm">Supervisor UID</label>
              <input name="supervisorUid" defaultValue={profile.supervisorUid ?? ""} className="ui-input" />
            </div>
          </div>

          <SubmitActionButton
            idleText="Guardar perfil"
            pendingText="Guardando perfil..."
            doneText="Perfil guardado"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          />
        </PendingFieldset>
      </form>

      <form
        action={async (formData) => {
          "use server";
          await updateUsuarioAccess(uid, formData);
        }}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
      >
        <PendingFieldset>
          <h2 className="text-base font-semibold">Acceso y permisos</h2>

          <div>
            <label className="text-sm">Estado acceso</label>
            <select name="estadoAcceso" defaultValue={access.estadoAcceso} className="ui-select">
              <option value="HABILITADO">HABILITADO</option>
              <option value="INHABILITADO">INHABILITADO</option>
            </select>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <div className="mb-2 font-medium">Roles</div>
              <div className="grid grid-cols-1 gap-2">
                {roles.map((r) => (
                  <label key={r} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="roles" value={r} defaultChecked={hasRole(r)} />
                    {r}
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <div className="mb-2 font-medium">Areas</div>
              <div className="grid grid-cols-1 gap-2">
                {areas.map((a) => (
                  <label key={a} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="areas" value={a} defaultChecked={hasArea(a)} />
                    {a}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <SubmitActionButton
            idleText="Guardar acceso"
            pendingText="Guardando acceso..."
            doneText="Acceso guardado"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm transition hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
          />
        </PendingFieldset>
      </form>

      {accesoHabilitado ? (
        <form
          action={async (formData) => {
            "use server";
            await disableUsuario(uid, formData);
          }}
          className="space-y-3 rounded-xl border border-rose-300 bg-rose-50 p-4 dark:border-rose-800 dark:bg-rose-900/20"
        >
          <PendingFieldset>
            <div className="font-medium text-rose-700 dark:text-rose-300">Deshabilitar usuario</div>
            <input name="motivoBaja" className="ui-input" placeholder="Motivo de baja" required />
            <SubmitActionButton
              idleText="Deshabilitar"
              pendingText="Deshabilitando..."
              doneText="Usuario deshabilitado"
              className="rounded-lg border border-rose-400 px-4 py-2 text-sm text-rose-700 transition hover:bg-rose-100 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-900/40"
            />
          </PendingFieldset>
        </form>
      ) : (
        <form
          action={async () => {
            "use server";
            await enableUsuario(uid);
          }}
          className="space-y-3 rounded-xl border border-amber-400 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20"
        >
          <PendingFieldset>
            <div className="text-sm">Este usuario esta <b>INHABILITADO</b>.</div>
            <SubmitActionButton
              idleText="Habilitar"
              pendingText="Habilitando..."
              doneText="Usuario habilitado"
              className="rounded-lg border border-amber-500 px-4 py-2 text-sm transition hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900/40"
            />
          </PendingFieldset>
        </form>
      )}
    </div>
  );
}
