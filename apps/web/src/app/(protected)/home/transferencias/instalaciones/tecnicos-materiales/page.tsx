import { redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/guards";
import TecnicosMaterialesClient from "./ui/TecnicosMaterialesClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await requireAuth();
  const canUse =
    session.isAdmin ||
    session.permissions.includes("MATERIALES_TRANSFER_SERVICIO") ||
    session.permissions.includes("MATERIALES_DEVOLUCION");
  if (!canUse) redirect("/home");

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Materiales - Tecnicos (INSTALACIONES)</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Consulta y seguimiento de asignaciones de materiales por tecnico.</p>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4 dark:border-slate-700 dark:bg-slate-900">
        <TecnicosMaterialesClient />
      </section>
    </div>
  );
}

