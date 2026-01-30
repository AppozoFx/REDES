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

  const { id } = await params; // ✅ importante en tu Next
  if (!id) return notFound();

  const doc = await adminDb().collection("modulos").doc(id).get();
  if (!doc.exists) return notFound();

  const m = doc.data() as any;

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Módulo: {m.id}</h1>

      <form action={updateModule.bind(null, m.id)} className="space-y-3 border rounded p-4">
        <h2 className="font-medium">Editar</h2>

        <div>
          <label className="text-sm">Key</label>
          <input name="key" defaultValue={m.key} className="w-full border rounded px-3 py-2" />
        </div>

        <div>
          <label className="text-sm">Nombre</label>
          <input
            name="nombre"
            defaultValue={m.nombre}
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="text-sm">Descripción</label>
          <input
            name="descripcion"
            defaultValue={m.descripcion}
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="text-sm">Orden</label>
          <input
            name="orden"
            type="number"
            defaultValue={m.orden}
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <button className="rounded border px-3 py-2 hover:bg-black/5">Guardar cambios</button>
      </form>

      {m.estado === "ACTIVO" && (
        <form
          action={softDeleteModule.bind(null, m.id)}
          className="space-y-3 border rounded p-4 border-red-300"
        >
          <h2 className="font-medium text-red-700">Desactivar módulo</h2>

          <div>
            <label className="text-sm">Motivo de baja</label>
            <input name="motivoBaja" className="w-full border rounded px-3 py-2" required />
          </div>

          <button className="rounded border border-red-400 px-3 py-2 text-red-700 hover:bg-red-50">
            Desactivar
          </button>
        </form>
      )}

      {m.estado === "INACTIVO" && (
  <form action={reactivateModule.bind(null, m.id)} className="rounded border border-yellow-400 p-4">
    <div className="text-sm mb-3">
      Este módulo está <b>INACTIVO</b>.
    </div>
    <button className="rounded border px-3 py-2 hover:bg-black/5">
      Reactivar
    </button>
  </form>
)}

    </div>
  );
}
