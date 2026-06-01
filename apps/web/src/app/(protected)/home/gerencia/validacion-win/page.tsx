import { redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/guards";
import ValidacionWinClient from "./ValidacionWinClient";

export const dynamic = "force-dynamic";

export default async function ValidacionWinPage() {
  const session = await requireAuth();
  const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
  const canUse = session.isAdmin || roles.includes("GERENCIA") || roles.includes("JEFATURA");
  if (!canUse) redirect("/home");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Validacion WIN
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Cruce y validacion del Excel mensual contra la base de datos de instalaciones
        </p>
      </div>
      <ValidacionWinClient />
    </div>
  );
}
