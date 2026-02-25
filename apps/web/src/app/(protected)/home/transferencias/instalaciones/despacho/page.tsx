import { requirePermission } from "@/core/auth/guards";
import DespachoClient from "./ui/DespachoClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  // Requiere permisos de despacho para equipos y transferencia de materiales en servicio
  await requirePermission("EQUIPOS_DESPACHO");
  await requirePermission("MATERIALES_TRANSFER_SERVICIO");
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Transferencias - Despacho (INSTALACIONES)</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Gestion operativa de despacho para cuadrillas de instalaciones.</p>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4 dark:border-slate-700 dark:bg-slate-900">
        <DespachoClient />
      </section>
    </div>
  );
}

