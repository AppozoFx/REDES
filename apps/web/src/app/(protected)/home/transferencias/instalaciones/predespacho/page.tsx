import { requireArea } from "@/core/auth/guards";
import PredespachoClient from "./ui/PredespachoClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireArea("INSTALACIONES");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Predespacho de Cuadrillas (Instalaciones)</h1>
      <PredespachoClient />
    </div>
  );
}

