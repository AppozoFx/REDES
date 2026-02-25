import Link from "next/link";
import { requireAdmin } from "@/core/auth/guards";
import { listPermissions } from "@/domain/permissions/permissions.repo";
import { PermissionsList } from "@/ui/admin/permissions/PermissionsList";

export default async function PermissionsPage() {
  await requireAdmin();
  const items = await listPermissions();

  return (
    <div className="space-y-4 text-slate-900 dark:text-slate-100">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Permisos</h1>

        <Link className="underline decoration-slate-400 underline-offset-2 dark:decoration-slate-500" href="/admin/permissions/new">
          Nuevo permiso
        </Link>
      </div>

      <PermissionsList items={items} />
    </div>
  );
}
