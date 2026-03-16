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

export function getHomeRouteForSession(session: ServerSession): string {
  const roles = session.access.roles ?? [];

  for (const r of ROLE_PRIORITY) {
    if (roles.includes(r)) return ROLE_HOME[r];
  }

  // fallback seguro
  return "/home/tecnico";
}
