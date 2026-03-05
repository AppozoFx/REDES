import Link from "next/link";
import { requireAuth } from "@/core/auth/guards";
import ActasRenombrarClient from "./ui/ActasRenombrarClient";

export default async function ActasRenombrarPage() {
  await requireAuth();

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Renombrado de actas escaneadas</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Sube PDFs por fecha para clasificar en OK/ERROR segun codigo de acta y datos de cliente.
            </p>
          </div>
          <Link
            href="/home/instalaciones/actas-dia"
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Volver a Actas por dia
          </Link>
        </div>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4 dark:border-slate-700 dark:bg-slate-900">
        <ActasRenombrarClient />
      </section>
    </div>
  );
}
