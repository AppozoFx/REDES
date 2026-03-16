import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/guards";

const seguridadLinks = [
  {
    title: "Dashboard Instalaciones",
    description: "Vista operativa consolidada de ordenes y liquidaciones.",
    href: "/home/instalaciones/dashboard",
    tone: "from-[#16365d] to-[#2d5d93] text-white",
  },
  {
    title: "Asistencia Resumen",
    description: "Consulta asistencia cerrada por fecha, cuadrilla y tecnico.",
    href: "/home/instalaciones/asistencia/resumen",
    tone: "from-slate-900 to-slate-700 text-white",
  },
  {
    title: "Cuadrillas Gestion",
    description: "Administra cuadrillas activas y su configuracion operativa.",
    href: "/home/cuadrillas/gestion",
    tone: "from-emerald-50 to-emerald-100 text-emerald-900",
  },
  {
    title: "Tecnicos Gestion",
    description: "Revisa y actualiza el padron operativo de tecnicos.",
    href: "/home/tecnicos/gestion",
    tone: "from-amber-50 to-amber-100 text-amber-900",
  },
  {
    title: "Usuarios",
    description: "Accede a la administracion de usuarios habilitados.",
    href: "/home/usuarios",
    tone: "from-sky-50 to-sky-100 text-sky-900",
  },
  {
    title: "Ordenes Mapa",
    description: "Ubica las ordenes del dia y su distribucion geografica.",
    href: "/home/ordenes/mapa",
    tone: "from-rose-50 to-rose-100 text-rose-900",
  },
];

export const dynamic = "force-dynamic";

export default async function SeguridadHomePage() {
  const session = await requireAuth();
  const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
  const canUse = session.isAdmin || roles.includes("SEGURIDAD");
  if (!canUse) redirect("/home");

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,#17345b_0%,#2c5b90_48%,#eef4fb_48%,#fbfdff_100%)] shadow-sm">
        <div className="grid gap-6 px-6 py-7 lg:grid-cols-[1.35fr_1fr]">
          <div className="text-white">
            <div className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]">
              SEGURIDAD
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">Inicio Seguridad</h1>
            <p className="mt-3 max-w-2xl text-sm text-blue-50/90">
              Accesos directos para seguimiento operativo, asistencia, usuarios y monitoreo territorial.
            </p>
          </div>

          <div className="rounded-3xl border border-white/20 bg-white/10 p-5 text-white backdrop-blur-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-100/90">
              Alcance del rol
            </div>
            <div className="mt-3 space-y-2 text-sm text-blue-50/90">
              <div>Dashboard operativo de instalaciones</div>
              <div>Resumen de asistencia consolidada</div>
              <div>Gestion de cuadrillas y tecnicos</div>
              <div>Administracion de usuarios</div>
              <div>Consulta geografica de ordenes</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {seguridadLinks.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`group rounded-[24px] border border-slate-200 bg-gradient-to-br p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${item.tone}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">{item.title}</h2>
                <p className="mt-2 text-sm opacity-90">{item.description}</p>
              </div>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20 text-lg transition group-hover:translate-x-0.5">
                {"->"}
              </span>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
