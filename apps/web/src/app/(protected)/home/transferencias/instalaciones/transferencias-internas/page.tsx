import { requirePermission } from "@/core/auth/guards";
import TransferenciasInternasClient from "./ui/TransferenciasInternasClient";
import AlmacenTabNav from "@/ui/common/AlmacenTabNav";

const PERSONAL_TABS = [
  { label: "Despacho a Personal", href: "/home/transferencias/instalaciones/despacho-personal" },
  { label: "Devoluciones de Personal", href: "/home/transferencias/instalaciones/devoluciones-personal" },
  { label: "Transferir entre Entidades", href: "/home/transferencias/instalaciones/transferencias-internas" },
];

export const dynamic = "force-dynamic";

export default async function Page() {
  await requirePermission("MATERIALES_TRANSFER_SERVICIO");
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Transferir entre Entidades</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Transfiere equipos y materiales entre coordinadores, supervisores y cuadrillas.</p>
      </section>
      <AlmacenTabNav tabs={PERSONAL_TABS} />
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4 dark:border-slate-700 dark:bg-slate-900">
        <TransferenciasInternasClient />
      </section>
    </div>
  );
}
