import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/guards";
import {
  PERM_SUPERVISORES_MANAGE,
  PERM_SUPERVISORES_VIEW,
} from "@/domain/supervisores/access";

export const dynamic = "force-dynamic";

export default async function SupervisionHomePage() {
  const session = await requireAuth();
  const roles = (session.access.roles || []).map((role) => String(role || "").toUpperCase());
  const canUse =
    session.isAdmin ||
    roles.includes("GERENCIA") ||
    roles.includes("JEFATURA") ||
    roles.includes("SUPERVISOR") ||
    session.permissions.includes(PERM_SUPERVISORES_VIEW) ||
    session.permissions.includes(PERM_SUPERVISORES_MANAGE);

  if (!canUse) redirect("/home");

  const links = [
    { href: "/home/instalaciones/asignacion-supervisores", title: "Asignacion de Supervisores", description: "Base permanente y distribucion diaria por cuadrilla." },
    { href: "/home/instalaciones/distribucion-zonas", title: "Distribucion por Zonas", description: "Mapeo por region con colores y ordenes por sector." },
  ];

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supervision</div>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">Supervision</h1>
        <p className="mt-1 text-sm text-slate-600">Accesos operativos para supervisores y configuracion de sectores.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[#30518c] hover:bg-[#f7faff]"
          >
            <div className="text-base font-bold text-slate-900">{link.title}</div>
            <div className="mt-1 text-sm text-slate-600">{link.description}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
