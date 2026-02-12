import { requirePermission } from "@/core/auth/guards";
import ImportClient from "./ImportClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requirePermission("EQUIPOS_IMPORT");

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Equipos - Importar desde Excel</h1>
      <ImportClient />
    </div>
  );
}

