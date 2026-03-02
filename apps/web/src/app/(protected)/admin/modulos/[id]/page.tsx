import { notFound } from "next/navigation";
import { requireAdmin } from "@/core/auth/guards";
import { adminDb } from "@/lib/firebase/admin";
import { updateModule, softDeleteModule, reactivateModule } from "../actions";

export default async function ModuleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  if (!id) return notFound();

  const doc = await adminDb().collection("modulos").doc(id).get();
  if (!doc.exists) return notFound();

  const m = doc.data() as any;

  return (
    <div className="mx-auto max-w-3xl space-y-5 text-slate-900 dark:text-slate-100">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Modulo: {m.id}</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Actualiza datos base, orden y estado del modulo.</p>
          </div>
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${String(m.estado || "").toUpperCase() === "ACTIVO" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"}`}>
            {m.estado || "-"}
          </span>
        </div>
      </section>

      <form
        action={async (formData) => {
          "use server";
          await updateModule(m.id, formData);
        }}
        className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
      >
        <h2 className="font-medium">Editar</h2>

        <div>
          <label className="text-sm">Key</label>
          <input name="key" defaultValue={m.key} className="ui-input mt-1" />
        </div>

        <div>
          <label className="text-sm">Nombre</label>
          <input name="nombre" defaultValue={m.nombre} className="ui-input mt-1" />
        </div>

        <div>
          <label className="text-sm">Descripcion</label>
          <input name="descripcion" defaultValue={m.descripcion} className="ui-input mt-1" />
        </div>

        <div>
          <label className="text-sm">Orden</label>
          <input name="orden" type="number" defaultValue={m.orden} className="ui-input mt-1" />
        </div>

        <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700">Guardar cambios</button>
      </form>

      {m.estado === "ACTIVO" && (
        <form
          action={async (formData) => {
            "use server";
            await softDeleteModule(m.id, formData);
          }}
          className="space-y-3 rounded-xl border border-rose-300 bg-rose-50 p-4 dark:border-rose-800 dark:bg-rose-900/20"
        >
          <h2 className="font-medium text-rose-700 dark:text-rose-300">Desactivar modulo</h2>

          <div>
            <label className="text-sm">Motivo de baja</label>
            <input name="motivoBaja" className="ui-input mt-1" required />
          </div>

          <button className="rounded-lg border border-rose-400 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-900/40">Desactivar</button>
        </form>
      )}

      {m.estado === "INACTIVO" && (
        <form
          action={async () => {
            "use server";
            await reactivateModule(m.id);
          }}
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20"
        >
          <div className="mb-3 text-sm">Este modulo esta <b>INACTIVO</b>.</div>
          <button className="rounded-lg border border-amber-400 px-4 py-2 text-sm font-medium transition hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900/40">Reactivar</button>
        </form>
      )}
    </div>
  );
}
