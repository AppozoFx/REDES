export type AdminNavItem = {
  key: string;
  label: string;
  href: string;
  adminOnly?: boolean;
};

export const ADMIN_NAV_OVERRIDES: Record<string, Partial<AdminNavItem>> = {
  // ADMIN-only
  ROLES: { href: "/admin/roles", adminOnly: true, label: "Roles" },
  MODULOS: { href: "/admin/modulos", adminOnly: true, label: "Módulos" },
  USUARIOS: { href: "/admin/usuarios", adminOnly: true, label: "Usuarios" },

  // Por área
  INSTALACIONES: { href: "/admin/instalaciones", adminOnly: false, label: "Instalaciones" },
  AVERIAS: { href: "/admin/averias", adminOnly: false, label: "Averías" },
};
