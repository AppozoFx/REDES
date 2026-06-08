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
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
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
    instalacionesFinalizadas: number;
    tasaGarantiaPct: number;
  };
  series: {
    byDay: Array<{ ymd: string; total: number; finalizadas: number; canceladas: number; recurrentes: number }>;
    byMonth: Array<{ ym: string; total: number; finalizadas: number; canceladas: number; recurrentes: number }>;
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

function monthEnd(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0));
  return `${last.getUTCFullYear()}-${String(last.getUTCMonth() + 1).padStart(2, "0")}-${String(last.getUTCDate()).padStart(2, "0")}`;
}

function formatYm(ym: string) {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const months = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const [y, m] = ym.split("-");
  return `${months[Number(m) - 1]} ${y}`;
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
  span2 = false,
}: {
  title: string;
  value: string | number;
  hint?: string;
  tone?: "slate" | "blue" | "emerald" | "amber" | "rose";
  span2?: boolean;
}) {
  const toneClass =
    tone === "blue"
      ? "bg-[#eff4ff] text-[#1f3154] ring-[#bfd1f1] [--accent:#30518c]"
      : tone === "emerald"
      ? "bg-emerald-50 text-emerald-950 ring-emerald-200 [--accent:#059669]"
      : tone === "amber"
      ? "bg-amber-50 text-amber-950 ring-amber-200 [--accent:#d97706]"
      : tone === "rose"
      ? "bg-rose-50 text-rose-950 ring-rose-200 [--accent:#e11d48]"
      : "bg-slate-50 text-slate-950 ring-slate-200 [--accent:#64748b]";
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ring-1 ${toneClass} ${span2 ? "sm:col-span-1" : ""}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-60">{title}</div>
      <div className="mt-1.5 text-2xl font-bold tracking-tight md:text-3xl">{value}</div>
      {hint ? <div className="mt-1 text-[11px] opacity-60 leading-tight">{hint}</div> : null}
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
    instMonth: todayLimaYm(),   // YYYY-MM — mes de instalación (requerido)
    garantiaMonth: "",          // YYYY-MM — mes de garantía (opcional)
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

  // Estado para el evolutivo anual (siempre enero–hoy, filtrado por cuadrilla)
  const [yearEvol, setYearEvol] = useState<Array<{ ym: string; total: number; finalizadas: number; canceladas: number }>>([]);

  // Fetch evolutivo anual: se re-ejecuta cuando cambia cuadrilla/coordinador
  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    const thisYear = new Date().getFullYear();
    const yearStart = `${thisYear}-01-01`;
    const params = new URLSearchParams({
      ym: `${thisYear}-01`,
      garantiaFrom: yearStart,
      garantiaTo: todayLimaYmd(),
    });
    if (filters.cuadrilla) params.set("cuadrilla", filters.cuadrilla);
    if (filters.coordinadorUid) params.set("coordinadorUid", filters.coordinadorUid);

    fetch(`/api/ordenes/garantias/dashboard?${params.toString()}`, {
      cache: "no-store",
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json?.ok) return;
        const map = new Map<string, { ym: string; total: number; finalizadas: number; canceladas: number }>();
        for (const d of json.series.byDay as Array<{ ymd: string; total: number; finalizadas: number; canceladas: number }>) {
          const ym = d.ymd.slice(0, 7);
          const e = map.get(ym) || { ym, total: 0, finalizadas: 0, canceladas: 0 };
          e.total += d.total;
          e.finalizadas += d.finalizadas;
          e.canceladas += d.canceladas;
          map.set(ym, e);
        }
        if (!cancelled) setYearEvol(Array.from(map.values()).sort((a, b) => a.ym.localeCompare(b.ym)));
      })
      .catch(() => {});
    return () => { cancelled = true; ctrl.abort(); };
  }, [filters.cuadrilla, filters.coordinadorUid]);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    async function load() {
      setLoading(true);
      setError("");
      try {
        // instMonth es el filtro primario: filtra por fecha de instalación base.
        // Si garantiaMonth está vacío, la consulta abarca desde instMonth hasta hoy
        // para capturar garantías generadas en meses posteriores a la instalación.
        const instFrom = filters.instMonth ? `${filters.instMonth}-01` : monthStartYmd();
        const instTo   = filters.instMonth ? monthEnd(filters.instMonth) : todayLimaYmd();
        const garantiaFrom = filters.garantiaMonth ? `${filters.garantiaMonth}-01` : instFrom;
        const garantiaTo   = filters.garantiaMonth ? monthEnd(filters.garantiaMonth) : todayLimaYmd();
        const params = new URLSearchParams({
          ym: garantiaFrom.slice(0, 7),
          garantiaFrom,
          garantiaTo,
          instFrom,
          instTo,
        });
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
  }, [filters.instMonth, filters.garantiaMonth, filters.cuadrilla, filters.coordinadorUid]);

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
    const pieces: string[] = [];
    if (filters.instMonth) pieces.push(`Instalacion: ${formatYm(filters.instMonth)}`);
    if (filters.garantiaMonth) pieces.push(`Garantia: ${formatYm(filters.garantiaMonth)}`);
    if (filters.cuadrilla) pieces.push(`Cuadrilla ${filters.cuadrilla}`);
    if (filters.coordinadorUid) {
      const coordName = data?.options.coordinadores.find((x) => x.uid === filters.coordinadorUid)?.nombre || filters.coordinadorUid;
      pieces.push(`Coordinador ${coordName}`);
    }
    return pieces.length ? pieces.join(" | ") : "Sin filtros";
  }, [data?.options.coordinadores, filters.cuadrilla, filters.coordinadorUid, filters.garantiaMonth, filters.instMonth]);

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
                <span>Fecha de instalacion</span>
                <input
                  type="month"
                  value={filters.instMonth}
                  onChange={(e) => setFilters((prev) => ({ ...prev, instMonth: e.target.value }))}
                  className="w-full rounded-xl border border-white/15 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none ring-0 focus:border-white/30"
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-200">
                <span className="flex items-center gap-1.5">
                  Fecha de garantia
                  <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-normal text-slate-400 uppercase tracking-wide">opcional</span>
                </span>
                <input
                  type="month"
                  value={filters.garantiaMonth}
                  onChange={(e) => setFilters((prev) => ({ ...prev, garantiaMonth: e.target.value }))}
                  className="w-full rounded-xl border border-white/15 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none ring-0 focus:border-white/30"
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
          {/* ── KPI ejecutivos ── */}
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            <StatCard title="Total garantias" value={data.kpi.total} tone="blue" hint={`${data.kpi.pendientes} pendientes`} span2 />
            <StatCard title="Finalizadas" value={data.kpi.finalizadas} tone="emerald" hint={`${formatNum(data.kpi.finalizadas / (data.kpi.total || 1) * 100)}% del total`} span2 />
            <StatCard title="Canceladas" value={data.kpi.canceladas} tone="rose" hint={`${formatNum(data.kpi.canceladas / (data.kpi.total || 1) * 100)}% del total`} span2 />
            <StatCard
              title="Tasa de garantia"
              value={data.kpi.instalacionesFinalizadas > 0 ? `${data.kpi.tasaGarantiaPct}%` : "—"}
              tone="amber"
              hint={data.kpi.instalacionesFinalizadas > 0 ? `${data.kpi.finalizadas} garantias / ${data.kpi.instalacionesFinalizadas} instalaciones` : "Sin instalaciones en el periodo"}
              span2
            />
            <StatCard title="Reincidencia" value={`${data.kpi.reincidenciaPct}%`} tone="rose" hint={`${data.kpi.casosRecurrentes} casos con 2+ garantias`} span2 />
            <StatCard title="Cuadrillas" value={data.kpi.cuadrillasAfectadas} hint="con al menos 1 garantia" span2 />
            <StatCard title="Dias promedio" value={data.kpi.diasPromedio} hint="desde instalacion base" span2 />
            <StatCard title="Coordinadores" value={data.kpi.coordinadoresAfectados} span2 />
          </section>

          {/* ── Top insight strip ── */}
          <section className="grid gap-4 lg:grid-cols-3">
            <StatCard
              title="Cuadrilla mas afectada"
              value={topCuadrilla?.cuadrilla || "—"}
              tone="blue"
              hint={topCuadrilla ? `${topCuadrilla.total} garantias · ${topCuadrilla.recurrentes} recurrentes · ${topCuadrilla.tasaReincidenciaPct}% reincidencia` : "Sin datos"}
            />
            <StatCard
              title="Motivo dominante"
              value={topMotivo?.label || "—"}
              tone="amber"
              hint={topMotivo ? `${topMotivo.total} casos · ${topMotivo.recurrentes} recurrentes` : "Sin datos"}
            />
            <StatCard
              title="Coordinador con mas casos"
              value={topCoordinador?.nombre || "—"}
              tone="emerald"
              hint={topCoordinador ? `${topCoordinador.total} casos · ${topCoordinador.tasaReincidenciaPct}% reincidencia` : "Sin datos"}
            />
          </section>

          {/* ── Evolutivo anual ── */}
          {yearEvol.length > 0 && (
            <PanelCard
              title={filters.cuadrilla ? `Evolutivo anual — ${filters.cuadrilla}` : "Evolutivo anual de garantias"}
              subtitle={`Garantias finalizadas y canceladas por mes · ${new Date().getFullYear()}`}
            >
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={yearEvol} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="ym"
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      tickFormatter={(ym) => {
                        const m = /^(\d{4})-(\d{2})$/.exec(ym);
                        if (!m) return ym;
                        return ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][Number(m[2]) - 1];
                      }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip
                      contentStyle={{ borderRadius: "0.75rem", border: "1px solid #e2e8f0", fontSize: 12 }}
                      formatter={(v: any, name?: string) => [v, name === "finalizadas" ? "Finalizadas" : name === "canceladas" ? "Canceladas" : "Total"]}
                      labelFormatter={(ym) => formatYm(String(ym))}
                    />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} formatter={(v) => v === "finalizadas" ? "Finalizadas" : v === "canceladas" ? "Canceladas" : "Total"} />
                    <Bar dataKey="finalizadas" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={40} />
                    <Bar dataKey="canceladas" fill="#f43f5e" radius={[6, 6, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </PanelCard>
          )}

          {/* ── Gráficos principales ── */}
          <section className="grid gap-4 xl:grid-cols-2">
            <PanelCard title="Garantias por dia" subtitle="Volumen diario en el periodo filtrado">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.series.byDay} margin={{ left: 0, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="ymd" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={formatYmdPretty} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip contentStyle={{ borderRadius: "0.75rem", border: "1px solid #e2e8f0", fontSize: 12 }} labelFormatter={(v) => formatYmdPretty(String(v))} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} formatter={(v) => v === "total" ? "Total" : v === "finalizadas" ? "Finalizadas" : v === "canceladas" ? "Canceladas" : "Recurrentes"} />
                    <Bar dataKey="finalizadas" fill="#10b981" radius={[4, 4, 0, 0]} stackId="a" maxBarSize={32} />
                    <Bar dataKey="canceladas" fill="#f43f5e" radius={[0, 0, 0, 0]} stackId="a" maxBarSize={32} />
                    <Bar dataKey="recurrentes" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </PanelCard>

            <PanelCard title="Distribucion por estado" subtitle="Composicion de los casos filtrados">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusData} dataKey="total" nameKey="estado" outerRadius="70%" innerRadius="45%" paddingAngle={2}>
                      {statusData.map((entry) => (
                        <Cell key={entry.estado} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: "0.75rem", border: "1px solid #e2e8f0", fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {statusData.map((item) => (
                  <span key={item.estado} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                    <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.fill }} />
                    {item.estado} <span className="font-semibold text-slate-900">{item.total}</span>
                  </span>
                ))}
              </div>
            </PanelCard>
          </section>

          {/* ── Reincidencia y motivos ── */}
          <section className="grid gap-4 xl:grid-cols-[1.3fr_.7fr]">
            <PanelCard title="Reincidencia por cuadrilla" subtitle="Garantias totales vs recurrentes — top 8">
              {cuadrillaChart.length ? (
                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cuadrillaChart} layout="vertical" margin={{ left: 8, right: 16, top: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="cuadrilla" width={115} tick={{ fontSize: 11, fill: "#475569" }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: "0.75rem", border: "1px solid #e2e8f0", fontSize: 12 }} formatter={(v, n) => [v, n === "noRecurrentes" ? "Sin reincidencia" : "Recurrentes"]} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} formatter={(v) => v === "noRecurrentes" ? "Sin reincidencia" : "Recurrentes"} />
                      <Bar dataKey="noRecurrentes" stackId="a" fill="#dbeafe" />
                      <Bar dataKey="recurrentes" stackId="a" fill="#30518c" radius={[0, 8, 8, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState title="Sin datos de cuadrillas" description="Ajusta los filtros para ver reincidencias por cuadrilla." />
              )}
            </PanelCard>

            <PanelCard title="Motivos principales" subtitle="Top 10 motivos de garantia">
              {data.series.byMotivo.length ? (
                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.series.byMotivo} layout="vertical" margin={{ left: 8, right: 16, top: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="label" width={115} tick={{ fontSize: 11, fill: "#475569" }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: "0.75rem", border: "1px solid #e2e8f0", fontSize: 12 }} />
                      <Bar dataKey="total" fill="#f59e0b" radius={[0, 8, 8, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState title="Sin motivos" description="No hay registros para este filtro." />
              )}
            </PanelCard>
          </section>

          {/* ── Tablas ── */}
          <section className="grid gap-4 xl:grid-cols-2">
            <PanelCard title="Top coordinadores" subtitle="Volumen y reincidencia por coordinador">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="pb-2 pr-4 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Coordinador</th>
                      <th className="pb-2 pr-4 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400">Total</th>
                      <th className="pb-2 pr-4 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400">Reinc.</th>
                      <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400">Tasa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.series.byCoordinador.map((row) => (
                      <tr key={row.uid || row.nombre} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-2.5 pr-4 font-medium text-slate-900">{row.nombre || "—"}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-slate-600">{row.total}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-slate-600">{row.recurrentes}</td>
                        <td className="py-2.5 text-right tabular-nums">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${row.tasaReincidenciaPct >= 30 ? "bg-rose-100 text-rose-700" : row.tasaReincidenciaPct >= 15 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                            {row.tasaReincidenciaPct}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PanelCard>

            <PanelCard title="Cuadrillas — detalle operativo" subtitle="Finalizadas, canceladas, dias promedio y motivo dominante">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="pb-2 pr-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Cuadrilla</th>
                      <th className="pb-2 pr-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400">Tot.</th>
                      <th className="pb-2 pr-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400">Final.</th>
                      <th className="pb-2 pr-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400">Cancel.</th>
                      <th className="pb-2 pr-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400">Tasa</th>
                      <th className="pb-2 pr-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400">Días</th>
                      <th className="pb-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.series.byCuadrilla.map((row) => (
                      <tr key={row.cuadrilla} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-2.5 pr-3 font-medium text-slate-900">{row.cuadrilla || "—"}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-slate-600">{row.total}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-emerald-700 font-medium">{row.finalizadas}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-rose-600 font-medium">{row.canceladas}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">
                          <span className={`inline-block rounded-full px-1.5 py-0.5 text-xs font-semibold ${row.tasaReincidenciaPct >= 30 ? "bg-rose-100 text-rose-700" : row.tasaReincidenciaPct >= 15 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                            {row.tasaReincidenciaPct}%
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-slate-600">{row.diasPromedio}</td>
                        <td className="py-2.5 max-w-[140px] truncate text-slate-500 text-xs">{row.motivoPrincipal || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PanelCard>
          </section>

          {/* ── Tabla detalle ── */}
          <PanelCard title="Detalle de garantias" subtitle="Casos filtrados — recurrentes primero">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    {["F. garantia","Cliente","Cuadrilla","Reinc.","Motivo","F. instalacion","Dias","Estado"].map((h) => (
                      <th key={h} className="pb-2 pr-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400 last:pr-0">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.detail.recientes.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2.5 pr-3 tabular-nums text-slate-600">{formatYmdPretty(row.fechaGarantiaYmd)}</td>
                      <td className="py-2.5 pr-3">
                        <div className="font-medium text-slate-900 leading-tight">{row.cliente || "—"}</div>
                        <div className="text-[10px] text-slate-400">{row.codigoCliente || row.ordenId}</div>
                      </td>
                      <td className="py-2.5 pr-3 text-slate-600">{row.cuadrilla || "—"}</td>
                      <td className="py-2.5 pr-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${row.recurrente ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
                          {row.recurrente ? `×${row.recurrenciaCantidad}` : "—"}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 max-w-[160px] truncate text-slate-600 text-xs">{row.motivo || "—"}</td>
                      <td className="py-2.5 pr-3 tabular-nums text-slate-600">{formatYmdPretty(row.fechaInstalacionBase)}</td>
                      <td className="py-2.5 pr-3 tabular-nums text-slate-600">{typeof row.diasDesdeInstalacion === "number" ? row.diasDesdeInstalacion : "—"}</td>
                      <td className="py-2.5">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${row.estado?.toLowerCase().includes("final") ? "bg-emerald-100 text-emerald-800" : row.estado?.toLowerCase().includes("cancel") ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>
                          {row.estado || "—"}
                        </span>
                      </td>
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
