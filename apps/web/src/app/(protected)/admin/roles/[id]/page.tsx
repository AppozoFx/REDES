import { notFound } from "next/navigation";
import { requireAdmin } from "@/core/auth/guards";
import { adminDb } from "@/lib/firebase/admin";
import { updateRole, softDeleteRole } from "../actions";

export default async function RoleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params; // ✅ unwrap async params

  if (!id) return notFound();

  const doc = await adminDb().collection("roles").doc(id).get();
  if (!doc.exists) return notFound();

  const role = doc.data() as any;

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Rol: {role.id}</h1>

      {/* EDITAR */}
      <form action={updateRole.bind(null, role.id)} className="space-y-3 border rounded p-4">
        <h2 className="font-medium">Editar</h2>

        <div>
          <label className="text-sm">Nombre</label>
          <input
            name="nombre"
            defaultValue={role.nombre}
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="text-sm">Descripción</label>
          <input
            name="descripcion"
            defaultValue={role.descripcion}
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <button className="rounded border px-3 py-2 hover:bg-black/5">
          Guardar cambios
        </button>
      </form>

      {/* SOFT DELETE */}
      {role.estado === "ACTIVO" && (
        <form
          action={softDeleteRole.bind(null, role.id)}
          className="space-y-3 border rounded p-4 border-red-300"
        >
          <h2 className="font-medium text-red-700">Desactivar rol</h2>

          <div>
            <label className="text-sm">Motivo de baja</label>
            <input
              name="motivoBaja"
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>

          <button className="rounded border border-red-400 px-3 py-2 text-red-700 hover:bg-red-50">
            Desactivar
          </button>
        </form>
      )}

      {role.estado === "INACTIVO" && (
        <div className="rounded border border-yellow-400 p-4 text-sm">
          Este rol está <b>INACTIVO</b>.
        </div>
      )}
    </div>
  );
}
