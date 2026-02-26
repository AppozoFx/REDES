import { redirect } from "next/navigation";
import { requireArea } from "@/core/auth/guards";
import StockCuadrillasMantClient from "./ui/StockCuadrillasMantClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await requireArea("MANTENIMIENTO");
  const canUse =
    session.isAdmin ||
    session.permissions.includes("MATERIALES_VIEW") ||
    session.permissions.includes("MATERIALES_TRANSFER_SERVICIO") ||
    session.permissions.includes("MATERIALES_DEVOLUCION");
  if (!canUse) redirect("/home");

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Stock de Materiales - Cuadrillas (Mantenimiento)</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Vista de solo lectura del stock de materiales por cuadrilla de mantenimiento.
        </p>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4 dark:border-slate-700 dark:bg-slate-900">
        <StockCuadrillasMantClient />
      </section>
    </div>
  );
}