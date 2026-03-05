import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/guards";
import { adminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

function toMetros(cm: number) {
  return Number((cm / 100).toFixed(2));
}

export default async function HomeAlmacenMaterialesPage() {
  const session = await requireAuth();
  const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
  const isAlmacen = session.isAdmin || roles.includes("ALMACEN");
  if (!isAlmacen) redirect("/home");

  const matSnap = await adminDb().collection("materiales").limit(3000).get();
  const ids = matSnap.docs.map((d) => d.id);
  const refs = ids.map((id) => adminDb().collection("almacen_stock").doc(id));
  const stockSnaps = refs.length ? await adminDb().getAll(...refs) : [];
  const stockById = new Map(stockSnaps.map((s) => [s.id, s.data() || {}]));

  const rows = matSnap.docs
    .map((d) => {
      const m = d.data() as any;
      const s = stockById.get(d.id) as any;
      const unidadTipo = String(m?.unidadTipo || "UND").toUpperCase() === "METROS" ? "METROS" : "UND";
      if (unidadTipo === "UND") {
        const stock = Number(s?.stockUnd || 0);
        const min = Number(m?.minStockUnd || 0);
        return {
          id: d.id,
          nombre: String(m?.nombre || m?.descripcion || d.id),
          unidadTipo,
          stockValue: stock,
          minValue: min,
          enMinimo: min > 0 && stock <= min,
        };
      }
      const stockCm = Number(s?.stockCm || 0);
      const minCm = Number(m?.minStockCm || 0);
      return {
        id: d.id,
        nombre: String(m?.nombre || m?.descripcion || d.id),
        unidadTipo,
        stockValue: toMetros(stockCm),
        minValue: toMetros(minCm),
        enMinimo: minCm > 0 && stockCm <= minCm,
      };
    })
    .sort((a, b) => {
      if (a.enMinimo !== b.enMinimo) return a.enMinimo ? -1 : 1;
      return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
    });

  const enMinimoCount = rows.filter((r) => r.enMinimo).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <Link
          href="/home/almacen"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <span aria-hidden>{"<-"}</span>
          Regresar
        </Link>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Stock de Materiales de Almacen</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Materiales por debajo del minimo: <b>{enMinimoCount}</b>
        </p>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 dark:bg-slate-800">
              <tr>
                <th className="p-3 text-left font-semibold">Material</th>
                <th className="p-3 text-left font-semibold">Unidad</th>
                <th className="p-3 text-left font-semibold">Stock actual</th>
                <th className="p-3 text-left font-semibold">Minimo</th>
                <th className="p-3 text-left font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-200 dark:border-slate-700">
                  <td className="p-3">{r.nombre}</td>
                  <td className="p-3">{r.unidadTipo === "METROS" ? "METROS" : "UND"}</td>
                  <td className={`p-3 font-semibold ${r.enMinimo ? "text-rose-700 dark:text-rose-300" : "text-slate-900 dark:text-slate-100"}`}>
                    {r.stockValue}
                  </td>
                  <td className="p-3">{r.minValue}</td>
                  <td className="p-3">
                    {r.enMinimo ? (
                      <span className="inline-flex rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                        En minimo
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                        OK
                      </span>
                    )}
                  </td>
                </tr>
              ))}

              {rows.length === 0 && (
                <tr>
                  <td className="p-8 text-center text-slate-500 dark:text-slate-400" colSpan={5}>
                    No hay materiales para mostrar.
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

