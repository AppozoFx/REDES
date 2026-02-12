import Link from "next/link";
import { requirePermission } from "@/core/auth/guards";
import { listZonas } from "@/domain/zonas/repo";

export default async function ZonasListPage() {
  await requirePermission("ZONAS_MANAGE");
  const zonas = await listZonas();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Zonas</h1>
        <Link className="rounded border px-3 py-2 hover:bg-black/5" href="/home/zonas/new">
          Nueva zona
        </Link>
      </div>

      <div className="rounded border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-black/5">
            <tr>
              <th className="p-2 text-left">ID</th>
              <th className="p-2 text-left">Zona</th>
              <th className="p-2 text-left">Número</th>
              <th className="p-2 text-left">Nombre</th>
              <th className="p-2 text-left">Tipo</th>
              <th className="p-2 text-left">Estado</th>
              <th className="p-2 text-left">Distritos</th>
              <th className="p-2 text-left">Acción</th>
            </tr>
          </thead>
          <tbody>
            {zonas.map((z: any) => (
              <tr key={z.id} className="border-t">
                <td className="p-2 font-mono">{z.id}</td>
                <td className="p-2">{z.zona}</td>
                <td className="p-2">{z.numero}</td>
                <td className="p-2">{z.nombre}</td>
                <td className="p-2">{z.tipo}</td>
                <td className="p-2">{z.estado}</td>
                <td className="p-2">{(z.distritos ?? []).join(", ")}</td>
                <td className="p-2">
                  <Link className="underline" href={`/home/zonas/${z.id}`}>
                    Ver / editar
                  </Link>
                </td>
              </tr>
            ))}

            {zonas.length === 0 && (
              <tr>
                <td className="p-4 opacity-70" colSpan={8}>
                  No hay zonas todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

