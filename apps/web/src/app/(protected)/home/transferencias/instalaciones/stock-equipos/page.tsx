import { requireArea } from "@/core/auth/guards";
import StockEquiposClient from "./ui/StockEquiposClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireArea("INSTALACIONES");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Stock de Equipos - Instalaciones</h1>
      <StockEquiposClient />
    </div>
  );
}
