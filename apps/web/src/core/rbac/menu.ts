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
  PERMISSIONS: { href: "/admin/permissions", adminOnly: true, label: "Permisos" },
  // Por área
  INSTALACIONES: { href: "/admin/instalaciones", adminOnly: false, label: "Instalaciones" },
  MANTENIMIENTO: { href: "/admin/mantenimiento", adminOnly: false, label: "Mantenimiento" },
  COMUNICADOS: { href: "/admin/comunicados", adminOnly: false, label: "Comunicados" },
  ACTAS_RENOMBRAR: { href: "/admin/actas_renombrar", adminOnly: false, label: "Actas Renombrar" },
  ACTAS_RENOMBRADO: { href: "/admin/actas_renombrar", adminOnly: false, label: "Actas Renombrar" },
  

  
};


