import { redirect } from "next/navigation";

import { requireAuth } from "@/core/auth/guards";
import { GarantiasClient } from "./GarantiasClient";

export const dynamic = "force-dynamic";

function todayLimaYm() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

export default async function Page() {
  const session = await requireAuth();
  const canEdit = session.isAdmin || session.permissions.includes("ORDENES_GARANTIAS_EDIT");
  const canView = canEdit || session.permissions.includes("ORDENES_GARANTIAS_VIEW");
  if (!canView) redirect("/admin");

  return (
    <div className="space-y-4">
      <GarantiasClient initialYm={todayLimaYm()} initialCanEdit={canEdit} />
    </div>
  );
}

