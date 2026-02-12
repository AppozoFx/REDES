import { requirePermission } from "@/core/auth/guards";
import DespachoVentasClient from "../../ui/DespachoVentasClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await requirePermission("VENTAS_DESPACHO_INST");
  const canEditPrecio = session.isAdmin || session.permissions.includes("VENTAS_EDIT");
  const canEditCoordinador = session.isAdmin || session.permissions.includes("VENTAS_EDIT");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Ventas - Despacho (INSTALACIONES)</h1>
      <DespachoVentasClient area="INSTALACIONES" canEditPrecio={canEditPrecio} canEditCoordinador={canEditCoordinador} />
    </div>
  );
}
