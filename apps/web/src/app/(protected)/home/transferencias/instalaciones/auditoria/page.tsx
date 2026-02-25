import { requireArea } from "@/core/auth/guards";
import AuditoriaClient from "./ui/AuditoriaClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await requireArea("INSTALACIONES");
  const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
  const canEdit = session.isAdmin || (!roles.includes("COORDINADOR") && !roles.includes("TECNICO"));

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Auditoria de Equipos (Instalaciones)</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Gestion de sustentos, observaciones y seguimiento de avance por SN.</p>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4 dark:border-slate-700 dark:bg-slate-900">
        <AuditoriaClient canEdit={canEdit} />
      </section>
    </div>
  );
}

