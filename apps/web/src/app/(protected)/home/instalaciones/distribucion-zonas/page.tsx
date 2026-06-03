import { redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/guards";
import {
  PERM_SUPERVISORES_MANAGE,
  PERM_SUPERVISORES_VIEW,
} from "@/domain/supervisores/access";
import DistribucionZonasClient from "./DistribucionZonasClient";

export const dynamic = "force-dynamic";

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function DistribucionZonasPage() {
  const session = await requireAuth();
  const roles = (session.access.roles || []).map((role) => String(role || "").toUpperCase());
  const canUse =
    session.isAdmin ||
    roles.includes("GERENCIA") ||
    roles.includes("JEFATURA") ||
    roles.includes("SUPERVISOR") ||
    session.permissions.includes(PERM_SUPERVISORES_VIEW) ||
    session.permissions.includes(PERM_SUPERVISORES_MANAGE);
  if (!canUse) redirect("/home");

  return <DistribucionZonasClient initialYmd={todayLimaYmd()} />;
}
