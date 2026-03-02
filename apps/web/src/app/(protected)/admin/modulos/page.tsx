import Link from "next/link";
import { requireAdmin } from "@/core/auth/guards";
import { adminDb } from "@/lib/firebase/admin";

export default async function ModulesPage() {
  await requireAdmin();

  const snap = await adminDb().collection("modulos").orderBy("orden", "asc").get();
  const modulos = snap.docs.map((d) => d.data() as any);

  return (
    <div className="space-y-4 text-slate-900 dark:text-slate-100">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Modulos</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Gestiona catalogo de modulos y su orden de navegacion.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800/60">
              Total: <b>{modulos.length}</b>
            </div>
            <Link className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700" href="/admin/modulos/new">
              Nuevo modulo
            </Link>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 dark:bg-slate-800">
              <tr>
                <th className="p-3 text-left font-semibold">ID</th>
                <th className="p-3 text-left font-semibold">Key</th>
                <th className="p-3 text-left font-semibold">Nombre</th>
                <th className="p-3 text-left font-semibold">Orden</th>
                <th className="p-3 text-left font-semibold">Estado</th>
                <th className="p-3 text-left font-semibold">Accion</th>
              </tr>
            </thead>
            <tbody>
              {modulos.map((m) => (
                <tr key={m.id} className="border-t border-slate-200 dark:border-slate-700">
                  <td className="p-3 font-mono text-xs">{m.id}</td>
                  <td className="p-3 font-mono text-xs">{m.key}</td>
                  <td className="p-3">{m.nombre || "-"}</td>
                  <td className="p-3">{m.orden ?? 0}</td>
                  <td className="p-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        String(m.estado || "").toUpperCase() === "ACTIVO"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                          : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                      }`}
                    >
                      {m.estado || "-"}
                    </span>
                  </td>
                  <td className="p-3">
                    <Link
                      className="inline-flex h-8 items-center rounded-lg border border-slate-300 px-3 text-xs font-medium transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                      href={`/admin/modulos/${m.id}`}
                    >
                      Ver / editar
                    </Link>
                  </td>
                </tr>
              ))}
              {modulos.length === 0 && (
                <tr>
                  <td className="p-8 text-center text-slate-500 dark:text-slate-400" colSpan={6}>
                    No hay modulos todavia.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
