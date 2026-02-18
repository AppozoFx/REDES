import type { ServerSession } from "@/core/auth/session";

const ROLE_HOME: Record<string, string> = {
  TI: "/home/ti",
  RRHH: "/home/rrhh",
  GERENCIA: "/home/gerencia",
  GESTOR: "/home/gestor",
  TECNICO: "/home/tecnico",
};

const ROLE_PRIORITY: string[] = [
  "TI",
  "RRHH",
  "GERENCIA",
  "GESTOR",
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
