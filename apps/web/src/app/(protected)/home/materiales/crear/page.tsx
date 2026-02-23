import { requirePermission } from "@/core/auth/guards";
import CreateMaterialClient from "./CreateClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requirePermission("MATERIALES_CREATE");
  return (
    <div className="space-y-6">
      <CreateMaterialClient />
    </div>
  );
}
