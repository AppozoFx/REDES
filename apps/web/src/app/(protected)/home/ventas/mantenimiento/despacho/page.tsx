import { requirePermission } from "@/core/auth/guards";
import DespachoVentasClient from "../../ui/DespachoVentasClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await requirePermission("VENTAS_DESPACHO_MANT");
  const canEditPrecio = session.isAdmin || session.permissions.includes("VENTAS_EDIT");
  const canEditCoordinador = session.isAdmin || session.permissions.includes("VENTAS_EDIT");
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Ventas - Despacho (Mantenimiento)</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Registro de ventas y despacho para cuadrillas del area de Mantenimiento.</p>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4 dark:border-slate-700 dark:bg-slate-900">
        <DespachoVentasClient area="MANTENIMIENTO" canEditPrecio={canEditPrecio} canEditCoordinador={canEditCoordinador} />
      </section>
    </div>
  );
}


