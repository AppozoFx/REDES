import { requireAuth } from "@/core/auth/guards";
import DashboardInstalacionesClient from "./DashboardInstalacionesClient";

export default async function DashboardInstalacionesPage() {
  await requireAuth();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Dashboard de Instalaciones</h1>
        <p className="text-sm text-muted-foreground">
          Analitica operativa de ordenes y liquidaciones por periodo.
        </p>
      </div>
      <DashboardInstalacionesClient />
    </div>
  );
}

