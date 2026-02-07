import { requirePermission } from "@/core/auth/guards";
import DevolucionesClient from "./ui/DevolucionesClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requirePermission("EQUIPOS_DEVOLUCION");
  await requirePermission("MATERIALES_DEVOLUCION");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Transferencias - Devoluciones (INSTALACIONES)</h1>
      <DevolucionesClient />
    </div>
  );
}

