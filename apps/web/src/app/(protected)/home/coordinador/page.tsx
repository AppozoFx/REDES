import { redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/guards";
import CoordinadorHomeClient from "./CoordinadorHomeClient";

export const dynamic = "force-dynamic";

export default async function CoordinadorHomePage() {
  const session = await requireAuth();
  const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
  if (!session.isAdmin && !roles.includes("COORDINADOR")) {
    redirect("/home");
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Inicio Coordinador</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Resumen mensual de cuadrillas: instalaciones finalizadas, garantias y cableados CAT5e/CAT6.
        </p>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4 dark:border-slate-700 dark:bg-slate-900">
        <CoordinadorHomeClient />
      </section>
    </div>
  );
}

