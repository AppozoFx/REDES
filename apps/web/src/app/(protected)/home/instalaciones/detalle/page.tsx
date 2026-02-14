import LiquidacionDetalleClient from "./ui/LiquidacionDetalleClient";

export default function LiquidacionDetallePage() {
  return (
    <div className="p-4 space-y-3">
      <div>
        <h1 className="text-2xl font-bold">Liquidacion Detalle</h1>
        <p className="text-sm text-muted-foreground">
          Cambia tipo de orden, coordinador y observacion de instalaciones.
        </p>
      </div>
      <LiquidacionDetalleClient />
    </div>
  );
}
