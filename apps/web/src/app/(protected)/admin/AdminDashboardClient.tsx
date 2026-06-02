"use client";

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

function SortIcon({ col, sortKey, sortDir }: { col: string; sortKey: string; sortDir: "asc" | "desc" }) {
  const isActive = sortKey === col;
  return (
    <span className="ml-1 inline-flex flex-col gap-px">
      <svg className={`h-2.5 w-2.5 transition-colors ${isActive && sortDir === "asc" ? "text-blue-500" : "text-slate-300 dark:text-slate-600"}`} viewBox="0 0 8 5" fill="currentColor">
        <path d="M4 0L8 5H0z" />
      </svg>
      <svg className={`h-2.5 w-2.5 transition-colors ${isActive && sortDir === "desc" ? "text-blue-500" : "text-slate-300 dark:text-slate-600"}`} viewBox="0 0 8 5" fill="currentColor">
        <path d="M4 5L0 0h8z" />
      </svg>
    </span>
  );
}

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
  const isInhabilitado = String(estado || "").toUpperCase() === "INHABILITADO";
  if (isInhabilitado) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:border-rose-800/60 dark:bg-rose-900/30 dark:text-rose-300">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500 dark:bg-rose-400" />
        Inhabilitado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-300">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
      Habilitado
    </span>
  );
}

function OnlineBadge({ online }: { online: boolean }) {
  if (online) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-300">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </span>
        Conectado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:border-slate-700/60 dark:bg-slate-800 dark:text-slate-400">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
      Desconectado
    </span>
  );
}

const selectClass =
  "h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white py-0 pl-3 pr-8 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-blue-900/40 cursor-pointer";

const ChevronDown = () => (
  <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

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
  const [liveRows, setLiveRows] = useState<Row[]>(rows);
  const [liveGeneratedAt, setLiveGeneratedAt] = useState<string>(generatedAt);

  useEffect(() => {
    setLiveRows(rows);
    setLiveGeneratedAt(generatedAt);
  }, [rows, generatedAt]);

  useEffect(() => {
    if (!rows.length) return;
    let alive = true;
    let inFlight = false;
    const uids = Array.from(new Set(rows.map((r) => String(r.uid || "").trim()).filter(Boolean)));

    const pullPresence = async () => {
      if (!alive || inFlight) return;
      inFlight = true;
      try {
        const res = await fetch("/api/admin/presencia/snapshot", {
          method: "POST",
          headers: { "content-type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ uids }),
        });
        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; generatedAt?: string; data?: Array<{ uid: string; online: boolean; lastSeenAt: string | null }> }
          | null;
        if (!alive || !res.ok || !json?.ok || !Array.isArray(json.data)) return;

        const byUid = new Map(json.data.map((x) => [String(x.uid || ""), x]));
        setLiveRows((prev) =>
          prev.map((r) => {
            const next = byUid.get(r.uid);
            if (!next) return r;
            if (r.online === next.online && r.lastSeenAt === next.lastSeenAt) return r;
            return { ...r, online: !!next.online, lastSeenAt: next.lastSeenAt || null };
          })
        );
        if (json.generatedAt) setLiveGeneratedAt(String(json.generatedAt));
      } catch {}
      inFlight = false;
    };

    pullPresence();
    const timer = window.setInterval(pullPresence, 20_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [rows]);

  const roleOptions = useMemo(
    () =>
      Array.from(new Set(liveRows.flatMap((r) => r.roles).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "es", { sensitivity: "base" })
      ),
    [liveRows]
  );
  const areaOptions = useMemo(
    () =>
      Array.from(new Set(liveRows.flatMap((r) => r.areas).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "es", { sensitivity: "base" })
      ),
    [liveRows]
  );
  const estadoOptions = useMemo(
    () =>
      Array.from(new Set(liveRows.map((r) => String(r.estadoAcceso || "").trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "es", { sensitivity: "base" })
      ),
    [liveRows]
  );

  useEffect(() => {
    setPage(1);
  }, [q, rol, area, estadoAcceso, estadoConexion, pageSize]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = liveRows.filter((r) => {
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
  }, [liveRows, q, rol, area, estadoAcceso, estadoConexion, sortKey, sortDir]);

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
    const total = liveRows.length;
    const conectados = liveRows.filter((r) => r.online).length;
    const desconectados = total - conectados;
    const inhabilitados = liveRows.filter((r) => String(r.estadoAcceso || "").toUpperCase() === "INHABILITADO").length;
    return { total, conectados, desconectados, inhabilitados };
  }, [liveRows]);

  const userNameByUid = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of liveRows) map.set(r.uid, r.nombre || r.uid);
    return map;
  }, [liveRows]);

  const selectedAudit = auditUidOpen ? auditByUser[auditUidOpen] || [] : [];
  const selectedName = auditUidOpen ? userNameByUid.get(auditUidOpen) || auditUidOpen : "";

  function getPageNumbers(): (number | "...")[] {
    const delta = 2;
    const range: number[] = [];
    for (let i = Math.max(1, pageSafe - delta); i <= Math.min(totalPages, pageSafe + delta); i++) {
      range.push(i);
    }
    const result: (number | "...")[] = [];
    if (range[0] > 1) {
      result.push(1);
      if (range[0] > 2) result.push("...");
    }
    result.push(...range);
    if (range[range.length - 1] < totalPages) {
      if (range[range.length - 1] < totalPages - 1) result.push("...");
      result.push(totalPages);
    }
    return result;
  }

  return (
    <div className="space-y-5 text-slate-900 dark:text-slate-100">

      {/* ── Header ── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#30518c] shadow-[0_8px_20px_rgba(48,81,140,.3)]">
            <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Panel Administrativo</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Usuarios y conectividad · Act. {asLocalDateTime(liveGeneratedAt)}
            </p>
          </div>
        </div>
        <span className="self-start rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 sm:self-auto">
          {liveRows.length} usuarios en total
        </span>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-start justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Total usuarios</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
              <svg className="h-4 w-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
          </div>
          <p className="mt-2 text-3xl font-bold tracking-tight">{kpi.total}</p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm dark:border-emerald-800 dark:from-emerald-900/20 dark:to-slate-900">
          <div className="flex items-start justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Conectados</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/40">
              <svg className="h-4 w-4 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                <path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" />
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" />
              </svg>
            </div>
          </div>
          <p className="mt-2 text-3xl font-bold tracking-tight text-emerald-700 dark:text-emerald-300">{kpi.conectados}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-start justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Desconectados</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
              <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
                <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
                <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
                <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" />
              </svg>
            </div>
          </div>
          <p className="mt-2 text-3xl font-bold tracking-tight">{kpi.desconectados}</p>
        </div>

        <div className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white p-4 shadow-sm dark:border-rose-800 dark:from-rose-900/20 dark:to-slate-900">
          <div className="flex items-start justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-rose-600 dark:text-rose-400">Inhabilitados</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-100 dark:bg-rose-900/40">
              <svg className="h-4 w-4 text-rose-600 dark:text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                <circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
              </svg>
            </div>
          </div>
          <p className="mt-2 text-3xl font-bold tracking-tight text-rose-700 dark:text-rose-300">{kpi.inhabilitados}</p>
        </div>
      </div>

      {/* ── Audit Modal ── */}
      {auditUidOpen ? (
        <div
          className="fixed inset-0 z-[180] flex items-start justify-center bg-black/50 p-4 pt-16 backdrop-blur-sm"
          onClick={() => setAuditUidOpen(null)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100">Auditoría de usuario</h3>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{selectedName}</p>
              </div>
              <div className="flex items-center gap-2">
                {selectedAudit.length > 0 && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    {selectedAudit.length} eventos
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setAuditUidOpen(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="max-h-[55vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Fecha</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Acción</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Actor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                  {selectedAudit.map((x) => (
                    <tr key={x.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">{asLocalDateTime(x.at)}</td>
                      <td className="px-4 py-2.5 font-medium">{x.action}</td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{x.actorNombre}</td>
                    </tr>
                  ))}
                  {!selectedAudit.length && (
                    <tr>
                      <td colSpan={3} className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                        No hay eventos de auditoría para este usuario.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Tabla de usuarios ── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">

        {/* Filtros */}
        <div className="border-b border-slate-100 p-4 dark:border-slate-700">
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-5">
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar nombre / email / uid"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white py-0 pl-9 pr-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-blue-900/40"
              />
            </div>

            <div className="relative">
              <select value={rol} onChange={(e) => setRol(e.target.value)} className={selectClass}>
                <option value="">Rol: todos</option>
                {roleOptions.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center"><ChevronDown /></div>
            </div>

            <div className="relative">
              <select value={area} onChange={(e) => setArea(e.target.value)} className={selectClass}>
                <option value="">Área: todas</option>
                {areaOptions.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center"><ChevronDown /></div>
            </div>

            <div className="relative">
              <select value={estadoAcceso} onChange={(e) => setEstadoAcceso(e.target.value)} className={selectClass}>
                <option value="">Acceso: todos</option>
                {estadoOptions.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center"><ChevronDown /></div>
            </div>

            <div className="relative">
              <select value={estadoConexion} onChange={(e) => setEstadoConexion(e.target.value)} className={selectClass}>
                <option value="">Conexión: todos</option>
                <option value="CONECTADO">Conectado</option>
                <option value="DESCONECTADO">Desconectado</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center"><ChevronDown /></div>
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs">
              {activeFiltersCount > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <polyline points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                  </svg>
                  {activeFiltersCount} filtro{activeFiltersCount !== 1 ? "s" : ""} activo{activeFiltersCount !== 1 ? "s" : ""}
                </span>
              ) : (
                <span className="text-slate-400 dark:text-slate-500">Sin filtros activos</span>
              )}
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <span className="text-slate-500 dark:text-slate-400">{filtered.length} resultado{filtered.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={String(pageSize)}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="25">25 / pág</option>
                <option value="50">50 / pág</option>
                <option value="100">100 / pág</option>
              </select>
              <button
                type="button"
                onClick={clearFilters}
                className="h-8 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                disabled={activeFiltersCount === 0}
              >
                Limpiar filtros
              </button>
            </div>
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-hidden">
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <button type="button" onClick={() => toggleSort("usuario")} className="inline-flex items-center text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
                      Usuario <SortIcon col="usuario" sortKey={sortKey} sortDir={sortDir} />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Roles</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Áreas</th>
                  <th className="px-4 py-3 text-left">
                    <button type="button" onClick={() => toggleSort("acceso")} className="inline-flex items-center text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
                      Acceso <SortIcon col="acceso" sortKey={sortKey} sortDir={sortDir} />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button type="button" onClick={() => toggleSort("conexion")} className="inline-flex items-center text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
                      Conexión <SortIcon col="conexion" sortKey={sortKey} sortDir={sortDir} />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button type="button" onClick={() => toggleSort("ultimaActividad")} className="inline-flex items-center text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
                      Últ. actividad <SortIcon col="ultimaActividad" sortKey={sortKey} sortDir={sortDir} />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Auditoría</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {paged.map((r, i) => (
                  <tr
                    key={r.uid}
                    className={`transition-colors hover:bg-blue-50/50 dark:hover:bg-blue-900/10 ${
                      i % 2 !== 0 ? "bg-slate-50/50 dark:bg-slate-800/20" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#30518c]/10 text-[11px] font-bold text-[#30518c] dark:bg-[#30518c]/20 dark:text-[#7b9dd4]">
                          {(r.nombre || r.uid).slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-900 dark:text-slate-100">{r.nombre || r.uid}</div>
                          <div className="truncate text-xs text-slate-400 dark:text-slate-500">{r.email || r.uid}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {r.roles.length ? r.roles.map((role) => <RoleChip key={role} role={role} />) : <span className="text-xs text-slate-400">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {r.areas.length ? r.areas.map((a) => <AreaChip key={a} area={a} />) : <span className="text-xs text-slate-400">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <AccessBadge estado={r.estadoAcceso} />
                    </td>
                    <td className="px-4 py-3">
                      <OnlineBadge online={r.online} />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                      {asLocalDateTime(r.lastSeenAt)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setAuditUidOpen(r.uid)}
                        className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                        </svg>
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center gap-2 text-slate-400 dark:text-slate-500">
                        <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <p className="text-sm">No hay usuarios para los filtros seleccionados.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Paginación */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 dark:border-slate-700">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {filtered.length > 0
              ? `${(pageSafe - 1) * pageSize + 1}–${(pageSafe - 1) * pageSize + paged.length} de ${filtered.length}`
              : "0 resultados"}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage(1)}
              disabled={pageSafe <= 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <polyline points="11 17 6 12 11 7" /><polyline points="18 17 13 12 18 7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pageSafe <= 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>

            {getPageNumbers().map((p, i) =>
              p === "..." ? (
                <span key={`ellipsis-${i}`} className="flex h-8 w-8 items-center justify-center text-xs text-slate-400">…</span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(Number(p))}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition ${
                    pageSafe === p
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
              disabled={pageSafe >= totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setPage(totalPages)}
              disabled={pageSafe >= totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <polyline points="13 17 18 12 13 7" /><polyline points="6 17 11 12 6 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
