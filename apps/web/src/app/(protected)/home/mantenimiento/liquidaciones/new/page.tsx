import { requireArea } from "@/core/auth/guards";
import MantenimientoLiquidacionFormClient from "../MantenimientoLiquidacionFormClient";

export default async function NuevaMantenimientoLiquidacionPage() {
  await requireArea("MANTENIMIENTO");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Nueva liquidacion de mantenimiento</h1>
      <MantenimientoLiquidacionFormClient mode="create" />
    </div>
  );
}
