import Link from "next/link";
import { requirePermission } from "@/core/auth/guards";
import { listCuadrillas } from "@/domain/cuadrillas/repo";

export default async function CuadrillasListPage() {
  await requirePermission("CUADRILLAS_MANAGE");
  const rows = await listCuadrillas();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Cuadrillas</h1>
        <Link className="rounded border px-3 py-2 hover:bg-black/5" href="/home/cuadrillas/new">
          Nueva cuadrilla
        </Link>
      </div>

      <div className="rounded border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-black/5">
            <tr>
              <th className="p-2 text-left">ID</th>
              <th className="p-2 text-left">Nombre</th>
              <th className="p-2 text-left">N°</th>
              <th className="p-2 text-left">Categoría</th>
              <th className="p-2 text-left">Vehículo</th>
              <th className="p-2 text-left">Estado</th>
              <th className="p-2 text-left">Acción</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t">
                <td className="p-2 font-mono">{r.id}</td>
                <td className="p-2">{r.nombre}</td>
                <td className="p-2">{r.numeroCuadrilla}</td>
                <td className="p-2">{r.categoria}</td>
                <td className="p-2">{r.vehiculo}</td>
                <td className="p-2">{r.estado}</td>
                <td className="p-2">
                  <Link className="underline" href={`/home/cuadrillas/${r.id}`}>
                    Ver / editar
                  </Link>
                </td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td className="p-4 opacity-70" colSpan={7}>
                  No hay cuadrillas todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

