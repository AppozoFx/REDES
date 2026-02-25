import { redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/guards";
import OrdenCompraClient from "./OrdenCompraClient";

export const dynamic = "force-dynamic";

const PERM_GERENCIA_ORDEN_COMPRA = "GERENCIA_ORDEN_COMPRA";

export default async function GerenciaOrdenCompraPage() {
  const session = await requireAuth();
  const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
  const canUse =
    session.isAdmin ||
    (roles.includes("GERENCIA") && session.permissions.includes(PERM_GERENCIA_ORDEN_COMPRA));

  if (!canUse) redirect("/home");

  return <OrdenCompraClient />;
}
