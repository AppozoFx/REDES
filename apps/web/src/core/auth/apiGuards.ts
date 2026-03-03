import type { ServerSession } from "@/core/auth/session";

type OwnershipOptions = {
  permissions?: string[];
  allowSelf?: boolean;
};

function hasPermission(session: ServerSession, permission: string): boolean {
  return session.isAdmin || session.permissions.includes(permission);
}

export function requirePermission(session: ServerSession | null, permission: string): void {
  if (!session) throw new Error("UNAUTHENTICATED");
  if (session.access.estadoAcceso !== "HABILITADO") throw new Error("ACCESS_DISABLED");
  if (!hasPermission(session, permission)) throw new Error("FORBIDDEN");
}

export function requireAreaScope(
  session: ServerSession | null,
  requiredAreas: string[] = []
): void {
  if (!session) throw new Error("UNAUTHENTICATED");
  if (session.access.estadoAcceso !== "HABILITADO") throw new Error("ACCESS_DISABLED");
  if (session.isAdmin) return;
  if (!requiredAreas.length) return;
  const areaSet = new Set((session.access.areas || []).map((a) => String(a || "").toUpperCase()));
  const ok = requiredAreas.some((area) => areaSet.has(String(area || "").toUpperCase()));
  if (!ok) throw new Error("AREA_FORBIDDEN");
}

export function requireOwnershipIfNeeded(
  session: ServerSession | null,
  ownerUid: string,
  options: OwnershipOptions = {}
): void {
  if (!session) throw new Error("UNAUTHENTICATED");
  if (session.access.estadoAcceso !== "HABILITADO") throw new Error("ACCESS_DISABLED");
  if (session.isAdmin) return;

  const allowSelf = options.allowSelf !== false;
  const owner = String(ownerUid || "").trim();
  if (allowSelf && owner && owner === session.uid) return;

  const perms = Array.isArray(options.permissions) ? options.permissions : [];
  const hasAnyPerm = perms.some((perm) => session.permissions.includes(perm));
  if (hasAnyPerm) return;

  throw new Error("FORBIDDEN");
}

