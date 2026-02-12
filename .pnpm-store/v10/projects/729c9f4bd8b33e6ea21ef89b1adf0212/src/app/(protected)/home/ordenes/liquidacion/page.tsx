import { requirePermission } from "@/core/auth/guards";
import { LiquidacionClient } from "./LiquidacionClient";

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
  await requirePermission("ORDENES_LIQUIDAR");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Ordenes - Liquidacion</h1>
      <LiquidacionClient initialYmd={todayLimaYmd()} />
    </div>
  );
}

