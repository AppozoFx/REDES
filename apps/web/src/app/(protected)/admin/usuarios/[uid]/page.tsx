import { notFound } from "next/navigation";
import { requireAdmin } from "@/core/auth/guards";
import { adminDb } from "@/lib/firebase/admin";
import { disableUsuario, enableUsuario, updateUsuarioAccess } from "../actions";

export default async function UsuarioDetailPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  await requireAdmin();

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
  const roles = rolesSnap.docs.map((d) => (d.data() as any).id);

  const modSnap = await adminDb().collection("modulos").where("estado", "==", "ACTIVO").orderBy("orden","asc").get();
  const areas = modSnap.docs
    .map((d) => (d.data() as any).key as string)
    .filter((k) => !["ROLES", "MODULOS", "USUARIOS"].includes(k));

  const hasRole = (r: string) => (access.roles ?? []).includes(r);
  const hasArea = (a: string) => (access.areas ?? []).includes(a);

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Usuario</h1>

      <div className="rounded border p-4 text-sm space-y-1">
        <div><b>uid:</b> <span className="font-mono">{uid}</span></div>
        <div><b>email:</b> {profile.email ?? "-"}</div>
        <div><b>displayName:</b> {profile.displayName ?? "-"}</div>
      </div>

      <form action={updateUsuarioAccess.bind(null, uid)} className="space-y-4 rounded border p-4">
        <h2 className="font-medium">Acceso</h2>

        <div>
          <label className="text-sm">Estado acceso</label>
          <select name="estadoAcceso" defaultValue={access.estadoAcceso} className="w-full border rounded px-3 py-2">
            <option value="HABILITADO">HABILITADO</option>
            <option value="INHABILITADO">INHABILITADO</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded border p-3">
            <div className="font-medium mb-2">Roles</div>
            <div className="space-y-2">
              {roles.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="roles" value={r} defaultChecked={hasRole(r)} />
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
                  <input type="checkbox" name="areas" value={a} defaultChecked={hasArea(a)} />
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

      {access.estadoAcceso === "HABILITADO" ? (
        <form action={disableUsuario.bind(null, uid)} className="rounded border border-red-300 p-4 space-y-3">
          <div className="font-medium text-red-700">Deshabilitar usuario</div>
          <input name="motivoBaja" className="w-full border rounded px-3 py-2" placeholder="Motivo..." />
          <button className="rounded border border-red-400 px-3 py-2 text-red-700 hover:bg-red-50">
            Deshabilitar
          </button>
        </form>
      ) : (
        <form action={enableUsuario.bind(null, uid)} className="rounded border border-yellow-400 p-4">
          <div className="text-sm mb-3">Este usuario está <b>INHABILITADO</b>.</div>
          <button className="rounded border px-3 py-2 hover:bg-black/5">
            Habilitar
          </button>
        </form>
      )}
    </div>
  );
}
