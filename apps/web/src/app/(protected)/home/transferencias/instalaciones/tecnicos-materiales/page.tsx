import { redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/guards";
import TecnicosMaterialesClient from "./ui/TecnicosMaterialesClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await requireAuth();
  const canUse =
    session.isAdmin ||
    session.permissions.includes("MATERIALES_TRANSFER_SERVICIO") ||
    session.permissions.includes("MATERIALES_DEVOLUCION");
  if (!canUse) redirect("/home");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Materiales - Tecnicos (INSTALACIONES)</h1>
      <TecnicosMaterialesClient />
    </div>
  );
}

