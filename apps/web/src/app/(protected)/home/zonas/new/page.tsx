import { requirePermission } from "@/core/auth/guards";
import { createZonaAction } from "../actions";

export default async function NuevaZonaPage() {
  await requirePermission("ZONAS_MANAGE");

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Nueva zona</h1>

      <form
        action={async (formData) => {
          "use server";
          await createZonaAction(formData);
        }}
        className="space-y-3 rounded border p-4"
      >
        <div>
          <label className="text-sm">Zona (ej: NORTE)</label>
          <input name="zona" className="ui-input-inline ui-input-inline ui-input" required />
        </div>

        <div>
          <label className="text-sm">Tipo</label>
          <select name="tipo" className="ui-select-inline ui-select-inline ui-select" defaultValue="REGULAR">
            <option value="REGULAR">REGULAR</option>
            <option value="ALTO_VALOR">ALTO_VALOR</option>
          </select>
        </div>

        <div>
          <label className="text-sm">Estado</label>
          <select name="estado" className="ui-select-inline ui-select-inline ui-select" defaultValue="HABILITADO">
            <option value="HABILITADO">HABILITADO</option>
            <option value="INHABILITADO">INHABILITADO</option>
          </select>
        </div>

        <div>
          <label className="text-sm">Distritos (separados por coma o salto de línea)</label>
          <textarea name="distritos" className="ui-textarea-inline ui-textarea-inline ui-textarea" rows={3} />
        </div>

        <button className="rounded border px-3 py-2 hover:bg-black/5">Crear</button>
      </form>
    </div>
  );
}


