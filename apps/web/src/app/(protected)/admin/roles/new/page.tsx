import { createRole } from "../actions";
import { requireAdmin } from "@/core/auth/guards";

export default async function NewRolePage() {
  await requireAdmin();

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Nuevo rol</h1>

      <form
        action={async (formData) => {
          "use server";
          await createRole(formData);
        }}
        className="space-y-3 rounded border p-4"
      >
        <div>
          <label className="text-sm">ID (ej: ADMIN)</label>
          <input name="id" className="ui-input-inline ui-input-inline ui-input" />
        </div>

        <div>
          <label className="text-sm">Nombre</label>
          <input name="nombre" className="ui-input-inline ui-input-inline ui-input" />
        </div>

        <div>
          <label className="text-sm">Descripción</label>
          <input name="descripcion" className="ui-input-inline ui-input-inline ui-input" />
        </div>

        <button className="rounded border px-3 py-2 hover:bg-black/5">Crear</button>
      </form>
    </div>
  );
}


