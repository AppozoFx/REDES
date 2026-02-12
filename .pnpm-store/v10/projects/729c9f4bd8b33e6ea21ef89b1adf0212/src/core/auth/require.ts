import { getServerSession } from "@/core/auth/session";

export async function requireServerPermission(permission: string) {
  const session = await getServerSession();

  if (!session) throw new Error("UNAUTHENTICATED");
  if (session.access.estadoAcceso !== "HABILITADO") throw new Error("ACCESS_DISABLED");

  // Admin bypass
  if (session.isAdmin) return session;

  if (!session.permissions.includes(permission)) throw new Error("FORBIDDEN");
  return session;
}
