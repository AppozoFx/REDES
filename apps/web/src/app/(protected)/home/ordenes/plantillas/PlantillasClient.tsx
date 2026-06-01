"use client";

import * as XLSX from "xlsx";
import { useEffect, useMemo, useState } from "react";

type DuplicateGroup = {
  kind: "documento" | "nombres" | "telefono";
  normalizedValue: string;
  displayValue: string;
  count: number;
  cuadrillas: string[];
  pedidos: Array<{
    id: string;
    pedido: string;
    cliente: string;
    cuadrillaNombre: string;
    ymd: string;
  }>;
};

type PreliqRow = {
  id: string;
  pedido: string;
  cliente: string;
  cuadrillaId: string;
  cuadrillaNombre: string;
  coordinadorId?: string;
  coordinador?: string;
  ymd: string;
  fromId: string;
  contacto: {
    documento: string;
    nombres: string;
    telefono: string;
  };
  duplicates: {
    documento: boolean;
    nombres: boolean;
    telefono: boolean;
    any: boolean;
  };
};

type PendingCuadrilla = {
  cuadrillaId: string;
  cuadrillaNombre: string;
  coordinadorId: string;
  coordinador: string;
  total: number;
  pedidos: Array<{
    pedido: string;
    cliente: string;
    ymd: string;
    ordenId: string;
  }>;
};

type Payload = {
  scope: {
    ymd: string | null;
    month: string | null;
    isCoordinatorScope?: boolean;
    viewerCoordinatorUid?: string | null;
    viewerCoordinatorNombre?: string | null;
  };
  summary: {
    ordenesFinalizadas: number;
    preliquidaciones: number;
    preliquidacionesConDuplicado: number;
    duplicadosDocumento: number;
    duplicadosNombres: number;
    duplicadosTelefono: number;
    ordenesPendientesPreliq: number;
    cuadrillasPendientesPreliq: number;
  };
  duplicados: {
    documento: DuplicateGroup[];
    nombres: DuplicateGroup[];
    telefono: DuplicateGroup[];
  };
  pendientesByCuadrilla: PendingCuadrilla[];
  preliquidaciones: PreliqRow[];
};

type Tab = "pendientes" | "receptores" | "detalle";

function normalizeSearch(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function PlantillasClient({ initialYmd, initialMonth }: { initialYmd: string; initialMonth: string }) {
  const [month, setMonth] = useState(initialMonth);
  const [ymd, setYmd] = useState("");
  const [search, setSearch] = useState("");
  const [coordinador, setCoordinador] = useState("");
  const [dupFilter, setDupFilter] = useState("todas");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<Payload | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("pendientes");

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    async function run() {
      setLoading(true);
      setError("");
      try {
        const query = ymd ? `ymd=${encodeURIComponent(ymd)}` : `month=${encodeURIComponent(month)}`;
        const res = await fetch(`/api/ordenes/plantillas?${query}`, { cache: "no-store", signal: ctrl.signal });
        const body = await res.json();
        if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
        if (!cancelled) setData(body as Payload);
      } catch (e: any) {
        if (!cancelled) { setData(null); setError(String(e?.message || "ERROR")); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => { cancelled = true; ctrl.abort(); };
  }, [month, ymd]);

  useEffect(() => {
    if (!data?.scope?.isCoordinatorScope) return;
    const ownName = String(data.scope.viewerCoordinatorNombre || "").trim();
    if (ownName && coordinador !== ownName) setCoordinador(ownName);
  }, [data?.scope?.isCoordinatorScope, data?.scope?.viewerCoordinatorNombre, coordinador]);

  const searchNorm = useMemo(() => normalizeSearch(search), [search]);
  const isCoordinatorScope = !!data?.scope?.isCoordinatorScope;

  const coordinadores = useMemo(
    () => Array.from(new Set([
      ...(data?.pendientesByCuadrilla || []).map((r) => r.coordinador || "").filter(Boolean),
      ...(data?.preliquidaciones || []).map((r) => r.coordinador || "").filter(Boolean),
    ])).sort((a, b) => a.localeCompare(b)),
    [data?.pendientesByCuadrilla, data?.preliquidaciones]
  );

  const pendientesByCuadrilla = useMemo(() => {
    const rows = (data?.pendientesByCuadrilla || []).filter(
      (r) => !coordinador || (r.coordinador || "") === coordinador
    );
    if (!searchNorm) return rows;
    return rows.filter((r) => {
      const hay = normalizeSearch([r.cuadrillaNombre, r.cuadrillaId, r.coordinador || "", ...r.pedidos.flatMap((p) => [p.pedido, p.cliente, p.ymd])].join(" "));
      return hay.includes(searchNorm);
    });
  }, [data?.pendientesByCuadrilla, searchNorm, coordinador]);

  const preliquidaciones = useMemo(() => {
    const rows = (data?.preliquidaciones || []).filter((r) => {
      if (dupFilter === "duplicadas" && !r.duplicates.any) return false;
      if (dupFilter === "limpias" && r.duplicates.any) return false;
      if (coordinador && (r.coordinador || "") !== coordinador) return false;
      if (!searchNorm) return true;
      const hay = normalizeSearch([r.pedido, r.cliente, r.coordinador || "", r.cuadrillaNombre, r.cuadrillaId, r.contacto.documento, r.contacto.nombres, r.contacto.telefono, r.ymd].join(" "));
      return hay.includes(searchNorm);
    });
    return rows;
  }, [data?.preliquidaciones, dupFilter, searchNorm, coordinador]);

  const duplicateGroups = useMemo(() => {
    const groups = [
      ...(data?.duplicados.documento || []),
      ...(data?.duplicados.nombres || []),
      ...(data?.duplicados.telefono || []),
    ];
    if (!searchNorm) return groups;
    return groups.filter((g) => {
      const hay = normalizeSearch([g.displayValue, ...g.cuadrillas, ...g.pedidos.flatMap((p) => [p.pedido, p.cliente, p.cuadrillaNombre, p.ymd])].join(" "));
      return hay.includes(searchNorm);
    });
  }, [data?.duplicados, searchNorm]);

  const totalPendientesPedidos = useMemo(
    () => pendientesByCuadrilla.reduce((acc, r) => acc + r.total, 0),
    [pendientesByCuadrilla]
  );

  const totalDuplicados = (data?.summary.duplicadosDocumento || 0) + (data?.summary.duplicadosNombres || 0) + (data?.summary.duplicadosTelefono || 0);

  function downloadPendientesExcel() {
    if (!pendientesByCuadrilla.length) return;
    const rows = pendientesByCuadrilla.flatMap((r) =>
      r.pedidos.map((p) => ({ Cuadrilla: r.cuadrillaNombre || r.cuadrillaId || "SIN_CUADRILLA", Coordinador: r.coordinador || "", Pedido: p.pedido, Cliente: p.cliente || "", Fecha: p.ymd, Estado: "FALTA_ENVIAR_PLANTILLA" }))
    );
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pendientes");
    XLSX.writeFile(wb, `ordenes_plantillas_pendientes_${(ymd || month || initialYmd).replace(/[^0-9-]/g, "_")}.xlsx`);
  }

  const activeScope = ymd || month || initialYmd;

  const tabs: { id: Tab; label: string; count: number | null; tone: "rose" | "amber" | "slate" }[] = [
    { id: "pendientes", label: "Pendientes de plantilla", count: data ? data.summary.ordenesPendientesPreliq : null, tone: "rose" },
    { id: "receptores", label: "Receptores repetidos", count: data ? totalDuplicados : null, tone: "amber" },
    { id: "detalle", label: "Detalle preliquidaciones", count: data ? preliquidaciones.length : null, tone: "slate" },
  ];

  return (
    <div className="w-full space-y-0 pb-8">
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-30 space-y-0 bg-slate-50 dark:bg-slate-950 shadow-sm">
        {/* Title bar */}
        <div className="border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Plantillas · Instalaciones
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Controla que todas las instalaciones finalizadas hayan enviado su plantilla al grupo de Telegram.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {loading && (
                <span className="flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                  Cargando...
                </span>
              )}
              {!loading && data && (
                <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {activeScope}
                  {isCoordinatorScope ? ` · ${data.scope.viewerCoordinatorNombre || "-"}` : ""}
                </span>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Mes</label>
              <input
                type="month"
                value={month}
                onChange={(e) => { setMonth(e.target.value); if (ymd) setYmd(""); }}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Fecha exacta</label>
              <input
                type="date"
                value={ymd}
                max={initialYmd}
                onChange={(e) => setYmd(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1 min-w-48">
              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Buscar</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pedido, cliente, cuadrilla, documento..."
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-44">
              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Coordinador</label>
              <select
                value={coordinador}
                onChange={(e) => setCoordinador(e.target.value)}
                disabled={isCoordinatorScope}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950"
              >
                {!isCoordinatorScope && <option value="">Todos</option>}
                {coordinadores.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Summary metrics strip */}
        {data && (
          <div className="grid grid-cols-2 divide-x divide-slate-200 border-b border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900 sm:grid-cols-4">
            <StripMetric label="Finalizadas" value={data.summary.ordenesFinalizadas} tone="slate" />
            <StripMetric label="Pendientes plantilla" value={data.summary.ordenesPendientesPreliq} tone="rose" />
            <StripMetric label="Preliquidaciones" value={data.summary.preliquidaciones} tone="emerald" />
            <StripMetric label="Con duplicado" value={data.summary.preliquidacionesConDuplicado} tone="amber" />
          </div>
        )}

        {/* Tab bar */}
        <div className="flex border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            const countColor =
              tab.tone === "rose" ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
              : tab.tone === "amber" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
              : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  active
                    ? "text-[#30518c] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#30518c] dark:text-blue-400 dark:after:bg-blue-400"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                {tab.label}
                {tab.count !== null && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none ${countColor}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {/* ── Tab: Pendientes de plantilla ── */}
      {activeTab === "pendientes" && (
        <div className="p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Cuadrillas que faltan enviar plantilla
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Instalaciones finalizadas sin registro en Telegram. Incluye las liquidadas manualmente.
              </p>
            </div>
            <button
              type="button"
              onClick={downloadPendientesExcel}
              disabled={!pendientesByCuadrilla.length}
              className="flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-40 dark:border-rose-700 dark:bg-rose-950/20 dark:text-rose-300 dark:hover:bg-rose-950/40"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              Descargar Excel ({totalPendientesPedidos})
            </button>
          </div>

          {loading && <PendientesSkeleton />}

          {!loading && pendientesByCuadrilla.length === 0 && (
            <EmptyState
              icon="✓"
              title="Todo al dia"
              description="No hay cuadrillas con plantillas pendientes en el alcance seleccionado."
              tone="emerald"
            />
          )}

          {!loading && (
            <div className="space-y-3">
              {pendientesByCuadrilla.map((row) => (
                <div
                  key={`${row.cuadrillaId}-${row.cuadrillaNombre}`}
                  className="overflow-hidden rounded-xl border border-rose-200 bg-white shadow-sm dark:border-rose-800 dark:bg-slate-900"
                >
                  {/* Cuadrilla header */}
                  <div className="flex items-center justify-between gap-3 border-b border-rose-100 bg-rose-50/60 px-4 py-3 dark:border-rose-900/40 dark:bg-rose-950/20">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {row.cuadrillaNombre || row.cuadrillaId}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        Coordinador: {row.coordinador || "-"}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full border border-rose-300 bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700 dark:border-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                      {row.total} pendiente{row.total !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {/* Pedidos list */}
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {row.pedidos.map((pedido) => (
                      <div
                        key={`${row.cuadrillaId}-${pedido.ordenId}`}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5"
                      >
                        <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {pedido.pedido}
                        </span>
                        <span className="text-sm text-slate-600 dark:text-slate-300">{pedido.cliente || "-"}</span>
                        <span className="ml-auto rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                          {pedido.ymd}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Receptores repetidos ── */}
      {activeTab === "receptores" && (
        <div className="p-4 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Auditoria de receptores repetidos
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Detecta si el mismo DNI, nombre completo o telefono aparece en multiples instalaciones del periodo. Posible fraude.
            </p>
          </div>

          {/* Sub-metrics */}
          {data && (
            <div className="grid grid-cols-3 gap-3">
              <DupMetric label="DNI repetido" value={data.summary.duplicadosDocumento} icon="ID" />
              <DupMetric label="Nombre repetido" value={data.summary.duplicadosNombres} icon="NB" />
              <DupMetric label="Telefono repetido" value={data.summary.duplicadosTelefono} icon="TF" />
            </div>
          )}

          {loading && <PendientesSkeleton />}

          {!loading && duplicateGroups.length === 0 && (
            <EmptyState
              icon="✓"
              title="Sin repetidos"
              description="No se detectaron receptores con datos duplicados en el periodo seleccionado."
              tone="emerald"
            />
          )}

          {!loading && (
            <div className="space-y-3">
              {duplicateGroups.map((group) => {
                const kindStyle =
                  group.kind === "documento"
                    ? { badge: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-300", border: "border-blue-200 dark:border-blue-800", header: "bg-blue-50/50 dark:bg-blue-950/10", label: "DNI / Doc." }
                    : group.kind === "nombres"
                    ? { badge: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300", border: "border-amber-200 dark:border-amber-800", header: "bg-amber-50/50 dark:bg-amber-950/10", label: "Nombre" }
                    : { badge: "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-950/30 dark:text-purple-300", border: "border-purple-200 dark:border-purple-800", header: "bg-purple-50/50 dark:bg-purple-950/10", label: "Telefono" };

                return (
                  <div
                    key={`${group.kind}-${group.normalizedValue}`}
                    className={`overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-slate-900 ${kindStyle.border}`}
                  >
                    <div className={`flex flex-wrap items-center gap-3 px-4 py-3 ${kindStyle.header} border-b ${kindStyle.border}`}>
                      <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${kindStyle.badge}`}>
                        {kindStyle.label}
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{group.displayValue}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {group.count} coincidencias · {group.cuadrillas.join(", ")}
                      </span>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {group.pedidos.map((item) => (
                        <div key={`${group.kind}-${item.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                          <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">{item.pedido}</span>
                          <span className="text-sm text-slate-600 dark:text-slate-300">{item.cliente || "-"}</span>
                          <span className="text-xs text-slate-400 dark:text-slate-500">{item.cuadrillaNombre}</span>
                          <span className="ml-auto rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                            {item.ymd}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Detalle preliquidaciones ── */}
      {activeTab === "detalle" && (
        <div className="p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Detalle de preliquidaciones
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Registro de todas las plantillas enviadas al grupo de Telegram en el periodo.
              </p>
            </div>
            <select
              value={dupFilter}
              onChange={(e) => setDupFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950"
            >
              <option value="todas">Todas las preliquidaciones</option>
              <option value="duplicadas">Solo con duplicados</option>
              <option value="limpias">Solo limpias</option>
            </select>
          </div>

          {loading && <PendientesSkeleton />}

          {!loading && preliquidaciones.length === 0 && (
            <EmptyState
              icon="—"
              title="Sin resultados"
              description="No hay preliquidaciones que coincidan con los filtros actuales."
              tone="slate"
            />
          )}

          {!loading && (
            <div className="space-y-2">
              {preliquidaciones.map((row) => (
                <div
                  key={row.id}
                  className={`overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-slate-900 ${row.duplicates.any ? "border-amber-200 dark:border-amber-800" : "border-slate-200 dark:border-slate-700"}`}
                >
                  <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                    <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">{row.pedido}</span>
                    <span className="text-sm text-slate-600 dark:text-slate-300">{row.cliente || "-"}</span>
                    <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs text-sky-700 dark:border-sky-700 dark:bg-sky-950/20 dark:text-sky-300">
                      {row.coordinador || "-"}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {row.cuadrillaNombre || row.cuadrillaId || "SIN_CUADRILLA"}
                    </span>
                    <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">{row.ymd}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-px border-t border-slate-100 bg-slate-100 dark:border-slate-800 dark:bg-slate-800">
                    <ContactCell label="DNI / Doc." value={row.contacto.documento} flagged={row.duplicates.documento} />
                    <ContactCell label="Nombres" value={row.contacto.nombres} flagged={row.duplicates.nombres} />
                    <ContactCell label="Telefono" value={row.contacto.telefono} flagged={row.duplicates.telefono} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ── */

function StripMetric({ label, value, tone }: { label: string; value: number; tone: "slate" | "emerald" | "amber" | "rose" }) {
  const color =
    tone === "rose" ? "text-rose-600 dark:text-rose-400"
    : tone === "emerald" ? "text-emerald-600 dark:text-emerald-400"
    : tone === "amber" ? "text-amber-600 dark:text-amber-400"
    : "text-slate-700 dark:text-slate-200";
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</span>
      <span className={`text-2xl font-bold leading-none ${color}`}>{value}</span>
    </div>
  );
}

function DupMetric({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/10">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-xs font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
        {icon}
      </span>
      <div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400">{label}</div>
        <div className="text-xl font-bold text-amber-700 dark:text-amber-300">{value}</div>
      </div>
    </div>
  );
}

function ContactCell({ label, value, flagged }: { label: string; value: string; flagged: boolean }) {
  return (
    <div className={`px-3 py-2 ${flagged ? "bg-amber-50 dark:bg-amber-950/20" : "bg-white dark:bg-slate-900"}`}>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</span>
        {flagged && (
          <span className="rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            DUP
          </span>
        )}
      </div>
      <div className={`mt-0.5 text-sm font-medium ${flagged ? "text-amber-800 dark:text-amber-200" : "text-slate-800 dark:text-slate-100"}`}>
        {value || "-"}
      </div>
    </div>
  );
}

function EmptyState({ icon, title, description, tone }: { icon: string; title: string; description: string; tone: "emerald" | "slate" }) {
  const cls =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/10"
      : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40";
  const iconCls =
    tone === "emerald"
      ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400"
      : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400";
  return (
    <div className={`flex items-center gap-4 rounded-xl border px-5 py-4 ${cls}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold ${iconCls}`}>
        {icon}
      </span>
      <div>
        <div className="font-semibold text-slate-800 dark:text-slate-100">{title}</div>
        <div className="text-sm text-slate-500 dark:text-slate-400">{description}</div>
      </div>
    </div>
  );
}

function PendientesSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/30">
            <div className="space-y-1.5">
              <div className="h-4 w-36 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
              <div className="h-3 w-24 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            </div>
            <div className="h-6 w-20 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
          </div>
          {[1, 2].map((j) => (
            <div key={j} className="flex items-center gap-3 px-4 py-2.5">
              <div className="h-4 w-28 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              <div className="h-4 w-40 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              <div className="ml-auto h-5 w-24 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
