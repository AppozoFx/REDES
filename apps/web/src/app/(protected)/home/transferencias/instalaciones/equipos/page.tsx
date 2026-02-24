import { requirePermission } from "@/core/auth/guards";
import EquiposClient from "./ui/EquiposClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await requirePermission("EQUIPOS_VIEW");
  const canEdit = session.isAdmin || session.permissions.includes("EQUIPOS_EDIT");

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Equipos - Instalaciones</h1>
        <p className="mt-1 text-sm text-slate-500">Administra inventario, filtros y exportaciones de equipos de instalaciones.</p>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4">
        <EquiposClient canEdit={canEdit} />
      </section>
    </div>
  );
}
