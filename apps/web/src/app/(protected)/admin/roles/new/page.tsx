import { createRole } from "../actions";
import { requireAdmin } from "@/core/auth/guards";

export default async function NewRolePage() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-2xl space-y-4 text-slate-900 dark:text-slate-100">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-2xl font-semibold">Nuevo rol</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Crea un rol con su identificador y descripcion.</p>
      </section>

      <form
        action={async (formData) => {
          "use server";
          await createRole(formData);
        }}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
      >
        <div>
          <label className="text-sm">ID (ej: ADMIN)</label>
          <input name="id" className="ui-input mt-1" />
        </div>

        <div>
          <label className="text-sm">Nombre</label>
          <input name="nombre" className="ui-input mt-1" />
        </div>

        <div>
          <label className="text-sm">Descripcion</label>
          <input name="descripcion" className="ui-input mt-1" />
        </div>

        <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700">Crear</button>
      </form>
    </div>
  );
}
