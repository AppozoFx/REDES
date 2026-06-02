import { requireArea } from "@/core/auth/guards";
import AuditoriaClient from "./ui/AuditoriaClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await requireArea("INSTALACIONES");
  const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
  const canEdit = session.isAdmin || (!roles.includes("COORDINADOR") && !roles.includes("TECNICO"));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#30518c] shadow-[0_8px_20px_rgba(48,81,140,.3)]">
          <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
            <rect x="9" y="3" width="6" height="4" rx="1" />
            <path d="M9 12h6M9 16h4" />
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Auditoría de Equipos — Instalaciones
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Gestión de sustentos, observaciones y seguimiento de avance por SN.
          </p>
        </div>
      </div>
      <AuditoriaClient canEdit={canEdit} />
    </div>
  );
}
