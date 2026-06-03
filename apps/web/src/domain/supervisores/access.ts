import type { ServerSession } from "@/core/auth/session";

export const PERM_SUPERVISORES_VIEW = "SUPERVISORES_VIEW";
export const PERM_SUPERVISORES_MANAGE = "SUPERVISORES_MANAGE";
export const PERM_SUPERVISORES_ASISTENCIA_VIEW = "SUPERVISORES_ASISTENCIA_VIEW";

function rolesOf(session: ServerSession) {
  return (session.access.roles || []).map((role) => String(role || "").toUpperCase());
}

function hasPermission(session: ServerSession, permission: string) {
  return session.permissions.includes(permission) || session.access.permissions.includes(permission);
}

export function canViewSupervisores(session: ServerSession) {
  const roles = rolesOf(session);
  return (
    session.isAdmin ||
    roles.includes("GERENCIA") ||
    roles.includes("JEFATURA") ||
    hasPermission(session, PERM_SUPERVISORES_VIEW) ||
    hasPermission(session, PERM_SUPERVISORES_MANAGE)
  );
}

export function canViewSupervisoresAsistencia(session: ServerSession) {
  const roles = rolesOf(session);
  return (
    session.isAdmin ||
    roles.includes("GERENCIA") ||
    roles.includes("JEFATURA") ||
    roles.includes("RRHH") ||
    hasPermission(session, PERM_SUPERVISORES_ASISTENCIA_VIEW)
  );
}

export function canManageSupervisores(session: ServerSession) {
  const roles = rolesOf(session);
  return (
    session.isAdmin ||
    roles.includes("GERENCIA") ||
    roles.includes("JEFATURA") ||
    hasPermission(session, PERM_SUPERVISORES_MANAGE)
  );
}
