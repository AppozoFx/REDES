import Link from "next/link";
import { requireAdmin } from "@/core/auth/guards";
import { adminDb } from "@/lib/firebase/admin";

export default async function RolesPage() {
  await requireAdmin();

  const snap = await adminDb().collection("roles").orderBy("audit.createdAt", "desc").get();
  const roles = snap.docs.map(d => d.data() as any);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Roles</h1>
        <Link className="rounded border px-3 py-2 hover:bg-black/5" href="/admin/roles/new">
          Nuevo rol
        </Link>
      </div>

      <div className="rounded border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-black/5">
            <tr>
              <th className="text-left p-2">ID</th>
              <th className="text-left p-2">Nombre</th>
              <th className="text-left p-2">Estado</th>
              <th className="text-left p-2">Acción</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2 font-mono">{r.id}</td>
                <td className="p-2">{r.nombre}</td>
                <td className="p-2">{r.estado}</td>
                <td className="p-2">
                  <Link className="underline" href={`/admin/roles/${r.id}`}>
                    Ver / editar
                  </Link>
                </td>
              </tr>
            ))}
            {roles.length === 0 && (
              <tr>
                <td className="p-4 opacity-70" colSpan={4}>
                  No hay roles todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
