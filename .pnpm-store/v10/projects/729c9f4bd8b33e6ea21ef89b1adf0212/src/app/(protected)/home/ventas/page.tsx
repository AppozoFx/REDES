import { requireAuth } from "@/core/auth/guards";
import { redirect } from "next/navigation";
import VentasClient from "./ui/VentasClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await requireAuth();
  const canView = session.isAdmin || session.permissions.includes("VENTAS_VER") || session.permissions.includes("VENTAS_VER_ALL");
  if (!canView) {
    redirect("/admin");
  }
  const canEdit = session.isAdmin || session.permissions.includes("VENTAS_EDIT");
  const canPagar = session.isAdmin || session.permissions.includes("VENTAS_PAGOS");
  const canAnular = session.isAdmin || session.permissions.includes("VENTAS_ANULAR");
  const canViewAll = session.isAdmin || session.permissions.includes("VENTAS_VER_ALL");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Ventas</h1>
      <VentasClient canEdit={canEdit} canPagar={canPagar} canAnular={canAnular} canViewAll={canViewAll} />
    </div>
  );
}
