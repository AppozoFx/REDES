import Link from "next/link";
import React from "react";
import { requirePermission } from "@/core/auth/guards";
import { listCuadrillas } from "@/domain/cuadrillas/repo";

export default async function CuadrillasListPage() {
  await requirePermission("CUADRILLAS_MANAGE");
  const rows = await listCuadrillas();

  return (
    <div className="space-y-4 text-slate-900 dark:text-slate-100">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Cuadrillas</h1>
        <Link className="rounded border border-slate-300 px-3 py-2 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" href="/home/cuadrillas/new">
          Nueva cuadrilla
        </Link>
      </div>

      <div className="overflow-hidden rounded border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 dark:bg-slate-800 dark:text-slate-100">
            <tr>
              <th className="p-2 text-left">ID</th>
              <th className="p-2 text-left">Nombre</th>
              <th className="p-2 text-left">Nro</th>
              <th className="p-2 text-left">Categoria</th>
              <th className="p-2 text-left">Vehiculo</th>
              <th className="p-2 text-left">Estado</th>
              <th className="p-2 text-left">Accion</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any, idx: number) => (
              <React.Fragment key={r.id}>
                {(idx === 0 || rows[idx - 1].categoria !== r.categoria) ? (
                  <tr className="bg-slate-200/60 dark:bg-slate-800/80">
                    <td colSpan={7} className="p-2 font-medium">{r.categoria}</td>
                  </tr>
                ) : null}
                <tr className="border-t border-slate-200 dark:border-slate-700">
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
              </React.Fragment>
            ))}

            {rows.length === 0 && (
              <tr>
                <td className="p-4 text-slate-500 dark:text-slate-400" colSpan={7}>
                  No hay cuadrillas todavia.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
