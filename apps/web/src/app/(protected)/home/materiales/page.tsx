import { requirePermission } from "@/core/auth/guards";
import ListClient from "./ListClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requirePermission("MATERIALES_VIEW");
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Almacen - Materiales</h1>
            <p className="mt-1 text-sm text-slate-500">Consulta, filtra y edita materiales de forma rapida.</p>
          </div>
          <a href="/home/materiales/crear" className="inline-flex h-10 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-700">
            Crear material
          </a>
        </div>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:p-4">
        <ListClient />
      </section>
    </div>
  );
}