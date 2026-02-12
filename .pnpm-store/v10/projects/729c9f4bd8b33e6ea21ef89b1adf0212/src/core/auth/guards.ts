import { redirect } from "next/navigation";
import { getServerSession } from "./session";

const LOGIN_PATH = "/login";
const HOME_PATH = "/home";
const ADMIN_FALLBACK = "/admin";

export async function requireAuth() {
  const session = await getServerSession();
  if (!session) redirect(LOGIN_PATH);
  if (session.access.estadoAcceso !== "HABILITADO") redirect(LOGIN_PATH);
  return session;
}

export async function requireAdmin() {
  const session = await requireAuth();
  if (!session.isAdmin) redirect(HOME_PATH);
  return session;
}

export async function requireArea(area: string) {
  const session = await requireAuth();
  if (session.isAdmin) return session;

  if (!session.access.areas.includes(area)) {
    redirect(HOME_PATH);
  }
  return session;
}

export async function requirePermission(permission: string) {
  const session = await requireAuth();
  if (session.isAdmin) return session;

  if (!session.permissions.includes(permission)) {
    redirect(ADMIN_FALLBACK);
  }
  return session;
}
