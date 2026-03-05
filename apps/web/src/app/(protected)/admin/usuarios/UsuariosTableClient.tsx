"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type UsuarioRow = {
  uid: string;
  email: string;
  nombre: string;
  roles: string[];
  areas: string[];
  estadoAcceso: string;
};

export default function UsuariosTableClient({ rows }: { rows: UsuarioRow[] }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => {
      const haystack = [
        r.nombre,
        r.email,
        r.uid,
        (r.roles ?? []).join(" "),
        (r.areas ?? []).join(" "),
        r.estadoAcceso,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [q, rows]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageSize, safePage]);

  const startRow = filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endRow = (safePage - 1) * pageSize + paged.length;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-700">
        <div className="w-full max-w-md">
          <label htmlFor="usuarios-search" className="sr-only">
            Buscar usuarios
          </label>
          <input
            id="usuarios-search"
            type="search"
            placeholder="Buscar por nombre, correo, rol, area o UID..."
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-0 transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-950"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 dark:text-slate-400">Filas</label>
          <select
            value={String(pageSize)}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
          Mostrando <b>{startRow}</b>-<b>{endRow}</b> de <b>{filtered.length}</b>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 dark:bg-slate-800">
            <tr>
              <th className="p-3 text-left font-semibold">Nombre</th>
              <th className="p-3 text-left font-semibold">Email</th>
              <th className="p-3 text-left font-semibold">Roles</th>
              <th className="p-3 text-left font-semibold">Areas</th>
              <th className="p-3 text-left font-semibold">Estado</th>
              <th className="p-3 text-left font-semibold">Accion</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((r) => (
              <tr key={r.uid} className="border-t border-slate-200 dark:border-slate-700">
                <td className="p-3 font-medium text-slate-800 dark:text-slate-100">{r.nombre || "-"}</td>
                <td className="p-3 text-slate-600 dark:text-slate-300">{r.email || "-"}</td>
                <td className="p-3">{(r.roles ?? []).join(", ") || "-"}</td>
                <td className="p-3">{(r.areas ?? []).join(", ") || "-"}</td>
                <td className="p-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      String(r.estadoAcceso || "").toUpperCase() === "HABILITADO"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                        : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                    }`}
                  >
                    {r.estadoAcceso}
                  </span>
                </td>
                <td className="p-3">
                  <Link
                    className="inline-flex h-8 items-center rounded-lg border border-slate-300 px-3 text-xs font-medium transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    href={`/admin/usuarios/${r.uid}`}
                  >
                    Ver / editar
                  </Link>
                </td>
              </tr>
            ))}

            {paged.length === 0 && (
              <tr>
                <td className="p-8 text-center text-slate-500 dark:text-slate-400" colSpan={6}>
                  No hay resultados para ese filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
        <div>
          Pagina <b>{safePage}</b> de <b>{totalPages}</b>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="rounded-lg border border-slate-300 px-3 py-1.5 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Anterior
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className="rounded-lg border border-slate-300 px-3 py-1.5 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Siguiente
          </button>
        </div>
      </div>
    </section>
  );
}
