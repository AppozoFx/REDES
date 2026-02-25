import { redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/guards";
import CoordinadoresClient from "./CoordinadoresClient";

export const dynamic = "force-dynamic";

const PERM_GERENCIA_COORDINADORES = "GERENCIA_COORDINADORES";

export default async function GerenciaCoordinadoresPage() {
  const session = await requireAuth();
  const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
  const canUse =
    session.isAdmin ||
    (roles.includes("GERENCIA") && session.permissions.includes(PERM_GERENCIA_COORDINADORES));

  if (!canUse) redirect("/home");

  return <CoordinadoresClient />;
}
