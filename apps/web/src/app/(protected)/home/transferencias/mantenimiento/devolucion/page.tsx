import { requireArea, requirePermission } from "@/core/auth/guards";
import DevolucionMantClient from "./ui/DevolucionMantClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireArea("MANTENIMIENTO");
  await requirePermission("MATERIALES_DEVOLUCION");
  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-gradient-to-br from-[#f3f6fb] via-white to-[#eef7f4] shadow-sm dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
        <div className="px-5 py-6 md:px-7">
          <div className="inline-flex items-center rounded-full border border-slate-300 bg-white/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.22em] text-slate-600 dark:border-slate-600 dark:bg-slate-900/80 dark:text-slate-300">
            Mantenimiento
          </div>
          <div className="mt-2">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Devolucion de materiales
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
              Registra materiales que una cuadrilla devuelve al almacen central. El stock de la cuadrilla se descuenta y el almacen se incrementa.
            </p>
          </div>
        </div>
      </section>
      <DevolucionMantClient />
    </div>
  );
}
