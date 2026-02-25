import { requirePermission } from "@/core/auth/guards";
import EquiposClient from "./ui/EquiposClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await requirePermission("EQUIPOS_VIEW");
  const canEdit = session.isAdmin || session.permissions.includes("EQUIPOS_EDIT");

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Equipos - Instalaciones</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Administra inventario, filtros y exportaciones de equipos de instalaciones.</p>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4 dark:border-slate-700 dark:bg-slate-900">
        <EquiposClient canEdit={canEdit} />
      </section>
    </div>
  );
}

