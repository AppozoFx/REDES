import { requireAdmin } from "@/core/auth/guards";
import { adminDb } from "@/lib/firebase/admin";
import { createUsuario } from "../actions";

export default async function NewUsuarioPage() {
  await requireAdmin();

  const rolesSnap = await adminDb().collection("roles").where("estado", "==", "ACTIVO").get();
  const roles = rolesSnap.docs.map((d) => (d.data() as any).id);

  const modSnap = await adminDb().collection("modulos").where("estado", "==", "ACTIVO").orderBy("orden","asc").get();
  const areas = modSnap.docs
    .map((d) => (d.data() as any).key as string)
    .filter((k) => !["ROLES", "MODULOS", "USUARIOS"].includes(k)); // áreas operativas

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Nuevo usuario</h1>

      <form action={createUsuario} className="space-y-4 rounded border p-4">
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="text-sm">Email</label>
            <input name="email" className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="text-sm">Password</label>
            <input name="password" type="password" className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="text-sm">Display Name</label>
            <input name="displayName" className="w-full border rounded px-3 py-2" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded border p-3">
            <div className="font-medium mb-2">Roles</div>
            <div className="space-y-2">
              {roles.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="roles" value={r} />
                  {r}
                </label>
              ))}
              {roles.length === 0 && <div className="text-sm opacity-70">No hay roles activos.</div>}
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
              {areas.length === 0 && <div className="text-sm opacity-70">No hay áreas activas.</div>}
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
