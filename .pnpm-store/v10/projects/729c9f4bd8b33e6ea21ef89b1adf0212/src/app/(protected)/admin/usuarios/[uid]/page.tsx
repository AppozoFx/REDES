import { notFound } from "next/navigation";
import { requirePermission } from "@/core/auth/guards";
import { adminDb } from "@/lib/firebase/admin";
import {
  disableUsuario,
  enableUsuario,
  updateUsuarioAccess,
  updateUsuarioPerfil,
} from "../actions";

function tsToYmd(v: any): string {
  // Firestore Timestamp -> YYYY-MM-DD (para inputs type="date")
  if (!v) return "";
  const d =
    typeof v?.toDate === "function"
      ? v.toDate()
      : v instanceof Date
      ? v
      : null;
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

  const rolesSnap = await adminDb()
    .collection("roles")
    .where("estado", "==", "ACTIVO")
    .get();

  // Ocultar ADMIN en UI normal; si el actor es admin puede verla
  const roles = rolesSnap
    .docs
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

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Usuario</h1>

      <div className="rounded border p-4 text-sm space-y-1">
        <div>
          <b>uid:</b> <span className="font-mono">{uid}</span>
        </div>
        <div>
          <b>email:</b> {profile.email ?? "-"}
        </div>
        <div>
          <b>displayName:</b> {profile.displayName ?? "-"}
        </div>
      </div>

      {/* PERFIL */}
      <form
        action={async (formData) => {
          "use server";
          await updateUsuarioPerfil(uid, formData);
        }}
        className="space-y-4 rounded border p-4"
      >
        <h2 className="font-medium">Perfil</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm">Nombres</label>
            <input
              name="nombres"
              defaultValue={profile.nombres ?? ""}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="text-sm">Apellidos</label>
            <input
              name="apellidos"
              defaultValue={profile.apellidos ?? ""}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="text-sm">Tipo doc</label>
            <select
              name="tipoDoc"
              defaultValue={profile.tipoDoc ?? "DNI"}
              className="w-full border rounded px-3 py-2"
            >
              <option value="DNI">DNI</option>
              <option value="CE">CE</option>
            </select>
          </div>

          <div>
            <label className="text-sm">Nro doc</label>
            <input
              name="nroDoc"
              defaultValue={profile.nroDoc ?? ""}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="text-sm">Celular</label>
            <input
              name="celular"
              defaultValue={profile.celular ?? ""}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="text-sm">Dirección</label>
            <input
              name="direccion"
              defaultValue={profile.direccion ?? ""}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="text-sm">Género</label>
            <select
              name="genero"
              defaultValue={profile.genero ?? "NO_ESPECIFICA"}
              className="w-full border rounded px-3 py-2"
            >
              <option value="NO_ESPECIFICA">No especifica</option>
              <option value="M">Masculino</option>
              <option value="F">Femenino</option>
              <option value="OTRO">Otro</option>
            </select>
          </div>

          <div>
            <label className="text-sm">Nacionalidad</label>
            <input
              name="nacionalidad"
              defaultValue={profile.nacionalidad ?? ""}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="text-sm">F. ingreso</label>
            <input
              name="fIngreso"
              type="date"
              defaultValue={tsToYmd(profile.fIngreso)}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="text-sm">F. nacimiento</label>
            <input
              name="fNacimiento"
              type="date"
              defaultValue={tsToYmd(profile.fNacimiento)}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="text-sm">Estado perfil</label>
            <select
              name="estadoPerfil"
              defaultValue={profile.estadoPerfil ?? "ACTIVO"}
              className="w-full border rounded px-3 py-2"
            >
              <option value="ACTIVO">ACTIVO</option>
              <option value="INACTIVO">INACTIVO</option>
            </select>
          </div>
        </div>

        {/* Recomendados */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t pt-4">
          <div>
            <label className="text-sm">Sede</label>
            <input
              name="sede"
              defaultValue={profile.sede ?? ""}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm">Cargo</label>
            <input
              name="cargo"
              defaultValue={profile.cargo ?? ""}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm">CuadrillaId</label>
            <input
              name="cuadrillaId"
              defaultValue={profile.cuadrillaId ?? ""}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm">Supervisor UID</label>
            <input
              name="supervisorUid"
              defaultValue={profile.supervisorUid ?? ""}
              className="w-full border rounded px-3 py-2"
            />
          </div>
        </div>

        <button className="rounded border px-3 py-2 hover:bg-black/5">
          Guardar perfil
        </button>
      </form>

      {/* ACCESO */}
      <form
        action={async (formData) => {
          "use server";
          await updateUsuarioAccess(uid, formData);
        }}
        className="space-y-4 rounded border p-4"
      >
        <h2 className="font-medium">Acceso</h2>

        <div>
          <label className="text-sm">Estado acceso</label>
          <select
            name="estadoAcceso"
            defaultValue={access.estadoAcceso}
            className="w-full border rounded px-3 py-2"
          >
            <option value="HABILITADO">HABILITADO</option>
            <option value="INHABILITADO">INHABILITADO</option>
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded border p-3">
            <div className="font-medium mb-2">Roles</div>
            <div className="space-y-2">
              {roles.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="roles"
                    value={r}
                    defaultChecked={hasRole(r)}
                  />
                  {r}
                </label>
              ))}
            </div>
          </div>

          <div className="rounded border p-3">
            <div className="font-medium mb-2">Áreas</div>
            <div className="space-y-2">
              {areas.map((a) => (
                <label key={a} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="areas"
                    value={a}
                    defaultChecked={hasArea(a)}
                  />
                  {a}
                </label>
              ))}
            </div>
          </div>
        </div>

        <button className="rounded border px-3 py-2 hover:bg-black/5">
          Guardar acceso
        </button>
      </form>

      {/* HABILITAR / DESHABILITAR */}
      {access.estadoAcceso === "HABILITADO" ? (
        <form
          action={async (formData) => {
            "use server";
            await disableUsuario(uid, formData);
          }}
          className="rounded border border-red-300 p-4 space-y-3"
        >
          <div className="font-medium text-red-700">Deshabilitar usuario</div>
          <input
            name="motivoBaja"
            className="w-full border rounded px-3 py-2"
            placeholder="Motivo..."
            required
          />
          <button className="rounded border border-red-400 px-3 py-2 text-red-700 hover:bg-red-50">
            Deshabilitar
          </button>
        </form>
      ) : (
        <form
          action={async () => {
            "use server";
            await enableUsuario(uid);
          }}
          className="rounded border border-yellow-400 p-4"
        >
          <div className="text-sm mb-3">
            Este usuario está <b>INHABILITADO</b>.
          </div>
          <button className="rounded border px-3 py-2 hover:bg-black/5">
            Habilitar
          </button>
        </form>
      )}
    </div>
  );
}
