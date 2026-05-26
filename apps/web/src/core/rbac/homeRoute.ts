import type { ServerSession } from "@/core/auth/session";

const ROLE_HOME: Record<string, string> = {
  TI: "/home/ti",
  RRHH: "/home/rrhh",
  SUPERVISOR: "/home/supervisor",
  SEGURIDAD: "/home/seguridad",
  GERENCIA: "/home/gerencia",
  JEFATURA: "/home/jefatura",
  ALMACEN: "/home/almacen",
  GESTOR: "/home/gestor",
  COORDINADOR: "/home/coordinador",
  TECNICO: "/home/tecnico",
};

const ROLE_PRIORITY: string[] = [
  "TI",
  "RRHH",
  "SUPERVISOR",
  "SEGURIDAD",
  "GERENCIA",
  "JEFATURA",
  "ALMACEN",
  "GESTOR",
  "COORDINADOR",
  "TECNICO",
];

export function getDefaultRoleForRoles(roles: string[] = []): string | null {
  for (const role of ROLE_PRIORITY) {
    if (roles.includes(role)) return role;
  }
  return null;
}

export function getHomeRouteForSession(session: ServerSession): string {
  const roles = session.access.roles ?? [];
  const defaultRole = getDefaultRoleForRoles(roles);
  if (defaultRole) return ROLE_HOME[defaultRole];

  // fallback seguro
  return "/home/tecnico";
}
