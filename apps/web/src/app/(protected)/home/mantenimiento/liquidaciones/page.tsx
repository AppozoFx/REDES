import { requireArea } from "@/core/auth/guards";
import MantenimientoLiquidacionesListClient from "./MantenimientoLiquidacionesListClient";

export default async function MantenimientoLiquidacionesPage() {
  await requireArea("MANTENIMIENTO");
  return <MantenimientoLiquidacionesListClient />;
}
