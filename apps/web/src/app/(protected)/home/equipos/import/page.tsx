import { requirePermission } from "@/core/auth/guards";
import ImportClient from "./ImportClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requirePermission("EQUIPOS_IMPORT");

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Equipos - Importar desde Excel</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Analiza duplicados y registra nuevos equipos de forma controlada.
        </p>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4 dark:border-slate-700 dark:bg-slate-900">
        <ImportClient />
      </section>
    </div>
  );
}
