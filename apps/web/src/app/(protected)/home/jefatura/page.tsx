import { redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/guards";
import { GerenciaHomeClient } from "../gerencia/GerenciaHomeClient";

export const dynamic = "force-dynamic";

export default async function JefaturaHomePage() {
  const session = await requireAuth();
  const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
  const isJefatura = session.isAdmin || roles.includes("JEFATURA");
  if (!isJefatura) redirect("/home");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Inicio Jefatura</h1>
      <GerenciaHomeClient />
    </div>
  );
}
