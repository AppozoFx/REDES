import { redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/guards";
import {
  PERM_SUPERVISORES_MANAGE,
  PERM_SUPERVISORES_VIEW,
} from "@/domain/supervisores/access";
import AsignacionSupervisoresClient from "./AsignacionSupervisoresClient";

export default async function Page() {
  const session = await requireAuth();
  const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
  const canUse =
    session.isAdmin ||
    roles.includes("GERENCIA") ||
    roles.includes("JEFATURA") ||
    roles.includes("SUPERVISOR") ||
    session.permissions.includes(PERM_SUPERVISORES_VIEW) ||
    session.permissions.includes(PERM_SUPERVISORES_MANAGE);
  if (!canUse) redirect("/home");

  return <AsignacionSupervisoresClient />;
}
