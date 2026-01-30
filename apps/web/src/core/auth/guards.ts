import { redirect } from "next/navigation";
import { getServerSession } from "./session";

export async function requireAuth() {
  const session = await getServerSession();
  if (!session) redirect("/login");
  if (session.access.estadoAcceso !== "HABILITADO") redirect("/login"); // o /blocked
  return session;
}

export async function requireAdmin() {
  const session = await requireAuth();
  if (!session.isAdmin) redirect("/"); // o /no-access
  return session;
}

export async function requireArea(area: string) {
  const session = await requireAuth();
  if (!session.access.areas.includes(area) && !session.isAdmin) {
    redirect("/");
  }
  return session;
}
