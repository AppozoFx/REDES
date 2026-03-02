"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Row = {
  uid: string;
  nombre: string;
  email: string;
  roles: string[];
  areas: string[];
  estadoAcceso: string;
  online: boolean;
  lastSeenAt: string | null;
};

type UserAuditItem = {
  id: string;
  at: string | null;
  action: string;
  actorUid: string | null;
  actorNombre: string;
};

function asLocalDateTime(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "-";
  return d.toLocaleString("es-PE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminDashboardClient({
  rows,
  generatedAt,
  auditByUser,
}: {
  rows: Row[];
  generatedAt: string;
  auditByUser: Record<string, UserAuditItem[]>;
}) {
  const [q, setQ] = useState("");
  const [rol, setRol] = useState("");
  const [area, setArea] = useState("");
  const [estadoAcceso, setEstadoAcceso] = useState("");
  const [estadoConexion, setEstadoConexion] = useState("");
  const [sortKey, setSortKey] = useState<"usuario" | "acceso" | "conexion" | "ultimaActividad">("conexion");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [auditUidOpen, setAuditUidOpen] = useState<string | null>(null);

  const roleOptions = useMemo(
    () =>
      Array.from(new Set(rows.flatMap((r) => r.roles).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "es", { sensitivity: "base" })
      ),
    [rows]
  );
  const areaOptions = useMemo(
    () =>
      Array.from(new Set(rows.flatMap((r) => r.areas).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "es", { sensitivity: "base" })
      ),
    [rows]
  );
  const estadoOptions = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => String(r.estadoAcceso || "").trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "es", { sensitivity: "base" })
      ),
    [rows]
  );

  useEffect(() => {
    setPage(1);
  }, [q, rol, area, estadoAcceso, estadoConexion, pageSize]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = rows.filter((r) => {
      if (needle) {
        const hay = `${r.nombre} ${r.email} ${r.uid}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (rol && !r.roles.includes(rol)) return false;
      if (area && !r.areas.includes(area)) return false;
      if (estadoAcceso && r.estadoAcceso !== estadoAcceso) return false;
      if (estadoConexion === "CONECTADO" && !r.online) return false;
      if (estadoConexion === "DESCONECTADO" && r.online) return false;
      return true;
    });

    const sorted = [...base].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "usuario") {
        cmp = a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
      } else if (sortKey === "acceso") {
        cmp = String(a.estadoAcceso || "").localeCompare(String(b.estadoAcceso || ""), "es", { sensitivity: "base" });
      } else if (sortKey === "conexion") {
        cmp = Number(a.online) - Number(b.online);
      } else if (sortKey === "ultimaActividad") {
        const ta = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
        const tb = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
        cmp = ta - tb;
      }
      if (cmp === 0) {
        cmp = a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [rows, q, rol, area, estadoAcceso, estadoConexion, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const paged = useMemo(() => {
    const start = (pageSafe - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageSafe, pageSize]);

  const activeFiltersCount = [q.trim(), rol, area, estadoAcceso, estadoConexion].filter(Boolean).length;

  function clearFilters() {
    setQ("");
    setRol("");
    setArea("");
    setEstadoAcceso("");
    setEstadoConexion("");
    setPage(1);
  }

  function toggleSort(key: "usuario" | "acceso" | "conexion" | "ultimaActividad") {
    if (sortKey === key) {
      setSortDir((v) => (v === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "usuario" ? "asc" : "desc");
  }

  const kpi = useMemo(() => {
    const total = rows.length;
    const conectados = rows.filter((r) => r.online).length;
    const desconectados = total - conectados;
    const inhabilitados = rows.filter((r) => String(r.estadoAcceso || "").toUpperCase() === "INHABILITADO").length;
    return { total, conectados, desconectados, inhabilitados };
  }, [rows]);


  const fieldClass =
    "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-blue-900/40";

  const userNameByUid = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.uid, r.nombre || r.uid);
    return map;
  }, [rows]);

  const selectedAudit = auditUidOpen ? auditByUser[auditUidOpen] || [] : [];
  const selectedName = auditUidOpen ? userNameByUid.get(auditUidOpen) || auditUidOpen : "";

  return (
    <div className="space-y-4 text-slate-900 dark:text-slate-100">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Estado de usuarios y conectividad. Actualizado: {asLocalDateTime(generatedAt)}
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="text-xs text-slate-500">Total usuarios</div>
          <div className="mt-1 text-2xl font-semibold">{kpi.total}</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 shadow-sm dark:border-emerald-800 dark:bg-emerald-900/20">
          <div className="text-xs text-emerald-700 dark:text-emerald-300">Conectados</div>
          <div className="mt-1 text-2xl font-semibold text-emerald-700 dark:text-emerald-300">{kpi.conectados}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="text-xs text-slate-500">Desconectados</div>
          <div className="mt-1 text-2xl font-semibold">{kpi.desconectados}</div>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 shadow-sm dark:border-rose-800 dark:bg-rose-900/20">
          <div className="text-xs text-rose-700 dark:text-rose-300">Acceso inhabilitado</div>
          <div className="mt-1 text-2xl font-semibold text-rose-700 dark:text-rose-300">{kpi.inhabilitados}</div>
        </div>
      </section>

      {auditUidOpen ? (
        <div className="fixed inset-0 z-[180] bg-black/40 p-4" onClick={() => setAuditUidOpen(null)}>
          <div
            className="mx-auto mt-12 w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-semibold">Auditoria de usuario</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">{selectedName}</p>
              </div>
              <button
                type="button"
                onClick={() => setAuditUidOpen(null)}
                className="h-9 rounded-lg border border-slate-300 px-3 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Cerrar
              </button>
            </div>
            <div className="max-h-[60vh] overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Fecha</th>
                    <th className="px-3 py-2 text-left font-semibold">Accion</th>
                    <th className="px-3 py-2 text-left font-semibold">Actor</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedAudit.map((x) => (
                    <tr key={x.id} className="border-t border-slate-200 dark:border-slate-700">
                      <td className="px-3 py-2">{asLocalDateTime(x.at)}</td>
                      <td className="px-3 py-2">{x.action}</td>
                      <td className="px-3 py-2">{x.actorNombre}</td>
                    </tr>
                  ))}
                  {!selectedAudit.length ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-8 text-center text-slate-500">
                        No hay eventos de auditoria para este usuario.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-5">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre/email/uid"
            className={fieldClass}
          />
          <select value={rol} onChange={(e) => setRol(e.target.value)} className={fieldClass}>
            <option value="">Rol: todos</option>
            {roleOptions.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
          <select value={area} onChange={(e) => setArea(e.target.value)} className={fieldClass}>
            <option value="">Area: todas</option>
            {areaOptions.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
          <select value={estadoAcceso} onChange={(e) => setEstadoAcceso(e.target.value)} className={fieldClass}>
            <option value="">Acceso: todos</option>
            {estadoOptions.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
          <select value={estadoConexion} onChange={(e) => setEstadoConexion(e.target.value)} className={fieldClass}>
            <option value="">Conexion: todos</option>
            <option value="CONECTADO">Conectado</option>
            <option value="DESCONECTADO">Desconectado</option>
          </select>
        </div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {activeFiltersCount > 0
              ? `Filtros activos: ${activeFiltersCount}`
              : "Sin filtros activos"}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={String(pageSize)}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="25">25 / pag</option>
              <option value="50">50 / pag</option>
              <option value="100">100 / pag</option>
            </select>
            <button
              type="button"
              onClick={clearFilters}
              className="h-9 rounded-lg border border-slate-300 px-3 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Limpiar filtros
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">
                    <button type="button" onClick={() => toggleSort("usuario")} className="inline-flex items-center gap-1">
                      Usuario {sortKey === "usuario" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">Roles</th>
                  <th className="px-3 py-2 text-left font-semibold">Areas</th>
                  <th className="px-3 py-2 text-left font-semibold">
                    <button type="button" onClick={() => toggleSort("acceso")} className="inline-flex items-center gap-1">
                      Acceso {sortKey === "acceso" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">
                    <button type="button" onClick={() => toggleSort("conexion")} className="inline-flex items-center gap-1">
                      Conexion {sortKey === "conexion" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">
                    <button type="button" onClick={() => toggleSort("ultimaActividad")} className="inline-flex items-center gap-1">
                      Ultima actividad {sortKey === "ultimaActividad" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">Auditoria</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((r) => (
                  <tr key={r.uid} className="border-t border-slate-200 dark:border-slate-700">
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.nombre || r.uid}</div>
                      <div className="text-xs text-slate-500">{r.email || r.uid}</div>
                    </td>
                    <td className="px-3 py-2">{r.roles.join(", ") || "-"}</td>
                    <td className="px-3 py-2">{r.areas.join(", ") || "-"}</td>
                    <td className="px-3 py-2">{r.estadoAcceso || "-"}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.online
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                            : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        }`}
                      >
                        {r.online ? "Conectado" : "Desconectado"}
                      </span>
                    </td>
                    <td className="px-3 py-2">{asLocalDateTime(r.lastSeenAt)}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setAuditUidOpen(r.uid)}
                        className="inline-flex h-8 items-center rounded-lg border border-slate-300 px-3 text-xs font-medium transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                      >
                        Ver auditoria
                      </button>
                    </td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                      No hay usuarios para los filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="text-slate-500 dark:text-slate-400">
            Mostrando {(pageSafe - 1) * pageSize + (paged.length ? 1 : 0)}-{(pageSafe - 1) * pageSize + paged.length} de {filtered.length}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(1)}
              disabled={pageSafe <= 1}
              className="h-8 rounded border border-slate-300 px-2 disabled:opacity-50 dark:border-slate-700"
            >
              {"<<"}
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pageSafe <= 1}
              className="h-8 rounded border border-slate-300 px-2 disabled:opacity-50 dark:border-slate-700"
            >
              {"<"}
            </button>
            <span className="min-w-24 text-center text-xs text-slate-600 dark:text-slate-300">
              Pag {pageSafe} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={pageSafe >= totalPages}
              className="h-8 rounded border border-slate-300 px-2 disabled:opacity-50 dark:border-slate-700"
            >
              {">"}
            </button>
            <button
              type="button"
              onClick={() => setPage(totalPages)}
              disabled={pageSafe >= totalPages}
              className="h-8 rounded border border-slate-300 px-2 disabled:opacity-50 dark:border-slate-700"
            >
              {">>"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
