import Link from "next/link";
import { requireAuth, requirePermission } from "@/core/auth/guards";
import { listUsuariosForHome } from "@/domain/usuarios/repo";

export default async function HomeUsuariosPage() {
  const session = await requireAuth();
  await requirePermission("USERS_LIST");

  const canCreate = session.permissions?.includes("USERS_CREATE") ?? false;
  const rows = await listUsuariosForHome(60);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Usuarios</h1>

        <div className="flex items-center gap-2">
          {canCreate && (
            <Link
              className="rounded border px-3 py-2 text-sm hover:bg-muted"
              href="/home/usuarios/new"
            >
              Crear
            </Link>
          )}

          <Link
            className="rounded border px-3 py-2 text-sm hover:bg-muted"
            href="/home"
          >
            Inicio
          </Link>
        </div>
      </div>

      <div className="rounded border overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-2">UID</th>
              <th className="p-2">Nombre</th>
              <th className="p-2">Roles</th>
              <th className="p-2">Áreas</th>
              <th className="p-2">Estado</th>
              <th className="p-2">Acción</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.uid} className="border-t">
                <td className="p-2 font-mono text-xs">{u.uid}</td>
                <td className="p-2">
                  {u.nombres} {u.apellidos}
                </td>
                <td className="p-2">{(u.roles ?? []).join(", ")}</td>
                <td className="p-2">{(u.areas ?? []).join(", ")}</td>
                <td className="p-2">{u.estadoAcceso}</td>
                <td className="p-2">
                  <Link className="underline" href={`/home/usuarios/${u.uid}`}>
                    Ver / editar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        En Home se edita solo perfil (nombres/apellidos/contacto). RBAC se gestiona en Admin.
      </p>
    </div>
  );
}
