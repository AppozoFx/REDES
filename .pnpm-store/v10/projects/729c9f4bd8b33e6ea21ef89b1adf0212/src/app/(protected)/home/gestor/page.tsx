import { redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/guards";
import { GestorHomeClient } from "./GestorHomeClient";

export const dynamic = "force-dynamic";

export default async function GestorHomePage() {
  const session = await requireAuth();
  const isGestor = session.access.roles.includes("GESTOR");
  if (!session.isAdmin && !isGestor) redirect("/home");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Inicio Gestor</h1>
      <GestorHomeClient />
    </div>
  );
}
