import { requireArea } from "@/core/auth/guards";
import StockEquiposClient from "./ui/StockEquiposClient";
import AlmacenTabNav from "@/ui/common/AlmacenTabNav";

const INVENTARIO_TABS = [
  { label: "Stock de Equipos", href: "/home/transferencias/instalaciones/stock-equipos" },
  { label: "Stock Personal", href: "/home/transferencias/instalaciones/stock-personal" },
  { label: "Equipos", href: "/home/transferencias/instalaciones/equipos" },
];

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireArea("INSTALACIONES");

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Stock de Equipos</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Vista consolidada del inventario de equipos en almacén y cuadrillas.</p>
      </section>
      <AlmacenTabNav tabs={INVENTARIO_TABS} />
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4 dark:border-slate-700 dark:bg-slate-900">
        <StockEquiposClient />
      </section>
    </div>
  );
}

