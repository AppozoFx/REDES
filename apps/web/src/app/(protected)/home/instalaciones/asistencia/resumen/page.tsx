import AsistenciaResumenClient from "./ui/AsistenciaResumenClient";

export default function AsistenciaResumenPage() {
  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Asistencia - Resumen Gerencia</h1>
        <p className="text-sm text-muted-foreground">
          Vista general por fecha para cuadrillas y tecnicos. Solo lectura.
        </p>
      </div>
      <AsistenciaResumenClient />
    </div>
  );
}
