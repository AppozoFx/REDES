"use client";

import { useMemo, useState } from "react";

type SupervisorRow = {
  uid: string;
  nombre: string;
  nombreCorto: string;
  email: string;
  celular: string;
  roles: string[];
  areas: string[];
  estadoAcceso: string;
  configExists: boolean;
  area: "INSTALACIONES" | "MANTENIMIENTO";
  regionesHoy: string[];
  cuadrillasHoy: string[];
  vehiculoPlaca: string;
  vehiculoSoatVence: string;
  vehiculoRevTecVence: string;
};

type EditState = {
  vehiculoPlaca: string;
  vehiculoSoatVence: string;
  vehiculoRevTecVence: string;
};

function defaultEdit(row: SupervisorRow): EditState {
  return {
    vehiculoPlaca: row.vehiculoPlaca || "",
    vehiculoSoatVence: row.vehiculoSoatVence || "",
    vehiculoRevTecVence: row.vehiculoRevTecVence || "",
  };
}

function todayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
}

type DocStatus = "OK" | "WARNING" | "EXPIRED" | "NONE";

function docStatus(vence: string): DocStatus {
  if (!vence) return "NONE";
  const today = todayYmd();
  if (vence < today) return "EXPIRED";
  const diffDays = Math.round(
    (new Date(vence).getTime() - new Date(today).getTime()) / 86_400_000
  );
  if (diffDays <= 30) return "WARNING";
  return "OK";
}

function formatDate(ymd: string): string {
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return (parts[0] || "").slice(0, 2).toUpperCase();
  return `${(parts[0] || "")[0] || ""}${(parts[1] || "")[0] || ""}`.toUpperCase();
}

function DocBadge({ status, label, date }: { status: DocStatus; label: string; date: string }) {
  const styles: Record<DocStatus, string> = {
    OK: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/50",
    WARNING: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800/50",
    EXPIRED: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800/50",
    NONE: "bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700",
  };
  const icons: Record<DocStatus, string> = {
    OK: "✓",
    WARNING: "⚠",
    EXPIRED: "✕",
    NONE: "—",
  };
  return (
    <div className={`inline-flex flex-col items-center gap-0.5 rounded-xl px-3 py-2 ring-1 ${styles[status]}`}>
      <span className="text-[11px] font-medium opacity-70">{label}</span>
      <span className="text-sm font-semibold leading-tight">
        {icons[status]} {status === "NONE" ? "Sin dato" : formatDate(date)}
      </span>
    </div>
  );
}

export default function SupervisoresClient({ initialRows }: { initialRows: SupervisorRow[] }) {
  const [rows, setRows] = useState<SupervisorRow[]>(initialRows);
  const [q, setQ] = useState("");
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [form, setForm] = useState<EditState | null>(null);
  const [savingUid, setSavingUid] = useState<string | null>(null);
  const [error, setError] = useState("");

  const today = todayYmd();

  const metrics = useMemo(() => {
    const sinVehiculo = rows.filter((r) => !r.vehiculoPlaca).length;
    const alertas = rows.filter((r) => {
      const soat = docStatus(r.vehiculoSoatVence);
      const rev = docStatus(r.vehiculoRevTecVence);
      return soat === "EXPIRED" || soat === "WARNING" || rev === "EXPIRED" || rev === "WARNING";
    }).length;
    const sinRegion = rows.filter((r) => !r.regionesHoy.length).length;
    return { total: rows.length, sinVehiculo, alertas, sinRegion };
  }, [rows]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [row.nombre, row.nombreCorto, row.email, row.celular, row.uid].join(" ").toLowerCase().includes(term)
    );
  }, [rows, q]);

  const reload = async () => {
    const res = await fetch("/api/supervisores/list?area=INSTALACIONES", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok || !data?.ok) throw new Error(data?.error || "ERROR");
    setRows(Array.isArray(data.items) ? data.items : []);
  };

  const startEdit = (row: SupervisorRow) => {
    setError("");
    setEditingUid(row.uid);
    setForm(defaultEdit(row));
  };

  const cancelEdit = () => {
    setEditingUid(null);
    setForm(null);
    setError("");
  };

  const save = async (row: SupervisorRow) => {
    if (!form) return;
    setSavingUid(row.uid);
    setError("");
    try {
      const res = await fetch("/api/supervisores/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: row.uid,
          area: "INSTALACIONES",
          estado: "HABILITADO",
          almacenHabilitado: true,
          trackingHabilitado: true,
          sectoresIds: [],
          notas: "",
          vehiculoPlaca: form.vehiculoPlaca,
          vehiculoSoatVence: form.vehiculoSoatVence,
          vehiculoRevTecVence: form.vehiculoRevTecVence,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "ERROR");
      await reload();
      cancelEdit();
    } catch (e: any) {
      setError(e?.message || "No se pudo guardar.");
    } finally {
      setSavingUid(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Métricas */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Supervisores" value={metrics.total} />
        <MetricCard label="Sin vehículo" value={metrics.sinVehiculo} tone={metrics.sinVehiculo > 0 ? "amber" : "slate"} />
        <MetricCard label="Alertas doc." value={metrics.alertas} tone={metrics.alertas > 0 ? "rose" : "slate"} />
        <MetricCard label="Sin región" value={metrics.sinRegion} tone={metrics.sinRegion > 0 ? "amber" : "slate"} />
      </div>

      {/* Buscador */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar supervisor..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </div>
      )}

      {/* Lista de supervisores */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((row) => {
          const editing = editingUid === row.uid;
          const soatSt = docStatus(row.vehiculoSoatVence);
          const revSt = docStatus(row.vehiculoRevTecVence);
          const ini = initials(row.nombreCorto || row.nombre || row.uid);

          return (
            <div
              key={row.uid}
              className={`relative flex flex-col rounded-2xl border bg-white shadow-sm transition dark:bg-slate-900 ${
                editing
                  ? "border-blue-400 ring-2 ring-blue-400/25 dark:border-blue-500"
                  : "border-slate-200 hover:border-slate-300 dark:border-slate-700"
              }`}
            >
              {/* Header de la tarjeta */}
              <div className="flex items-start gap-3 p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#30518c]/10 text-sm font-bold text-[#30518c] dark:bg-[#30518c]/20 dark:text-blue-300">
                  {ini}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-slate-900 dark:text-slate-100">
                    {row.nombreCorto || row.nombre || row.uid}
                  </div>
                  <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {row.email || row.uid}
                  </div>
                  {row.celular && (
                    <div className="text-xs text-slate-500 dark:text-slate-400">{row.celular}</div>
                  )}
                </div>
                <AccessBadge estado={row.estadoAcceso} />
              </div>

              {/* Regiones + Cuadrillas hoy */}
              <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    Regiones hoy
                  </span>
                </div>
                {row.regionesHoy.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {row.regionesHoy.map((r, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center rounded-lg bg-[#30518c]/08 px-2 py-0.5 text-[11px] font-medium text-[#30518c] ring-1 ring-[#30518c]/20 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/40"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-slate-400 dark:text-slate-500">Sin regiones asignadas hoy</span>
                )}
              </div>

              {/* Cuadrillas hoy */}
              <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Cuadrillas hoy
                </div>
                {row.cuadrillasHoy.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {row.cuadrillasHoy.map((c, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center rounded-lg bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/50"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-slate-400 dark:text-slate-500">Sin cuadrillas asignadas hoy</span>
                )}
              </div>

              {/* Vehículo */}
              <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
                <div className="mb-2 flex items-center gap-2">
                  <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zm10 0a2 2 0 11-4 0 2 2 0 014 0zM1 9l2-5h14l2 5M1 9h18M1 9v5h18V9" />
                  </svg>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    Vehículo
                  </span>
                  {row.vehiculoPlaca ? (
                    <span className="ml-auto rounded-lg bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {row.vehiculoPlaca}
                    </span>
                  ) : (
                    <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">Sin registrar</span>
                  )}
                </div>

                {editing && form ? (
                  <div className="space-y-2">
                    <div>
                      <label className="mb-1 block text-[11px] text-slate-500">Placa</label>
                      <input
                        value={form.vehiculoPlaca}
                        onChange={(e) => setForm((p) => p ? { ...p, vehiculoPlaca: e.target.value.toUpperCase() } : p)}
                        placeholder="Ej: ABC-123"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-sm uppercase dark:border-slate-700 dark:bg-slate-950"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-[11px] text-slate-500">SOAT vence</label>
                        <input
                          type="date"
                          value={form.vehiculoSoatVence}
                          onChange={(e) => setForm((p) => p ? { ...p, vehiculoSoatVence: e.target.value } : p)}
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] text-slate-500">Rev. Técnica vence</label>
                        <input
                          type="date"
                          value={form.vehiculoRevTecVence}
                          onChange={(e) => setForm((p) => p ? { ...p, vehiculoRevTecVence: e.target.value } : p)}
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <DocBadge status={soatSt} label="SOAT" date={row.vehiculoSoatVence} />
                    <DocBadge status={revSt} label="Rev. Técnica" date={row.vehiculoRevTecVence} />
                  </div>
                )}
              </div>

              {/* Acciones */}
              <div className="mt-auto border-t border-slate-100 px-4 py-3 dark:border-slate-800">
                {editing ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => save(row)}
                      disabled={savingUid === row.uid}
                      className="flex-1 rounded-xl bg-[#30518c] py-2 text-sm font-medium text-white transition hover:bg-[#253f6e] disabled:opacity-60"
                    >
                      {savingUid === row.uid ? "Guardando…" : "Guardar"}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => startEdit(row)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-sm text-slate-600 transition hover:border-[#30518c]/40 hover:bg-[#30518c]/05 hover:text-[#30518c] dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Editar
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-slate-200 p-12 text-center text-sm text-slate-400 dark:border-slate-700 dark:text-slate-500">
            No hay supervisores con rol SUPERVISOR y área INSTALACIONES.
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "amber" | "rose" }) {
  const valueClass =
    tone === "rose"
      ? "text-rose-600 dark:text-rose-400"
      : tone === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : "text-slate-900 dark:text-slate-100";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${valueClass}`}>{value}</div>
    </div>
  );
}

function AccessBadge({ estado }: { estado: string }) {
  const ok = estado === "HABILITADO";
  return (
    <span
      className={`shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${
        ok
          ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/50"
          : "bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700"
      }`}
    >
      {ok ? "Activo" : "Inactivo"}
    </span>
  );
}
