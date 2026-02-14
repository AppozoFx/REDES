import { redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/guards";
import { getHomeRouteForSession } from "@/core/rbac/homeRoute";
import { listPendingComunicadosForUser } from "@/domain/comunicados/service";

export default async function HomeRouterPage() {
  const session = await requireAuth();

  const pending = await listPendingComunicadosForUser(session);

  // Gate por cualquier comunicado pendiente (obligatorio u opcional)
  const mustGate = pending.some(
    (c) => c.obligatorio === true && c.persistencia === "ONCE"
  );

  if (mustGate) {
    redirect("/home/comunicados");
  }

  redirect(getHomeRouteForSession(session));
}
