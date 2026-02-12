import { notFound } from "next/navigation";
import { requireAdmin } from "@/core/auth/guards";
import { adminDb } from "@/lib/firebase/admin";
import { updateRole, softDeleteRole, reactivateRole } from "../actions";

import { listActivePermissions } from "@/domain/permissions/permissions.repo";
import { RolePermissionsEditor } from "@/ui/admin/roles/RolePermissionsEditor";

export default async function RoleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  if (!id) return notFound();

  const doc = await adminDb().collection("roles").doc(id).get();
  if (!doc.exists) return notFound();

  const role = doc.data() as any;

  // ✅ Cargar permisos activos (catálogo)
  const perms = await listActivePermissions();

  // ✅ Sanitizar: pasar al client solo datos planos (sin audit/timestamps)
  const available = perms.map((p: any) => ({
    id: p.id,
    modulo: String(p.modulo ?? ""),
    nombre: String(p.nombre ?? ""),
  }));

  const selected = Array.isArray(role.permissions) ? role.permissions : [];

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Rol: {role.id}</h1>

      {/* EDITAR */}
      <form
        action={async (formData) => {
          "use server";
          await updateRole(role.id, formData);
        }}
        className="space-y-3 border rounded p-4"
      >
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

      {/* ✅ NUEVO: PERMISOS DEL ROL */}
      <div className="border rounded p-4">
        <RolePermissionsEditor roleId={role.id} available={available} selected={selected} />
      </div>

      {/* SOFT DELETE */}
      {role.estado === "ACTIVO" && (
        <form
          action={async (formData) => {
            "use server";
            await softDeleteRole(role.id, formData);
          }}
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
        <form
          action={async () => {
            "use server";
            await reactivateRole(role.id);
          }}
          className="rounded border border-yellow-400 p-4"
        >
          <div className="text-sm mb-3">
            Este rol está <b>INACTIVO</b>.
          </div>
          <button className="rounded border px-3 py-2 hover:bg-black/5">
            Reactivar
          </button>
        </form>
      )}
    </div>
  );
}
