import Link from "next/link";
import { requireAdmin } from "@/core/auth/guards";
import { getPermissionById } from "@/domain/permissions/permissions.repo";
import { notFound } from "next/navigation";
import { PermissionEditForm } from "@/ui/admin/permissions/PermissionEditForm";
import { toPlain } from "@/lib/toPlain";

export default async function PermissionDetailPage(props: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await props.params;

  const permission = await getPermissionById(id);
  if (!permission) notFound();

  const isActive = (permission as any).estado === "ACTIVO";

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
        <div className="flex flex-1 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500 shadow-[0_8px_20px_rgba(245,158,11,.28)]">
            <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight">Permiso:</h1>
              <span className="rounded-lg bg-slate-100 px-2 py-0.5 font-mono text-sm font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {id}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  isActive
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-300"
                    : "border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/60 dark:bg-rose-900/30 dark:text-rose-300"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-rose-500"}`} />
                {isActive ? "Activo" : "Inactivo"}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Edita datos del permiso y su estado de disponibilidad.</p>
          </div>
        </div>
      </div>

      <PermissionEditForm permission={toPlain(permission)} />
    </div>
  );
}
