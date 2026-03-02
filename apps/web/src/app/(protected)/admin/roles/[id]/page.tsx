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
  const perms = await listActivePermissions();

  const available = perms.map((p: any) => ({
    id: p.id,
    modulo: String(p.modulo ?? ""),
    nombre: String(p.nombre ?? ""),
  }));

  const selected = Array.isArray(role.permissions) ? role.permissions : [];

  return (
    <div className="mx-auto max-w-3xl space-y-5 text-slate-900 dark:text-slate-100">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Rol: {role.id}</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Gestiona datos base, permisos y estado del rol.</p>
          </div>
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${String(role.estado || "").toUpperCase() === "ACTIVO" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"}`}>
            {role.estado || "-"}
          </span>
        </div>
      </section>

      <form
        action={async (formData) => {
          "use server";
          await updateRole(role.id, formData);
        }}
        className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
      >
        <h2 className="font-medium">Editar</h2>

        <div>
          <label className="text-sm">Nombre</label>
          <input name="nombre" defaultValue={role.nombre} className="ui-input mt-1" />
        </div>

        <div>
          <label className="text-sm">Descripcion</label>
          <input name="descripcion" defaultValue={role.descripcion} className="ui-input mt-1" />
        </div>

        <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700">Guardar cambios</button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <RolePermissionsEditor roleId={role.id} available={available} selected={selected} />
      </div>

      {role.estado === "ACTIVO" && (
        <form
          action={async (formData) => {
            "use server";
            await softDeleteRole(role.id, formData);
          }}
          className="space-y-3 rounded-xl border border-rose-300 bg-rose-50 p-4 dark:border-rose-800 dark:bg-rose-900/20"
        >
          <h2 className="font-medium text-rose-700 dark:text-rose-300">Desactivar rol</h2>

          <div>
            <label className="text-sm">Motivo de baja</label>
            <input name="motivoBaja" className="ui-input mt-1" required />
          </div>

          <button className="rounded-lg border border-rose-400 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-900/40">Desactivar</button>
        </form>
      )}

      {role.estado === "INACTIVO" && (
        <form
          action={async () => {
            "use server";
            await reactivateRole(role.id);
          }}
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20"
        >
          <div className="text-sm mb-3">Este rol esta <b>INACTIVO</b>.</div>
          <button className="rounded-lg border border-amber-400 px-4 py-2 text-sm font-medium transition hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900/40">Reactivar</button>
        </form>
      )}
    </div>
  );
}
