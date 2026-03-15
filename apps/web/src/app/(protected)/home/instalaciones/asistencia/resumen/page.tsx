import AsistenciaResumenClient from "./ui/AsistenciaResumenClient";

export default function AsistenciaResumenPage() {
  return (
    <div className="space-y-5 p-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Resumen de Asistencia</h1>
        <p className="text-sm text-slate-600">
          Vista consolidada para gerencia y administracion con filtros, exportacion y ajustes controlados.
        </p>
      </div>
      <AsistenciaResumenClient />
    </div>
  );
}
