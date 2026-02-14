import MaterialesLiquidacionClient from "./ui/MaterialesLiquidacionClient";

export default function MaterialesLiquidacionPage() {
  return (
    <div className="p-4 space-y-3">
      <div>
        <h1 className="text-2xl font-bold">Liquidacion de Materiales</h1>
        <p className="text-sm text-muted-foreground">
          Liquida materiales por instalacion. ACTA y PRECON/BOBINA son obligatorios.
        </p>
      </div>
      <MaterialesLiquidacionClient />
    </div>
  );
}
