import Link from "next/link";
import { requireAdmin } from "@/core/auth/guards";
import { PermissionCreateForm } from "@/ui/admin/permissions/PermissionCreateForm";

export default async function PermissionNewPage() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-2xl space-y-5 text-slate-900 dark:text-slate-100">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/permissions"
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500 shadow-[0_8px_20px_rgba(245,158,11,.28)]">
            <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Nuevo permiso</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Crea un permiso y asócialo al módulo correspondiente.</p>
          </div>
        </div>
      </div>

      <PermissionCreateForm />
    </div>
  );
}
