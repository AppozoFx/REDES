import type { ServerSession } from "@/core/auth/session";

const ROLE_HOME: Record<string, string> = {
  TI: "/home/ti",
  RRHH: "/home/rrhh",
  GERENCIA: "/home/gerencia",
  SUPERVISOR: "/home/supervisor",
  COORDINADOR: "/home/coordinador",
  GESTOR: "/home/gestor",
  SEGURIDAD: "/home/seguridad",
  ALMACEN: "/home/almacen",
  TECNICO: "/home/tecnico",
};

const ROLE_PRIORITY: string[] = [
  "TI",
  "RRHH",
  "GERENCIA",
  "SUPERVISOR",
  "COORDINADOR",
  "GESTOR",
  "SEGURIDAD",
  "ALMACEN",
  "TECNICO",
];

export function getHomeRouteForSession(session: ServerSession): string {
  const roles = session.access.roles ?? [];

  for (const r of ROLE_PRIORITY) {
    if (roles.includes(r)) return ROLE_HOME[r];
  }

  // fallback seguro
  return "/home/tecnico";
}
