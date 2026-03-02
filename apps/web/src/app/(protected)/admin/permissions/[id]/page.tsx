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

  return (
    <div className="mx-auto max-w-3xl space-y-4 text-slate-900 dark:text-slate-100">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-2xl font-semibold">Permiso: <span className="font-mono text-base">{id}</span></h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Edita datos del permiso y su estado de disponibilidad.</p>
      </section>
      <PermissionEditForm permission={toPlain(permission)} />
    </div>
  );
}
