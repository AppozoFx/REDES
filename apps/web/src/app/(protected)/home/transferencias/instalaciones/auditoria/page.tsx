import { requireArea } from "@/core/auth/guards";
import AuditoriaClient from "./ui/AuditoriaClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await requireArea("INSTALACIONES");
  const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
  const canEdit = session.isAdmin || (!roles.includes("COORDINADOR") && !roles.includes("TECNICO"));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Auditoria de Equipos (Instalaciones)</h1>
      <AuditoriaClient canEdit={canEdit} />
    </div>
  );
}

