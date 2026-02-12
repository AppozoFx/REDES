import { redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/guards";
import { LlamadasClient } from "./LlamadasClient";

export const dynamic = "force-dynamic";

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function Page() {
  const session = await requireAuth();
  const canEdit =
    session.isAdmin ||
    session.access.roles.includes("GESTOR") ||
    session.permissions.includes("ORDENES_LLAMADAS_EDIT");
  const canView =
    canEdit ||
    session.permissions.includes("ORDENES_LLAMADAS_VIEW");
  if (!canView) redirect("/admin");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Ordenes - Gestion de llamadas</h1>
      <LlamadasClient initialYmd={todayLimaYmd()} initialCanEdit={canEdit} />
    </div>
  );
}
