import { requireAdmin } from "@/core/auth/guards";
import { PermissionCreateForm } from "@/ui/admin/permissions/PermissionCreateForm";

export default async function PermissionNewPage() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-3xl space-y-4 text-slate-900 dark:text-slate-100">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-2xl font-semibold">Nuevo permiso</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Crea un permiso y asocialo al modulo correspondiente.</p>
      </section>
      <PermissionCreateForm />
    </div>
  );
}
