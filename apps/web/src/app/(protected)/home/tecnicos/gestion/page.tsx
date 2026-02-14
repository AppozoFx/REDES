import TecnicosGestionClient from "./ui/TecnicosGestionClient";

export default function TecnicosGestionPage() {
  return (
    <div className="p-4 space-y-3">
      <div>
        <h1 className="text-2xl font-bold">Técnicos Gestión</h1>
        <p className="text-sm text-muted-foreground">
          Gestiona el celular y estado de técnicos asignados.
        </p>
      </div>
      <TecnicosGestionClient />
    </div>
  );
}
