import { requireAdmin } from "@/core/auth/guards";
import { PermissionCreateForm } from "@/ui/admin/permissions/PermissionCreateForm";

export default async function PermissionNewPage() {
  await requireAdmin();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Nuevo permiso</h1>
      <PermissionCreateForm />
    </div>
  );
}
