import { redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/guards";
import { canManageSupervisores } from "@/domain/supervisores/access";
import { listSupervisoresForGestion } from "@/domain/supervisores/repo";
import SupervisoresClient from "./SupervisoresClient";

export const dynamic = "force-dynamic";

export default async function SupervisoresPage() {
  const session = await requireAuth();
  if (!canManageSupervisores(session)) redirect("/home");

  const rows = await listSupervisoresForGestion("INSTALACIONES");

  return (
    <div className="space-y-4 text-slate-900 dark:text-slate-100">
      <div>
        <h1 className="text-2xl font-semibold">Supervisores</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Gestión de supervisores de instalaciones — vehículo, documentos y zonas asignadas.
        </p>
      </div>

      <SupervisoresClient initialRows={rows} />
    </div>
  );
}
