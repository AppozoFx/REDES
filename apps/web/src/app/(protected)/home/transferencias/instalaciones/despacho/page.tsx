import { requirePermission } from "@/core/auth/guards";
import DespachoClient from "./ui/DespachoClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  // Requiere permisos de despacho para equipos y transferencia de materiales en servicio
  await requirePermission("EQUIPOS_DESPACHO");
  await requirePermission("MATERIALES_TRANSFER_SERVICIO");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Transferencias - Despacho (INSTALACIONES)</h1>
      <DespachoClient />
    </div>
  );
}

