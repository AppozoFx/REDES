import CuadrillasGestionClient from "./ui/CuadrillasGestionClient";

export default function CuadrillasGestionPage() {
  return (
    <div className="p-4 space-y-3">
      <div>
        <h1 className="text-2xl font-bold">Cuadrillas Gestion</h1>
        <p className="text-sm text-muted-foreground">
          Edita zona, tipo de zona, placa, gestor, coordinador y tecnicos.
        </p>
      </div>
      <CuadrillasGestionClient />
    </div>
  );
}
