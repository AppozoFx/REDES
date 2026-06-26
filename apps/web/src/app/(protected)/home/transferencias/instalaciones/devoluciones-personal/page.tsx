import { requirePermission } from "@/core/auth/guards";
import DevolucionesPersonalClient from "./ui/DevolucionesPersonalClient";
import AlmacenTabNav from "@/ui/common/AlmacenTabNav";

const PERSONAL_TABS = [
  { label: "Despacho a Personal", href: "/home/transferencias/instalaciones/despacho-personal" },
  { label: "Devoluciones de Personal", href: "/home/transferencias/instalaciones/devoluciones-personal" },
  { label: "Transferir entre Entidades", href: "/home/transferencias/instalaciones/transferencias-internas" },
];

export const dynamic = "force-dynamic";

export default async function Page() {
  await requirePermission("EQUIPOS_DEVOLUCION");
  await requirePermission("MATERIALES_DEVOLUCION");
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Devoluciones de Personal</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Devuelve equipos y materiales desde un coordinador o supervisor hacia almacén.</p>
      </section>
      <AlmacenTabNav tabs={PERSONAL_TABS} />
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4 dark:border-slate-700 dark:bg-slate-900">
        <DevolucionesPersonalClient />
      </section>
    </div>
  );
}
