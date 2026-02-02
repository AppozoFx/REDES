import { requirePermission } from "@/core/auth/guards";
import { adminDb } from "@/lib/firebase/admin";
import { createUsuario } from "../actions";

export default async function NewUsuarioPage() {
  await requirePermission("USERS_CREATE");

  const rolesSnap = await adminDb()
    .collection("roles")
    .where("estado", "==", "ACTIVO")
    .get();

  const roles = rolesSnap.docs.map((d) => d.id);

  const modSnap = await adminDb()
    .collection("modulos")
    .where("estado", "==", "ACTIVO")
    .orderBy("orden", "asc")
    .get();

  const areas = modSnap.docs
    .map((d) => (d.data() as any).key as string)
    .filter((k) => !["ROLES", "MODULOS", "USUARIOS", "PERMISSIONS"].includes(k));

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Nuevo usuario</h1>

      <form action={createUsuario} className="space-y-4 rounded border p-4">
        {/* Auth */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm">Email</label>
            <input name="email" className="w-full border rounded px-3 py-2" required />
          </div>
          <div>
            <label className="text-sm">Password</label>
            <input
              name="password"
              type="password"
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>
        </div>

        {/* Perfil requerido */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm">Nombres</label>
            <input name="nombres" className="w-full border rounded px-3 py-2" required />
          </div>
          <div>
            <label className="text-sm">Apellidos</label>
            <input name="apellidos" className="w-full border rounded px-3 py-2" required />
          </div>

          <div>
            <label className="text-sm">Tipo doc</label>
            <select name="tipoDoc" className="w-full border rounded px-3 py-2" defaultValue="DNI">
              <option value="DNI">DNI</option>
              <option value="CE">CE</option>
            </select>
          </div>
          <div>
            <label className="text-sm">Nro doc</label>
            <input name="nroDoc" className="w-full border rounded px-3 py-2" required />
          </div>

          <div>
            <label className="text-sm">Celular</label>
            <input name="celular" className="w-full border rounded px-3 py-2" required />
          </div>
          <div>
            <label className="text-sm">Dirección</label>
            <input name="direccion" className="w-full border rounded px-3 py-2" required />
          </div>

          <div>
            <label className="text-sm">Género</label>
            <select
              name="genero"
              className="w-full border rounded px-3 py-2"
              defaultValue="NO_ESPECIFICA"
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
              defaultValue="PERUANA"
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="text-sm">F. ingreso</label>
            <input name="fIngreso" type="date" className="w-full border rounded px-3 py-2" required />
          </div>
          <div>
            <label className="text-sm">F. nacimiento</label>
            <input
              name="fNacimiento"
              type="date"
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="text-sm">Estado perfil</label>
            <select
              name="estadoPerfil"
              className="w-full border rounded px-3 py-2"
              defaultValue="ACTIVO"
            >
              <option value="ACTIVO">ACTIVO</option>
              <option value="INACTIVO">INACTIVO</option>
            </select>
          </div>
        </div>

        {/* Recomendados (opcionales) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t pt-4">
          <div>
            <label className="text-sm">Sede (opcional)</label>
            <input name="sede" className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="text-sm">Cargo (opcional)</label>
            <input name="cargo" className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="text-sm">CuadrillaId (opcional)</label>
            <input name="cuadrillaId" className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="text-sm">Supervisor UID (opcional)</label>
            <input name="supervisorUid" className="w-full border rounded px-3 py-2" />
          </div>
        </div>

        {/* Roles / Áreas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
          <div className="rounded border p-3">
            <div className="font-medium mb-2">Roles</div>
            <div className="space-y-2">
              {roles.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="roles" value={r} />
                  {r}
                </label>
              ))}
              {roles.length === 0 && (
                <div className="text-sm opacity-70">No hay roles activos.</div>
              )}
            </div>
          </div>

          <div className="rounded border p-3">
            <div className="font-medium mb-2">Áreas</div>
            <div className="space-y-2">
              {areas.map((a) => (
                <label key={a} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="areas" value={a} />
                  {a}
                </label>
              ))}
              {areas.length === 0 && (
                <div className="text-sm opacity-70">No hay áreas activas.</div>
              )}
            </div>
          </div>
        </div>

        <button className="rounded border px-3 py-2 hover:bg-black/5">
          Crear usuario
        </button>
      </form>
    </div>
  );
}
