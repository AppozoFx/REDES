import type { ServerSession } from "@/core/auth/session";

export type NavItem = {
  key: string;
  label: string;
  href: string;
};

function hasArea(session: ServerSession, area: string) {
  return session.access.areas?.includes(area) ?? false;
}

function hasPerm(session: ServerSession, perm: string) {
  return session.permissions?.includes(perm) ?? false;
}

export function buildHomeNav(session: ServerSession): NavItem[] {
  const items: NavItem[] = [
    { key: "HOME", label: "Inicio", href: "/home" },
    { key: "COMUNICADOS", label: "Comunicados", href: "/home/comunicados" },
  ];

  if (hasArea(session, "INSTALACIONES")) {
    items.push({ key: "INSTALACIONES", label: "Instalaciones", href: "/home/instalaciones" });
  }

  if (hasArea(session, "AVERIAS")) {
    items.push({ key: "AVERIAS", label: "Averías", href: "/home/averias" });
  }

  // ✅ Permiso real en tu sistema
  if (hasPerm(session, "USERS_LIST")) {
    items.push({ key: "USUARIOS", label: "Usuarios", href: "/home/usuarios" });
  }

  // Zonas para no-admins con permiso específico
  if (hasPerm(session, "ZONAS_MANAGE")) {
    items.push({ key: "ZONAS", label: "Zonas", href: "/home/zonas" });
  }

  // Cuadrillas (Instalaciones) para no-admins con permiso específico
  if (hasPerm(session, "CUADRILLAS_MANAGE")) {
    items.push({ key: "CUADRILLAS", label: "Cuadrillas", href: "/home/cuadrillas" });
  }

  // Órdenes -> Importar (solo con permiso)
  if (hasPerm(session, "ORDENES_IMPORT")) {
    items.push({ key: "ORDENES_IMPORT", label: "Órdenes: Importar", href: "/home/ordenes/import" });
  }

  items.push({ key: "PERFIL", label: "Mi perfil", href: "/home/perfil" });

  return items;
}
