import Link from "next/link";
import { requireAdmin } from "@/core/auth/guards";
import { listPermissions } from "@/domain/permissions/permissions.repo";
import { PermissionsList } from "@/ui/admin/permissions/PermissionsList";

export default async function PermissionsPage() {
  await requireAdmin();
  const items = await listPermissions();

  const activos = items.filter((p) => p.estado === "ACTIVO").length;
  const inactivos = items.length - activos;

  return (
    <div className="space-y-5 text-slate-900 dark:text-slate-100">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500 shadow-[0_8px_20px_rgba(245,158,11,.28)]">
            <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Permisos del sistema</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Administra permisos por módulo y estado.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            {items.length} permisos
          </span>
          <Link
            href="/admin/permissions/new"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#30518c] px-4 py-2 text-sm font-medium text-white shadow-[0_4px_12px_rgba(48,81,140,.3)] transition hover:bg-[#2b4880] active:scale-[.98]"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nuevo permiso
          </Link>
        </div>
      </div>

      {/* ── KPI mini ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Total</p>
          <p className="mt-1 text-2xl font-bold">{items.length}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-3 shadow-sm dark:border-emerald-800 dark:from-emerald-900/20 dark:to-slate-900">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Activos</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-300">{activos}</p>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white p-3 shadow-sm dark:border-rose-800 dark:from-rose-900/20 dark:to-slate-900">
          <p className="text-xs font-medium uppercase tracking-wide text-rose-600 dark:text-rose-400">Inactivos</p>
          <p className="mt-1 text-2xl font-bold text-rose-700 dark:text-rose-300">{inactivos}</p>
        </div>
      </div>

      <PermissionsList items={items} />
    </div>
  );
}
