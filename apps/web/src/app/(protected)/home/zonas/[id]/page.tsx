import { notFound } from "next/navigation";
import { requirePermission } from "@/core/auth/guards";
import { adminDb } from "@/lib/firebase/admin";
import { disableZonaAction, enableZonaAction, updateZonaAction } from "../actions";

export default async function ZonaDetailPage(props: { params: Promise<{ id: string }> }) {
  await requirePermission("ZONAS_MANAGE");
  const { id } = await props.params;
  if (!id) return notFound();

  const doc = await adminDb().collection("zonas").doc(id).get();
  if (!doc.exists) return notFound();
  const z = doc.data() as any;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Zona: {id}</h1>

      <div className="rounded border p-4 text-sm space-y-1">
        <div>
          <b>Zona:</b> {z.zona}
        </div>
        <div>
          <b>Número:</b> {z.numero}
        </div>
        <div>
          <b>Nombre:</b> {z.nombre}
        </div>
      </div>

      <form
        key={`${z.tipo}|${z.estado}|${(z.distritos ?? []).join(',')}`}
        action={updateZonaAction.bind(null, id)}
        className="space-y-3 rounded border p-4"
      >
        <h2 className="font-medium">Editar</h2>

        <div>
          <label className="text-sm">Tipo</label>
          <select name="tipo" className="w-full border rounded px-3 py-2" defaultValue={z.tipo}>
            <option value="REGULAR">REGULAR</option>
            <option value="ALTO_VALOR">ALTO_VALOR</option>
          </select>
        </div>

        <div>
          <label className="text-sm">Estado</label>
          <select name="estado" className="w-full border rounded px-3 py-2" defaultValue={z.estado}>
            <option value="HABILITADO">HABILITADO</option>
            <option value="INHABILITADO">INHABILITADO</option>
          </select>
        </div>

        <div>
          <label className="text-sm">Distritos (separados por coma o salto de línea)</label>
          <textarea
            name="distritos"
            defaultValue={(z.distritos ?? []).join(", ")}
            className="w-full border rounded px-3 py-2"
            rows={3}
          />
        </div>

        <button className="rounded border px-3 py-2 hover:bg-black/5">Guardar cambios</button>
      </form>

      {z.estado === "HABILITADO" ? (
        <form action={disableZonaAction.bind(null, id)} className="rounded border border-red-300 p-4 space-y-3">
          <div className="font-medium text-red-700">Inhabilitar zona</div>
          <button className="rounded border border-red-400 px-3 py-2 text-red-700 hover:bg-red-50">
            Inhabilitar
          </button>
        </form>
      ) : (
        <form action={enableZonaAction.bind(null, id)} className="rounded border border-yellow-400 p-4">
          <div className="text-sm mb-3">Esta zona está <b>INHABILITADA</b>.</div>
          <button className="rounded border px-3 py-2 hover:bg-black/5">Habilitar</button>
        </form>
      )}
    </div>
  );
}
