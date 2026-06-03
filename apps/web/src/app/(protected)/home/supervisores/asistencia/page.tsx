import { redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/guards";
import { canViewSupervisoresAsistencia, canManageSupervisores } from "@/domain/supervisores/access";
import { SupervisorAsistenciaClient } from "./SupervisorAsistenciaClient";

export const dynamic = "force-dynamic";

export default async function SupervisorAsistenciaPage() {
  const session = await requireAuth();
  if (!canViewSupervisoresAsistencia(session)) redirect("/home");

  const canManageBase = canManageSupervisores(session);

  return (
    <div className="space-y-4 text-slate-900 dark:text-slate-100">
      <div>
        <h1 className="text-2xl font-semibold">Asistencia Supervisores</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Registro de jornadas registradas desde la app móvil — inicio de ruta, refrigerio y cierre.
        </p>
      </div>
      <SupervisorAsistenciaClient canManageBase={canManageBase} />
    </div>
  );
}
