import { redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/guards";
import { PlantillasClient } from "./PlantillasClient";

export const dynamic = "force-dynamic";

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function currentLimaMonth() {
  return todayLimaYmd().slice(0, 7);
}

export default async function Page() {
  const session = await requireAuth();
  const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
  const isCoordinator = roles.includes("COORDINADOR") && !roles.includes("GESTOR");
  const canView = session.isAdmin || isCoordinator || session.permissions.includes("ORDENES_LIQUIDAR");
  if (!canView) redirect("/admin");
  return <PlantillasClient initialYmd={todayLimaYmd()} initialMonth={currentLimaMonth()} />;
}
