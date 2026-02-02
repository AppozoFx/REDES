import Link from "next/link";
import type { Permission } from "@/types/permissions";
import { permissionsDisableAction, permissionsEnableAction } from "@/app/(protected)/admin/permissions/actions";

export function PermissionsList({ items }: { items: Permission[] }) {
  return (
    <div className="space-y-2">
      <div className="rounded border">
        <div className="grid grid-cols-5 gap-2 p-3 text-sm font-medium">
          <div>ID</div>
          <div>Módulo</div>
          <div>Nombre</div>
          <div>Estado</div>
          <div className="text-right">Acciones</div>
        </div>

        {items.map((p) => (
          <div key={p.id} className="grid grid-cols-5 gap-2 border-t p-3 text-sm">
            <div className="font-mono">
              <Link className="underline" href={`/admin/permissions/${p.id}`}>
                {p.id}
              </Link>
            </div>

            <div>{p.modulo}</div>
            <div>{p.nombre}</div>
            <div>{p.estado}</div>

            <div className="text-right">
              {p.estado === "ACTIVO" ? (
                <form action={permissionsDisableAction.bind(null, p.id)}>
  <button className="underline">Desactivar</button>
</form>

              ) : (
                <form action={permissionsEnableAction.bind(null, p.id)}>
  <button className="underline">Activar</button>
</form>

              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
