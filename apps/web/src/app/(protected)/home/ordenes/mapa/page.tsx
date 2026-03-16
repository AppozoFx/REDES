import { redirect } from "next/navigation";

import { requireAuth } from "@/core/auth/guards";
import { MapaOrdenesClient } from "./MapaOrdenesClient";

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
  const roles = (session.access.roles ?? []).map((r) => String(r || "").toUpperCase());
  const canView =
    session.isAdmin ||
    session.permissions.includes("ORDENES_MAPA_VIEW") ||
    roles.includes("COORDINADOR") ||
    roles.includes("SUPERVISOR") ||
    roles.includes("SEGURIDAD");
  if (!canView) redirect("/admin");

  return (
    <div className="space-y-4">
      <MapaOrdenesClient initialYmd={todayLimaYmd()} />
    </div>
  );
}
