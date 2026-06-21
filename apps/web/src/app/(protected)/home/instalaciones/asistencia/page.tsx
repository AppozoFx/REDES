import { requireAuth } from "@/core/auth/guards";
import AsistenciaClient from "./ui/AsistenciaClient";

export default async function AsistenciaPage() {
  const session = await requireAuth();
  const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
  const modoAdmin =
    session.isAdmin ||
    roles.includes("GERENCIA") ||
    roles.includes("JEFATURA") ||
    roles.includes("ALMACEN") ||
    roles.includes("RRHH");

  return (
    <div className="p-4 space-y-3">
      <div>
        <h1 className="text-2xl font-bold">Asistencia de Cuadrillas</h1>
        <p className="text-sm text-muted-foreground">
          Registro diario por gestores y cierre por Gerencia, Almacen o RRHH.
        </p>
      </div>
      <AsistenciaClient initialModoAdmin={modoAdmin} />
    </div>
  );
}
