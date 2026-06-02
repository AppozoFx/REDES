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

function RoleChip({ role }: { role: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:border-blue-800/60 dark:bg-blue-900/30 dark:text-blue-300">
      {role}
    </span>
  );
}

function AreaChip({ area }: { area: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:border-violet-800/60 dark:bg-violet-900/30 dark:text-violet-300">
      {area}
    </span>
  );
}

function AccessBadge({ estado }: { estado: string }) {
  const isHabilitado = String(estado || "").toUpperCase() === "HABILITADO";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        isHabilitado
          ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-300"
          : "border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/60 dark:bg-rose-900/30 dark:text-rose-300"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isHabilitado ? "bg-emerald-500" : "bg-rose-500"}`} />
      {isHabilitado ? "Habilitado" : "Inhabilitado"}
    </span>
  );
}

export default function UsuariosTableClient({ rows }: { rows: UsuarioRow[] }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => {
      const haystack = [r.nombre, r.email, r.uid, (r.roles ?? []).join(" "), (r.areas ?? []).join(" "), r.estadoAcceso]
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

  function getPageNumbers(): (number | "...")[] {
    const delta = 2;
    const range: number[] = [];
    for (let i = Math.max(1, safePage - delta); i <= Math.min(totalPages, safePage + delta); i++) range.push(i);
    const result: (number | "...")[] = [];
    if (range[0] > 1) { result.push(1); if (range[0] > 2) result.push("..."); }
    result.push(...range);
    if (range[range.length - 1] < totalPages) {
      if (range[range.length - 1] < totalPages - 1) result.push("...");
      result.push(totalPages);
    }
    return result;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-700">
        <div className="relative w-full max-w-sm">
          <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
            <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <input
            id="usuarios-search"
            type="search"
            placeholder="Buscar nombre, correo, rol, área o UID…"
            className="h-10 w-full rounded-xl border border-slate-200 bg-white py-0 pl-9 pr-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-blue-900/40"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={String(pageSize)}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="25">25 / pág</option>
            <option value="50">50 / pág</option>
            <option value="100">100 / pág</option>
          </select>
          <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* ── Tabla ── */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Usuario</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Roles</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Áreas</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Acceso</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {paged.map((r, i) => (
              <tr
                key={r.uid}
                className={`transition-colors hover:bg-blue-50/40 dark:hover:bg-blue-900/10 ${
                  i % 2 !== 0 ? "bg-slate-50/50 dark:bg-slate-800/20" : ""
                }`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#30518c]/10 text-[11px] font-bold text-[#30518c] dark:bg-[#30518c]/20 dark:text-[#7b9dd4]">
                      {(r.nombre !== "-" ? r.nombre : r.email).slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-900 dark:text-slate-100">{r.nombre || "—"}</div>
                      <div className="truncate text-xs text-slate-400 dark:text-slate-500">{r.email || r.uid}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(r.roles ?? []).length ? r.roles.map((role) => <RoleChip key={role} role={role} />) : <span className="text-xs text-slate-400">—</span>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(r.areas ?? []).length ? r.areas.map((a) => <AreaChip key={a} area={a} />) : <span className="text-xs text-slate-400">—</span>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <AccessBadge estado={r.estadoAcceso} />
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/usuarios/${r.uid}`}
                    className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    Editar
                  </Link>
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-2 text-slate-400 dark:text-slate-500">
                    <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <p className="text-sm">No hay resultados para ese filtro.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Paginación ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 dark:border-slate-700">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {filtered.length > 0
            ? `${(safePage - 1) * pageSize + 1}–${(safePage - 1) * pageSize + paged.length} de ${filtered.length}`
            : "0 resultados"}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          {getPageNumbers().map((p, i) =>
            p === "..." ? (
              <span key={`e-${i}`} className="flex h-8 w-8 items-center justify-center text-xs text-slate-400">…</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => setPage(Number(p))}
                className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition ${
                  safePage === p
                    ? "bg-[#30518c] text-white shadow-[0_4px_12px_rgba(48,81,140,.3)]"
                    : "border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                {p}
              </button>
            )
          )}
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
