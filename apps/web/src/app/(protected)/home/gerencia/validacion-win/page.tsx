import { redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/guards";
import ValidacionWinClient from "./ValidacionWinClient";

export const dynamic = "force-dynamic";

export default async function ValidacionWinPage() {
  const session = await requireAuth();
  const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
  const isGerencia = session.isAdmin || roles.includes("GERENCIA");
  if (!isGerencia) redirect("/home");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">VALIDACION WIN</h1>
      <ValidacionWinClient />
    </div>
  );
}

