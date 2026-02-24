import { requireArea } from "@/core/auth/guards";
import StockEquiposClient from "./ui/StockEquiposClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireArea("INSTALACIONES");

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Stock de Equipos - Instalaciones</h1>
        <p className="mt-1 text-sm text-slate-500">Vista consolidada del inventario de equipos en instalaciones.</p>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4">
        <StockEquiposClient />
      </section>
    </div>
  );
}
