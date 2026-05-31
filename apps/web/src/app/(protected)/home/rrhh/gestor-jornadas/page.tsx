import { redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/guards";
import { GestorJornadasClient } from "./GestorJornadasClient";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["RRHH", "JEFATURA", "GERENCIA", "COORDINADOR"];

export default async function GestorJornadasPage() {
  const session = await requireAuth();
  const roles = (session.access.roles || []).map((r: string) => String(r).toUpperCase());
  const canUse = session.isAdmin || roles.some((r: string) => ALLOWED_ROLES.includes(r));
  if (!canUse) redirect("/home");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Jornadas de gestores</h1>
        <p className="mt-1 text-sm text-slate-500">
          Registro de ingresos, refrigerios y salidas del equipo de gestores.
        </p>
      </div>
      <GestorJornadasClient />
    </div>
  );
}
