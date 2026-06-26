import { requirePermission } from "@/core/auth/guards";
import EquiposClient from "./ui/EquiposClient";
import AlmacenTabNav from "@/ui/common/AlmacenTabNav";

const INVENTARIO_TABS = [
  { label: "Stock de Equipos", href: "/home/transferencias/instalaciones/stock-equipos" },
  { label: "Stock Personal", href: "/home/transferencias/instalaciones/stock-personal" },
  { label: "Equipos", href: "/home/transferencias/instalaciones/equipos" },
];

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await requirePermission("EQUIPOS_VIEW");
  const canEdit = session.isAdmin || session.permissions.includes("EQUIPOS_EDIT");

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Equipos</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Inventario detallado con filtros y exportaciones de equipos de instalaciones.</p>
      </section>
      <AlmacenTabNav tabs={INVENTARIO_TABS} />
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4 dark:border-slate-700 dark:bg-slate-900">
        <EquiposClient canEdit={canEdit} />
      </section>
    </div>
  );
}

