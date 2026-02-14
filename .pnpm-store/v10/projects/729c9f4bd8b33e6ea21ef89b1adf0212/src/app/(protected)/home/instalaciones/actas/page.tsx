import RecepcionActasClient from "./ui/RecepcionActasClient";

export default function RecepcionActasPage() {
  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Recepción de Actas</h1>
        <p className="text-sm text-muted-foreground">
          Registra actas recepcionadas por coordinador y opcionalmente por cuadrilla.
        </p>
      </div>
      <RecepcionActasClient />
    </div>
  );
}
