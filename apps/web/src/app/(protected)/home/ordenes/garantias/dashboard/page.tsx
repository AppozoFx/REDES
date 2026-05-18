import { redirect } from "next/navigation";

import { requireAuth } from "@/core/auth/guards";
import GarantiasDashboardClient from "./GarantiasDashboardClient";

export const dynamic = "force-dynamic";

export default async function GarantiasDashboardPage() {
  const session = await requireAuth();
  const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
  const canEdit =
    session.isAdmin ||
    roles.includes("GERENCIA") ||
    roles.includes("SUPERVISOR") ||
    session.permissions.includes("ORDENES_GARANTIAS_EDIT");
  const canView = canEdit || session.permissions.includes("ORDENES_GARANTIAS_VIEW");
  if (!canView) redirect("/admin");

  return <GarantiasDashboardClient />;
}
