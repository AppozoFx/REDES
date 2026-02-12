import { listActiveModules } from "@/domain/modulos/service";
import { ADMIN_NAV_OVERRIDES, AdminNavItem } from "./menu";

export async function buildAdminNav(params: {
  isAdmin: boolean;
  areas: string[];
}): Promise<AdminNavItem[]> {
  const modules = await listActiveModules();

  const items: AdminNavItem[] = modules
    .map((m) => {
      const override = ADMIN_NAV_OVERRIDES[m.key];
      if (!override?.href) return null; // sin mapping => no mostrar (evita links rotos)

      const adminOnly = override.adminOnly ?? false;
      const label = override.label ?? m.nombre;

      const allowed = params.isAdmin || (!adminOnly && params.areas.includes(m.key));
      if (!allowed) return null;

      return {
        key: m.key,
        label,
        href: override.href,
        adminOnly,
      };
    })
    .filter(Boolean) as AdminNavItem[];

  return [{ key: "DASHBOARD", label: "Dashboard", href: "/admin" }, ...items];
}
