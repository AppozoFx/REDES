import { redirect } from "next/navigation";

import { requireAuth } from "@/core/auth/guards";
import GarantiasCruceCargaClient from "./GarantiasCruceCargaClient";

export const dynamic = "force-dynamic";

export default async function GarantiasCruceCargaPage() {
  const session = await requireAuth();
  const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
  const canEdit =
    session.isAdmin ||
    roles.includes("GERENCIA") ||
    roles.includes("SUPERVISOR") ||
    session.permissions.includes("ORDENES_GARANTIAS_EDIT");
  if (!canEdit) redirect("/admin");

  return <GarantiasCruceCargaClient />;
}
