import { requireAdmin } from "@/core/auth/guards";
import { createModule } from "../actions";

export default async function NewModulePage() {
  await requireAdmin();

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Nuevo módulo</h1>

      <form
        action={async (formData) => {
          "use server";
          await createModule(formData);
        }}
        className="space-y-3 rounded border p-4"
      >
        <div>
          <label className="text-sm">ID (ej: INSTALACIONES)</label>
          <input name="id" className="ui-input-inline ui-input-inline ui-input" />
        </div>

        <div>
          <label className="text-sm">Key (ej: INSTALACIONES)</label>
          <input name="key" className="ui-input-inline ui-input-inline ui-input" />
        </div>

        <div>
          <label className="text-sm">Nombre</label>
          <input name="nombre" className="ui-input-inline ui-input-inline ui-input" />
        </div>

        <div>
          <label className="text-sm">Descripción</label>
          <input name="descripcion" className="ui-input-inline ui-input-inline ui-input" />
        </div>

        <div>
          <label className="text-sm">Orden</label>
          <input
            name="orden"
            type="number"
            defaultValue={0}
            className="ui-input"
          />
        </div>

        <button className="rounded border px-3 py-2 hover:bg-black/5">Crear</button>
      </form>
    </div>
  );
}


