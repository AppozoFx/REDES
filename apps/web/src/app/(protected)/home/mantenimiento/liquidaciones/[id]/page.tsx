import { requireArea } from "@/core/auth/guards";
import MantenimientoLiquidacionFormClient from "../MantenimientoLiquidacionFormClient";

export default async function MantenimientoLiquidacionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireArea("MANTENIMIENTO");
  const { id } = await params;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Detalle de liquidacion</h1>
      <MantenimientoLiquidacionFormClient mode="edit" id={id} />
    </div>
  );
}
