import { requireAuth } from "@/core/auth/guards";
import ActasPorDiaClient from "./ui/ActasPorDiaClient";
import ActasConsultaClient from "../actas/ui/ActasConsultaClient";
import Link from "next/link";

export default async function ActasPorDiaPage() {
  await requireAuth();
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Instalaciones: Actas por dia</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Escanea actas por fecha y valida si cada acta esta asociada a un cliente en instalaciones.
            </p>
          </div>
          <Link
            href="/home/instalaciones/actas-dia/renombrar"
            className="inline-flex items-center justify-center rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-100 dark:border-blue-800/70 dark:bg-blue-900/20 dark:text-blue-200 dark:hover:bg-blue-900/35"
          >
            Renombrar actas escaneadas
          </Link>
        </div>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4 dark:border-slate-700 dark:bg-slate-900">
        <ActasPorDiaClient />
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Consulta y Liberacion de Actas</h2>
        <ActasConsultaClient />
      </section>
    </div>
  );
}
