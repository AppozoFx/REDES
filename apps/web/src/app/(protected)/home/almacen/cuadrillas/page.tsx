import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAuth } from "@/core/auth/guards";
import AdminInstalacionesClient from "../../../admin/instalaciones/AdminInstalacionesClient";

export const dynamic = "force-dynamic";

export default async function HomeAlmacenCuadrillasPage() {
  const session = await requireAuth();
  const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
  const isAlmacen = session.isAdmin || roles.includes("ALMACEN");

  if (!isAlmacen) redirect("/home");

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <Link
          href="/home/almacen"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <span aria-hidden>←</span>
          Regresar
        </Link>
      </div>
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Stock de Cuadrillas</h1>
      </section>
      <AdminInstalacionesClient showManualAdjustPanel={false} showControlHeader={false} />
    </div>
  );
}
