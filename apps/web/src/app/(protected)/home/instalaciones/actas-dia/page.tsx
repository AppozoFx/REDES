import { requireAuth } from "@/core/auth/guards";
import ActasPorDiaClient from "./ui/ActasPorDiaClient";
import ActasConsultaClient from "../actas/ui/ActasConsultaClient";

export default async function ActasPorDiaPage() {
  await requireAuth();
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Instalaciones: Actas por dia</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Escanea actas por fecha y valida si cada acta esta asociada a un cliente en instalaciones.
        </p>
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
