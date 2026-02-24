import { requirePermission } from "@/core/auth/guards";
import DevolucionesClient from "./ui/DevolucionesClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requirePermission("EQUIPOS_DEVOLUCION");
  await requirePermission("MATERIALES_DEVOLUCION");
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Transferencias - Devoluciones (INSTALACIONES)</h1>
        <p className="mt-1 text-sm text-slate-500">Controla devoluciones de equipos y materiales para instalaciones.</p>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4">
        <DevolucionesClient />
      </section>
    </div>
  );
}
