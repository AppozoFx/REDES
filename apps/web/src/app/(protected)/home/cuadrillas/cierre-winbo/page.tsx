import { requirePermission } from "@/core/auth/guards";
import CierreWinboClient from "./CierreWinboClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requirePermission("CUADRILLAS_CIERRE_WINBO");
  return <CierreWinboClient />;
}
