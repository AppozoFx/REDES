import Link from "next/link";
import { requireAdmin } from "@/core/auth/guards";
import { listPermissions } from "@/domain/permissions/permissions.repo";
import { PermissionsList } from "@/ui/admin/permissions/PermissionsList";

export default async function PermissionsPage() {
  await requireAdmin();
  const items = await listPermissions();

  return (
    <div className="space-y-4 text-slate-900 dark:text-slate-100">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Permisos</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Administra permisos del sistema por modulo y estado.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800/60">
              Total: <b>{items.length}</b>
            </div>
            <Link className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700" href="/admin/permissions/new">
              Nuevo permiso
            </Link>
          </div>
        </div>
      </section>

      <PermissionsList items={items} />
    </div>
  );
}
