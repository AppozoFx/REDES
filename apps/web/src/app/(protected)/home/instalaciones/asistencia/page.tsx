import AsistenciaClient from "./ui/AsistenciaClient";

export default function AsistenciaPage() {
  return (
    <div className="p-4 space-y-3">
      <div>
        <h1 className="text-2xl font-bold">Asistencia de Cuadrillas</h1>
        <p className="text-sm text-muted-foreground">
          Registro diario por gestores y cierre por Gerencia, Almacen o RRHH.
        </p>
      </div>
      <AsistenciaClient />
    </div>
  );
}
