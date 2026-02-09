import { requirePermission } from "@/core/auth/guards";
import EquiposClient from "./ui/EquiposClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await requirePermission("EQUIPOS_VIEW");
  const canEdit = session.isAdmin || session.permissions.includes("EQUIPOS_EDIT");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Equipos - Instalaciones</h1>
      <EquiposClient canEdit={canEdit} />
    </div>
  );
}
