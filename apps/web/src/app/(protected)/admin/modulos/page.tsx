import Link from "next/link";
import { requireAdmin } from "@/core/auth/guards";
import { adminDb } from "@/lib/firebase/admin";

export default async function ModulesPage() {
  await requireAdmin();

  const snap = await adminDb().collection("modulos").orderBy("orden", "asc").get();
  const modulos = snap.docs.map((d) => d.data() as any);

  return (
    <div className="space-y-4 text-slate-900 dark:text-slate-100">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Módulos</h1>
        <Link className="rounded border border-slate-300 px-3 py-2 hover:bg-black/5 dark:border-slate-700 dark:hover:bg-slate-800" href="/admin/modulos/new">
          Nuevo módulo
        </Link>
      </div>

      <div className="rounded border border-slate-200 overflow-hidden dark:border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-black/5 dark:bg-slate-800">
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
              <tr key={m.id} className="border-t border-slate-200 dark:border-slate-700">
                <td className="p-2 font-mono">{m.id}</td>
                <td className="p-2 font-mono">{m.key}</td>
                <td className="p-2">{m.nombre}</td>
                <td className="p-2">{m.orden}</td>
                <td className="p-2">{m.estado}</td>
                <td className="p-2">
                  <Link className="underline decoration-slate-400 underline-offset-2 dark:decoration-slate-500" href={`/admin/modulos/${m.id}`}>
                    Ver / editar
                  </Link>
                </td>
              </tr>
            ))}

            {modulos.length === 0 && (
              <tr>
                <td className="p-4 text-slate-500 dark:text-slate-400" colSpan={6}>
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
