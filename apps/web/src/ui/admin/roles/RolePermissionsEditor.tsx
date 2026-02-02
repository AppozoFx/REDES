"use client";

import { useMemo, useState } from "react";
import { roleUpdatePermissionsAction } from "@/app/(protected)/admin/roles/actions";

type PermissionItem = {
  id: string;
  modulo: string;
  nombre: string;
};

export function RolePermissionsEditor(props: {
  roleId: string;
  available: PermissionItem[];
  selected: string[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>(props.selected);

  const grouped = useMemo(() => {
    const map = new Map<string, PermissionItem[]>();
    for (const p of props.available) {
      const key = p.modulo || "OTROS";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [props.available]);

  function toggle(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div className="space-y-3 max-w-2xl">
      <h2 className="text-lg font-semibold">Permisos del rol</h2>

      <div className="rounded border p-3 space-y-4">
        {grouped.map(([modulo, items]) => (
          <div key={modulo} className="space-y-2">
            <div className="text-sm font-medium">{modulo}</div>

            <div className="space-y-1">
              {items.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={picked.includes(p.id)}
                    onChange={() => toggle(p.id)}
                  />
                  <span className="font-mono">{p.id}</span>
                  <span className="opacity-80">— {p.nombre}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      <form
        action={async () => {
          setError(null);
          try {
            await roleUpdatePermissionsAction(props.roleId, { permissions: picked });
          } catch (e: any) {
            setError(e?.message ?? "Error guardando permisos del rol");
          }
        }}
      >
        <button className="rounded border px-3 py-2">Guardar permisos</button>
      </form>
    </div>
  );
}
