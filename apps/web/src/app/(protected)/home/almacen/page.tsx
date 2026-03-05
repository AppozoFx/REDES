import { redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/guards";
import HomeAlmacenClient from "./HomeAlmacenClient";

export const dynamic = "force-dynamic";

export default async function HomeAlmacenPage() {
  const session = await requireAuth();
  const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
  const isAlmacen = session.isAdmin || roles.includes("ALMACEN");

  if (!isAlmacen) redirect("/home");

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Pagina de Inicio Almacen</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Selecciona un resumen para revisar el detalle de stock de almacen, cuadrillas y materiales.
        </p>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4 dark:border-slate-700 dark:bg-slate-900">
        <HomeAlmacenClient />
      </section>
    </div>
  );
}

