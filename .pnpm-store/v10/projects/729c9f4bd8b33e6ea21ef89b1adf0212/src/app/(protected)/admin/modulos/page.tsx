import Link from "next/link";
import { requireAdmin } from "@/core/auth/guards";
import { adminDb } from "@/lib/firebase/admin";

export default async function ModulesPage() {
  await requireAdmin();

  const snap = await adminDb().collection("modulos").orderBy("orden", "asc").get();
  const modulos = snap.docs.map((d) => d.data() as any);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Módulos</h1>
        <Link className="rounded border px-3 py-2 hover:bg-black/5" href="/admin/modulos/new">
          Nuevo módulo
        </Link>
      </div>

      <div className="rounded border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-black/5">
            <tr>
              <th className="text-left p-2">ID</th>
              <th className="text-left p-2">Key</th>
              <th className="text-left p-2">Nombre</th>
              <th className="text-left p-2">Orden</th>
              <th className="text-left p-2">Estado</th>
              <th className="text-left p-2">Acción</th>
            </tr>
          </thead>
          <tbody>
            {modulos.map((m) => (
              <tr key={m.id} className="border-t">
                <td className="p-2 font-mono">{m.id}</td>
                <td className="p-2 font-mono">{m.key}</td>
                <td className="p-2">{m.nombre}</td>
                <td className="p-2">{m.orden}</td>
                <td className="p-2">{m.estado}</td>
                <td className="p-2">
                  <Link className="underline" href={`/admin/modulos/${m.id}`}>
                    Ver / editar
                  </Link>
                </td>
              </tr>
            ))}

            {modulos.length === 0 && (
              <tr>
                <td className="p-4 opacity-70" colSpan={6}>
                  No hay módulos todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
