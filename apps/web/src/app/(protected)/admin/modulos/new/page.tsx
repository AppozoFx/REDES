import { requireAdmin } from "@/core/auth/guards";
import { createModule } from "../actions";

export default async function NewModulePage() {
  await requireAdmin();

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Nuevo módulo</h1>

      <form action={createModule} className="space-y-3 rounded border p-4">
        <div>
          <label className="text-sm">ID (ej: INSTALACIONES)</label>
          <input name="id" className="w-full border rounded px-3 py-2" />
        </div>

        <div>
          <label className="text-sm">Key (ej: INSTALACIONES)</label>
          <input name="key" className="w-full border rounded px-3 py-2" />
        </div>

        <div>
          <label className="text-sm">Nombre</label>
          <input name="nombre" className="w-full border rounded px-3 py-2" />
        </div>

        <div>
          <label className="text-sm">Descripción</label>
          <input name="descripcion" className="w-full border rounded px-3 py-2" />
        </div>

        <div>
          <label className="text-sm">Orden</label>
          <input
            name="orden"
            type="number"
            defaultValue={0}
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <button className="rounded border px-3 py-2 hover:bg-black/5">Crear</button>
      </form>
    </div>
  );
}
