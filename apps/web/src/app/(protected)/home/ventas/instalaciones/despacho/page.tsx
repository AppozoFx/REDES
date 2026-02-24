import { requirePermission } from "@/core/auth/guards";
import DespachoVentasClient from "../../ui/DespachoVentasClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await requirePermission("VENTAS_DESPACHO_INST");
  const canEditPrecio = session.isAdmin || session.permissions.includes("VENTAS_EDIT");
  const canEditCoordinador = session.isAdmin || session.permissions.includes("VENTAS_EDIT");
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Ventas - Despacho (INSTALACIONES)</h1>
        <p className="mt-1 text-sm text-slate-500">Registro de ventas y despacho para cuadrillas del area de instalaciones.</p>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4">
        <DespachoVentasClient area="INSTALACIONES" canEditPrecio={canEditPrecio} canEditCoordinador={canEditCoordinador} />
      </section>
    </div>
  );
}
