import Link from "next/link";
import { requirePermission } from "@/core/auth/guards";
import ValidarSeriesClient from "./ValidarSeriesClient";

export const dynamic = "force-dynamic";

export default async function ValidarSeriesPage() {
  await requirePermission("EQUIPOS_IMPORT");

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Validacion de series y ONT ProID</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Valida SN fisica contra EQUIPOS, vincula ONT+ProID por pistoleo y procesa lotes masivos desde Excel (SN=ProID).
            </p>
          </div>
          <Link
            href="/home/equipos/import"
            className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Volver a Importar
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4 dark:border-slate-700 dark:bg-slate-900">
        <ValidarSeriesClient />
      </section>
    </div>
  );
}
