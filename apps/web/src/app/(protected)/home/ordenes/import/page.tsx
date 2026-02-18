import { requirePermission } from "@/core/auth/guards";
import ImportClient from "./ImportClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requirePermission("ORDENES_IMPORT");
  return <ImportClient />;
}

