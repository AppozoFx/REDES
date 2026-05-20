"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import {
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const COLORS = ["#30518c", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#8b5cf6"];
const POWER_BI_GARANTIAS_URL =
  "https://app.powerbi.com/view?r=eyJrIjoiMzRjNGUzMzEtNGEzOC00M2M3LWFmNzItOTg4NDIzNTVhODNiIiwidCI6ImY2YTA3ODJkLWYxOWQtNGQ1OC1hZjYyLTUyMDIyNDZmZjQxYyIsImMiOjR9";

type Resp = {
  ok: true;
  ym: string;
  filters: {
    garantiaFrom: string;
    garantiaTo: string;
    instFrom: string;
    instTo: string;
    cuadrilla: string;
    coordinadorUid: string;
  };
  kpi: {
    total: number;
    finalizadas: number;
    canceladas: number;
    pendientes: number;
    recurrentes: number;
    casosRecurrentes: number;
    reincidenciaPct: number;
    diasPromedio: number;
    cuadrillasAfectadas: number;
    coordinadoresAfectados: number;
  };
  series: {
    byDay: Array<{ ymd: string; total: number; finalizadas: number; canceladas: number; recurrentes: number }>;
    byEstado: Array<{ estado: string; total: number }>;
    byCoordinador: Array<{ uid: string; nombre: string; total: number; recurrentes: number; tasaReincidenciaPct: number }>;
    byCuadrilla: Array<{
      cuadrilla: string;
      total: number;
      recurrentes: number;
      tasaReincidenciaPct: number;
      finalizadas: number;
      canceladas: number;
      diasPromedio: number;
      motivoPrincipal: string;
    }>;
    byMotivo: Array<{ label: string; total: number; recurrentes: number; tasaReincidenciaPct: number }>;
  };
  detail: {
    items: Array<{
      id: string;
      ordenId: string;
      fechaGarantiaYmd: string;
      cliente: string;
      codigoCliente: string;
      cuadrilla: string;
      estado: string;
      coordinadorUid: string;
      coordinadorNombre: string;
      motivo: string;
      responsable: string;
      imputado: string;
      fechaInstalacionBase: string;
      diasDesdeInstalacion: number | null;
      recurrente: boolean;
      recurrenciaCantidad: number;
    }>;
    recientes: Array<{
      id: string;
      ordenId: string;
      fechaGarantiaYmd: string;
      cliente: string;
      codigoCliente: string;
      cuadrilla: string;
      estado: string;
      coordinadorNombre: string;
      motivo: string;
      responsable: string;
      imputado: string;
      fechaInstalacionBase: string;
      diasDesdeInstalacion: number | null;
      recurrente: boolean;
      recurrenciaCantidad: number;
    }>;
  };
  options: {
    cuadrillas: Array<{ label: string; total: number }>;
    coordinadores: Array<{ uid: string; nombre: string; total: number }>;
  };
};

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function todayLimaYm() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function monthStartYmd() {
  return `${todayLimaYm()}-01`;
}

function formatYmdPretty(ymd: string) {
  const v = String(ymd || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "-";
  return v.split("-").reverse().join("/");
}

function formatNum(n: number) {
  return new Intl.NumberFormat("es-PE", { maximumFractionDigits: 1 }).format(Number(n || 0));
}

function StatCard({
  title,
  value,
  hint,
  tone = "slate",
}: {
  title: string;
  value: string | number;
  hint?: string;
  tone?: "slate" | "blue" | "emerald" | "amber" | "rose";
}) {
  const toneClass =
    tone === "blue"
      ? "from-[#eff4ff] to-[#dde8ff] text-[#1f3154] ring-[#bfd1f1]"
      : tone === "emerald"
      ? "from-emerald-50 to-emerald-100 text-emerald-950 ring-emerald-200"
      : tone === "amber"
      ? "from-amber-50 to-amber-100 text-amber-950 ring-amber-200"
      : tone === "rose"
      ? "from-rose-50 to-rose-100 text-rose-950 ring-rose-200"
      : "from-slate-50 to-slate-100 text-slate-950 ring-slate-200";
  return (
    <div className={`rounded-[1.4rem] border bg-gradient-to-br p-3.5 shadow-sm ring-1 ${toneClass}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight md:text-3xl">{value}</div>
      {hint ? <div className="mt-1.5 text-[11px] text-slate-500">{hint}</div> : null}
    </div>
  );
}

function PanelCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[1.8rem] border border-slate-200/80 bg-white shadow-[0_16px_40px_rgba(15,23,42,.05)]">
      <div className="border-b border-slate-200/80 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex h-full min-h-[14rem] items-center justify-center rounded-[1.6rem] border border-dashed border-slate-300 bg-slate-50/80 px-6 text-center">
      <div>
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <div className="mt-1 text-sm text-slate-500">{description}</div>
      </div>
    </div>
  );
}

function initialFilters() {
  return {
    garantiaFrom: monthStartYmd(),
    garantiaTo: todayLimaYmd(),
    instFrom: "",
    instTo: "",
    cuadrilla: "",
    coordinadorUid: "",
  };
}

export default function GarantiasDashboardClient() {
  const [filters, setFilters] = useState(initialFilters);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    async function load() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          ym: (filters.garantiaFrom || todayLimaYmd()).slice(0, 7),
          garantiaFrom: filters.garantiaFrom,
          garantiaTo: filters.garantiaTo,
        });
        if (filters.instFrom) params.set("instFrom", filters.instFrom);
        if (filters.instTo) params.set("instTo", filters.instTo);
        if (filters.cuadrilla) params.set("cuadrilla", filters.cuadrilla);
        if (filters.coordinadorUid) params.set("coordinadorUid", filters.coordinadorUid);

        const res = await fetch(`/api/ordenes/garantias/dashboard?${params.toString()}`, {
          cache: "no-store",
          signal: ctrl.signal,
        });
        const json = await res.json();
        if (!res.ok || !json?.ok) throw new Error(String(json?.error || "ERROR"));
        if (!cancelled) setData(json);
      } catch (e: any) {
        if (!cancelled) {
          setData(null);
          setError(String(e?.message || "ERROR"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [filters.garantiaFrom, filters.garantiaTo, filters.instFrom, filters.instTo, filters.cuadrilla, filters.coordinadorUid]);

  const statusData = useMemo(() => {
    return (data?.series.byEstado || []).map((item, index) => ({
      ...item,
      fill: COLORS[index % COLORS.length],
    }));
  }, [data]);

  const cuadrillaChart = useMemo(() => {
    return (data?.series.byCuadrilla || []).slice(0, 8).map((item) => ({
      ...item,
      noRecurrentes: Math.max(0, item.total - item.recurrentes),
    }));
  }, [data]);

  const topCuadrilla = data?.series.byCuadrilla?.[0];
  const topCoordinador = data?.series.byCoordinador?.[0];
  const topMotivo = data?.series.byMotivo?.[0];
  const filterSummary = useMemo(() => {
    const pieces = [`Garantia ${formatYmdPretty(filters.garantiaFrom)} - ${formatYmdPretty(filters.garantiaTo)}`];
    if (filters.instFrom || filters.instTo) {
      pieces.push(
        `Instalacion ${filters.instFrom ? formatYmdPretty(filters.instFrom) : "..."} - ${filters.instTo ? formatYmdPretty(filters.instTo) : "..."}`
      );
    }
    if (filters.cuadrilla) pieces.push(`Cuadrilla ${filters.cuadrilla}`);
    if (filters.coordinadorUid) {
      const coordName = data?.options.coordinadores.find((x) => x.uid === filters.coordinadorUid)?.nombre || filters.coordinadorUid;
      pieces.push(`Coordinador ${coordName}`);
    }
    return pieces.join(" | ");
  }, [data?.options.coordinadores, filters.cuadrilla, filters.coordinadorUid, filters.garantiaFrom, filters.garantiaTo, filters.instFrom, filters.instTo]);

  function resetFilters() {
    setFilters(initialFilters());
  }

  async function exportExcel() {
    if (!data) return;
    setExporting(true);
    try {
      const wb = XLSX.utils.book_new();
      const dashboardRows = [
        ["Dashboard de Garantias"],
        [""],
        ["KPI", "Valor"],
        ["Total garantias", data.kpi.total],
        ["Reincidencias", data.kpi.casosRecurrentes],
        ["Tasa reincidencia %", data.kpi.reincidenciaPct],
        ["Cuadrillas afectadas", data.kpi.cuadrillasAfectadas],
        ["Coordinadores afectados", data.kpi.coordinadoresAfectados],
        ["Finalizadas", data.kpi.finalizadas],
        ["Canceladas", data.kpi.canceladas],
        ["Pendientes", data.kpi.pendientes],
        ["Dias promedio", data.kpi.diasPromedio],
        [""],
        ["Top Cuadrillas"],
        ["Cuadrilla", "Total", "Recurrentes", "Tasa %", "Motivo principal"],
        ...data.series.byCuadrilla.slice(0, 10).map((row) => [
          row.cuadrilla,
          row.total,
          row.recurrentes,
          row.tasaReincidenciaPct,
          row.motivoPrincipal,
        ]),
        [""],
        ["Top Coordinadores"],
        ["Coordinador", "Total", "Recurrentes", "Tasa %"],
        ...data.series.byCoordinador.slice(0, 10).map((row) => [row.nombre, row.total, row.recurrentes, row.tasaReincidenciaPct]),
        [""],
        ["Top Motivos"],
        ["Motivo", "Total", "Recurrentes", "Tasa %"],
        ...data.series.byMotivo.slice(0, 10).map((row) => [row.label, row.total, row.recurrentes, row.tasaReincidenciaPct]),
      ];
      const dashboardSheet = XLSX.utils.aoa_to_sheet(dashboardRows);
      dashboardSheet["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 38 }];
      XLSX.utils.book_append_sheet(wb, dashboardSheet, "Dashboard");

      const summaryRows = [
        { metric: "Total garantias", value: data.kpi.total },
        { metric: "Reincidencias", value: data.kpi.casosRecurrentes },
        { metric: "Tasa reincidencia", value: data.kpi.reincidenciaPct },
        { metric: "Cuadrillas afectadas", value: data.kpi.cuadrillasAfectadas },
        { metric: "Coordinadores afectados", value: data.kpi.coordinadoresAfectados },
        { metric: "Finalizadas", value: data.kpi.finalizadas },
        { metric: "Canceladas", value: data.kpi.canceladas },
        { metric: "Pendientes", value: data.kpi.pendientes },
        { metric: "Dias promedio", value: data.kpi.diasPromedio },
        { metric: "Filtro garantia desde", value: data.filters.garantiaFrom },
        { metric: "Filtro garantia hasta", value: data.filters.garantiaTo },
        { metric: "Filtro instalacion desde", value: data.filters.instFrom || "" },
        { metric: "Filtro instalacion hasta", value: data.filters.instTo || "" },
        { metric: "Filtro cuadrilla", value: data.filters.cuadrilla || "" },
        { metric: "Filtro coordinador", value: data.filters.coordinadorUid || "" },
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Resumen");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.series.byCuadrilla), "Cuadrillas");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.series.byCoordinador), "Coordinadores");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.series.byMotivo), "Motivos");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.series.byEstado), "Estados");
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(data.detail.recientes.map((row) => ({
          ...row,
          fechaGarantiaYmd: formatYmdPretty(row.fechaGarantiaYmd),
          fechaInstalacionBase: formatYmdPretty(row.fechaInstalacionBase),
        }))),
        "Recientes"
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(data.detail.items.map((row) => ({
          ...row,
          fechaGarantiaYmd: formatYmdPretty(row.fechaGarantiaYmd),
          fechaInstalacionBase: formatYmdPretty(row.fechaInstalacionBase),
        }))),
        "Datos"
      );
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.series.byDay), "PorDia");
      const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      saveAs(new Blob([out], { type: "application/octet-stream" }), `garantias_dashboard_${data.filters.garantiaFrom}_a_${data.filters.garantiaTo}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[2rem] border border-slate-200/70 bg-slate-950 text-white shadow-[0_24px_70px_rgba(15,23,42,.18)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(48,81,140,.55),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,.18),transparent_28%),linear-gradient(135deg,#0f172a_0%,#1e293b_48%,#0f172a_100%)]" />
        <div className="absolute inset-0 opacity-20 bg-[linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] bg-[size:32px_32px]" />
        <div className="relative grid gap-6 p-6 lg:grid-cols-[1.15fr_.85fr] lg:p-8">
          <div className="space-y-4">
            <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-200">
              Garantias
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">Dashboard de garantias</h1>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300 md:text-base">
                Revisa reincidencia por cuadrilla, motivos mas repetidos y antiguedad de la instalacion base.
                La fecha de garantia es el eje principal; la fecha de instalacion te ayuda a entender el origen
                del caso.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-slate-200">
                {filterSummary}
              </span>
              {data ? (
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-slate-200">
                  {formatNum(data.kpi.total)} garantias
                </span>
              ) : null}
            </div>
          </div>

          <div className="rounded-[1.7rem] border border-white/15 bg-white/10 p-4 backdrop-blur">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-medium text-slate-200">
                <span>Fecha garantia desde</span>
                <input
                  type="date"
                  value={filters.garantiaFrom}
                  onChange={(e) => setFilters((prev) => ({ ...prev, garantiaFrom: e.target.value }))}
                  className="w-full rounded-xl border border-white/15 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none ring-0 placeholder:text-slate-400 focus:border-white/30"
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-200">
                <span>Fecha garantia hasta</span>
                <input
                  type="date"
                  value={filters.garantiaTo}
                  onChange={(e) => setFilters((prev) => ({ ...prev, garantiaTo: e.target.value }))}
                  className="w-full rounded-xl border border-white/15 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none ring-0 placeholder:text-slate-400 focus:border-white/30"
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-200">
                <span>Fecha instalacion desde</span>
                <input
                  type="date"
                  value={filters.instFrom}
                  onChange={(e) => setFilters((prev) => ({ ...prev, instFrom: e.target.value }))}
                  className="w-full rounded-xl border border-white/15 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none ring-0 placeholder:text-slate-400 focus:border-white/30"
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-200">
                <span>Fecha instalacion hasta</span>
                <input
                  type="date"
                  value={filters.instTo}
                  onChange={(e) => setFilters((prev) => ({ ...prev, instTo: e.target.value }))}
                  className="w-full rounded-xl border border-white/15 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none ring-0 placeholder:text-slate-400 focus:border-white/30"
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-200">
                <span>Cuadrilla</span>
                <select
                  value={filters.cuadrilla}
                  onChange={(e) => setFilters((prev) => ({ ...prev, cuadrilla: e.target.value }))}
                  className="w-full rounded-xl border border-white/15 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none ring-0 focus:border-white/30"
                >
                  <option value="">Todas</option>
                  {(data?.options.cuadrillas || []).map((item) => (
                    <option key={item.label} value={item.label}>
                      {item.label} ({item.total})
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-200">
                <span>Coordinador</span>
                <select
                  value={filters.coordinadorUid}
                  onChange={(e) => setFilters((prev) => ({ ...prev, coordinadorUid: e.target.value }))}
                  className="w-full rounded-xl border border-white/15 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none ring-0 focus:border-white/30"
                >
                  <option value="">Todos</option>
                  {(data?.options.coordinadores || []).map((item) => (
                    <option key={item.uid} value={item.uid}>
                      {item.nombre} ({item.total})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15"
              >
                Limpiar filtros
              </button>
              <button
                type="button"
                onClick={exportExcel}
                disabled={!data || exporting}
                className="rounded-full border border-white/15 bg-white px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {exporting ? "Exportando..." : "Exportar Excel"}
              </button>
              <a
                href={POWER_BI_GARANTIAS_URL}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/15"
              >
                Abrir Power BI
              </a>
              <div className="text-xs text-slate-300">El dashboard se actualiza al cambiar las fechas.</div>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
          Cargando dashboard de garantias...
        </div>
      ) : null}

      {data ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <StatCard title="Total garantias" value={data.kpi.total} tone="blue" />
            <StatCard title="Reincidencias" value={data.kpi.casosRecurrentes} tone="amber" hint="Grupos con 2 o mas garantias" />
            <StatCard
              title="Tasa de reincidencia"
              value={`${data.kpi.reincidenciaPct}%`}
              tone="rose"
              hint={`${data.kpi.recurrentes} garantias recurrentes`}
            />
            <StatCard title="Cuadrillas afectadas" value={data.kpi.cuadrillasAfectadas} tone="emerald" />
            <StatCard title="Coordinadores afectados" value={data.kpi.coordinadoresAfectados} />
            <StatCard title="Finalizadas" value={data.kpi.finalizadas} />
            <StatCard title="Dias promedio" value={data.kpi.diasPromedio} hint="Desde la instalacion base" />
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <StatCard
              title="Cuadrilla mas afectada"
              value={topCuadrilla?.cuadrilla || "-"}
              tone="blue"
              hint={topCuadrilla ? `${topCuadrilla.recurrentes} recurrentes | ${topCuadrilla.tasaReincidenciaPct}% de reincidencia` : "Sin datos"}
            />
            <StatCard
              title="Motivo dominante"
              value={topMotivo?.label || "-"}
              tone="amber"
              hint={topMotivo ? `${topMotivo.total} casos | ${topMotivo.recurrentes} recurrentes` : "Sin datos"}
            />
            <StatCard
              title="Coordinador principal"
              value={topCoordinador?.nombre || "-"}
              tone="emerald"
              hint={topCoordinador ? `${topCoordinador.total} casos | ${topCoordinador.tasaReincidenciaPct}% reincidencia` : "Sin datos"}
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <PanelCard title="Garantias por dia" subtitle="Comparacion entre volumen total y casos recurrentes">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.series.byDay}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="ymd" tick={{ fontSize: 11 }} tickFormatter={formatYmdPretty} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="total" fill="#30518c" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="recurrentes" fill="#f59e0b" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </PanelCard>

            <PanelCard title="Estados" subtitle="Distribucion general de los casos filtrados">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusData} dataKey="total" nameKey="estado" outerRadius={110} innerRadius={68} paddingAngle={2}>
                      {statusData.map((entry) => (
                        <Cell key={entry.estado} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {statusData.map((item) => (
                  <span key={item.estado} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.fill }} />
                    {item.estado}: {item.total}
                  </span>
                ))}
              </div>
            </PanelCard>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
            <PanelCard title="Reincidencia por cuadrilla" subtitle="Ordenado por cantidad de casos recurrentes">
              {cuadrillaChart.length ? (
                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cuadrillaChart} layout="vertical" margin={{ left: 12, right: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="cuadrilla" width={120} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="noRecurrentes" stackId="a" fill="#dbeafe" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="recurrentes" stackId="a" fill="#30518c" radius={[0, 10, 10, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState title="Sin datos de cuadrillas" description="Ajusta el rango de fechas para ver reincidencias por cuadrilla." />
              )}
            </PanelCard>

            <PanelCard title="Motivos principales" subtitle="Los motivos que mas se repiten dentro del rango">
              {data.series.byMotivo.length ? (
                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.series.byMotivo} layout="vertical" margin={{ left: 12, right: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="label" width={120} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="total" fill="#f59e0b" radius={[0, 10, 10, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState title="Sin motivos" description="No hay registros que mostrar para este filtro." />
              )}
            </PanelCard>
          </section>

          <PanelCard title="Top coordinadores" subtitle="Quien concentra mas volumen y reincidencia dentro del rango">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Coordinador</th>
                    <th className="px-3 py-2 text-left font-semibold">Total</th>
                    <th className="px-3 py-2 text-left font-semibold">Recurrentes</th>
                    <th className="px-3 py-2 text-left font-semibold">Tasa</th>
                  </tr>
                </thead>
                <tbody>
                  {data.series.byCoordinador.map((row, idx) => (
                    <tr key={row.uid || row.nombre} className={`border-t border-slate-200 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}>
                      <td className="px-3 py-3 font-medium text-slate-950">{row.nombre || "-"}</td>
                      <td className="px-3 py-3 text-slate-700">{row.total}</td>
                      <td className="px-3 py-3 text-slate-700">{row.recurrentes}</td>
                      <td className="px-3 py-3 text-slate-700">{row.tasaReincidenciaPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PanelCard>

          <PanelCard title="Cuadrillas con mas reincidencia" subtitle="Vista operativa con total, reincidencias, tasa y motivo dominante">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Cuadrilla</th>
                    <th className="px-3 py-2 text-left font-semibold">Total</th>
                    <th className="px-3 py-2 text-left font-semibold">Recurrentes</th>
                    <th className="px-3 py-2 text-left font-semibold">Tasa</th>
                    <th className="px-3 py-2 text-left font-semibold">Finalizadas</th>
                    <th className="px-3 py-2 text-left font-semibold">Canceladas</th>
                    <th className="px-3 py-2 text-left font-semibold">Dias prom.</th>
                    <th className="px-3 py-2 text-left font-semibold">Motivo dominante</th>
                  </tr>
                </thead>
                <tbody>
                  {data.series.byCuadrilla.map((row, idx) => (
                    <tr
                      key={row.cuadrilla}
                      className={`border-t border-slate-200 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}
                    >
                      <td className="px-3 py-3 font-medium text-slate-950">{row.cuadrilla || "-"}</td>
                      <td className="px-3 py-3 text-slate-700">{row.total}</td>
                      <td className="px-3 py-3 text-slate-700">{row.recurrentes}</td>
                      <td className="px-3 py-3 text-slate-700">{row.tasaReincidenciaPct}%</td>
                      <td className="px-3 py-3 text-slate-700">{row.finalizadas}</td>
                      <td className="px-3 py-3 text-slate-700">{row.canceladas}</td>
                      <td className="px-3 py-3 text-slate-700">{row.diasPromedio}</td>
                      <td className="px-3 py-3 text-slate-700">{row.motivoPrincipal || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PanelCard>

          <PanelCard title="Garantias recientes" subtitle="Casos filtrados con fecha de garantia y base de instalacion">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">F. garantia</th>
                    <th className="px-3 py-2 text-left font-semibold">Cliente</th>
                    <th className="px-3 py-2 text-left font-semibold">Cuadrilla</th>
                    <th className="px-3 py-2 text-left font-semibold">Reinc.</th>
                    <th className="px-3 py-2 text-left font-semibold">Motivo</th>
                    <th className="px-3 py-2 text-left font-semibold">F. instalacion</th>
                    <th className="px-3 py-2 text-left font-semibold">Dias</th>
                    <th className="px-3 py-2 text-left font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.detail.recientes.map((row, idx) => (
                    <tr
                      key={row.id}
                      className={`border-t border-slate-200 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}
                    >
                      <td className="px-3 py-3 text-slate-700">{formatYmdPretty(row.fechaGarantiaYmd)}</td>
                      <td className="px-3 py-3 text-slate-700">
                        <div className="font-medium text-slate-950">{row.cliente || "-"}</div>
                        <div className="text-xs text-slate-500">{row.codigoCliente || row.ordenId}</div>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{row.cuadrilla || "-"}</td>
                      <td className="px-3 py-3 text-slate-700">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                            row.recurrente ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {row.recurrente ? `Si (${row.recurrenciaCantidad})` : "No"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{row.motivo || "-"}</td>
                      <td className="px-3 py-3 text-slate-700">{formatYmdPretty(row.fechaInstalacionBase)}</td>
                      <td className="px-3 py-3 text-slate-700">
                        {typeof row.diasDesdeInstalacion === "number" ? row.diasDesdeInstalacion : "-"}
                      </td>
                      <td className="px-3 py-3 text-slate-700">{row.estado || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PanelCard>
        </>
      ) : null}
    </div>
  );
}
