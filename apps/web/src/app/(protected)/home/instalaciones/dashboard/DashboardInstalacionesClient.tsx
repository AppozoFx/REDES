"use client";

import { useEffect, useMemo, useState } from "react";
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
} from "recharts";

type Mode = "day" | "week" | "month" | "range";
const CHART_COLORS = ["#30518c", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

type Resp = {
  ok: true;
  period: { fromYmd: string; toYmd: string; label: string; mode: Mode };
  kpi: {
    total: number;
    finalizadas: number;
    agendadas: number;
    iniciadas: number;
    pendientes: number;
    efectividadPct: number;
    liquidadas: number;
    pendientesLiquidar: number;
    correccionPendiente: number;
  };
  series: {
    byDay: Array<{ ymd: string; total: number; finalizadas: number; liquidadas: number }>;
    byCuadrillaEstado: Array<{
      cuadrillaId: string;
      cuadrillaNombre: string;
      agendada: number;
      iniciada: number;
      finalizada: number;
      canceladas: number;
    }>;
    topCuadrillasFinalizadas: Array<{ cuadrillaId: string; cuadrillaNombre: string; finalizadas: number }>;
    byTipoOrden: Array<{ tipoOrden: string; total: number }>;
  };
  filtersMeta: {
    cuadrillas: Array<{ id: string; nombre: string }>;
    regionesOrdenes: string[];
    gestores: Array<{ uid: string; nombre: string }>;
    coordinadores: Array<{ uid: string; nombre: string }>;
    tiposOrden: string[];
    estados: string[];
  };
  detail: {
    page: number;
    pageSize: number;
    total: number;
    items: Array<{
      id: string;
      ymd: string;
      hm: string;
      ordenId: string;
      codiSeguiClien: string;
      cliente: string;
      cuadrillaId: string;
      cuadrillaNombre: string;
      estado: string;
      tipoOrden: string;
      tipoTraba: string;
      gestorUid: string;
      gestorNombre: string;
      coordinadorUid: string;
      coordinadorNombre: string;
      regionOrden: string;
      liquidado: boolean;
      correccionPendiente: boolean;
      liquidacionAt: string | null;
    }>;
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

function normalizeCuadrillaKey(raw: string) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function norm(v: string) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function StatCard({ title, value, hint, tone = "slate" }: { title: string; value: string | number; hint?: string; tone?: "slate" | "emerald" | "amber" | "indigo" | "rose" }) {
  const toneCls =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : tone === "indigo"
      ? "border-indigo-200 bg-indigo-50 text-indigo-800"
      : tone === "rose"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : "border-slate-200 bg-slate-50 text-slate-800";
  return (
    <div className={`rounded-xl border p-3 ${toneCls}`}>
      <div className="text-xs font-medium">{title}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint ? <div className="mt-1 text-xs opacity-80">{hint}</div> : null}
    </div>
  );
}

function CustomizedXAxisTick({
  x,
  y,
  payload,
  labelByKey,
}: {
  x?: number | string;
  y?: number | string;
  payload?: { value?: string | number };
  labelByKey: Map<string, string>;
}) {
  const key = String(payload?.value ?? "");
  const label = labelByKey.get(key) ?? key;
  const tx = typeof x === "string" ? Number(x) : (x ?? 0);
  const ty = typeof y === "string" ? Number(y) : (y ?? 0);
  return (
    <g transform={`translate(${tx},${ty})`}>
      <text
        x={0}
        y={0}
        dy={18}
        textAnchor="end"
        transform="rotate(-28)"
        fill="#475569"
        fontSize={11}
      >
        {label}
      </text>
    </g>
  );
}

export default function DashboardInstalacionesClient() {
  const [mode, setMode] = useState<Mode>("month");
  const [ymd, setYmd] = useState(todayLimaYmd());
  const [ym, setYm] = useState(todayLimaYm());
  const [from, setFrom] = useState(todayLimaYmd());
  const [to, setTo] = useState(todayLimaYmd());

  const [fCuadrilla, setFCuadrilla] = useState("");
  const [fRegionOrden, setFRegionOrden] = useState("");
  const [gestorUid, setGestorUid] = useState("");
  const [coordinadorUid, setCoordinadorUid] = useState("");
  const [estado, setEstado] = useState("");
  const [tipoOrden, setTipoOrden] = useState("");
  const [soloNoLiquidadas, setSoloNoLiquidadas] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<Resp | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const cuadrillasCategories = useMemo(() => {
    const acc = new Map<
      string,
      { cuadrillaKey: string; cuadrillaLabel: string; finalizadas: number; canceladas: number }
    >();
    for (const x of data?.series.byCuadrillaEstado || []) {
      const baseLabel = String(x.cuadrillaNombre || x.cuadrillaId || "-").trim() || "-";
      const cuadrillaKey = normalizeCuadrillaKey(baseLabel);
      const row = acc.get(cuadrillaKey);
      if (row) {
        row.finalizadas += x.finalizada || 0;
        row.canceladas += x.canceladas || 0;
      } else {
        acc.set(cuadrillaKey, {
          cuadrillaKey,
          cuadrillaLabel: baseLabel,
          finalizadas: x.finalizada || 0,
          canceladas: x.canceladas || 0,
        });
      }
    }
    return Array.from(acc.values());
  }, [data]);
  const chartCuadrillas = useMemo(() => {
    const labels = cuadrillasCategories.map((x) => x.cuadrillaLabel);
    const finalizadas = cuadrillasCategories.map((x) => x.finalizadas);
    const canceladas = cuadrillasCategories.map((x) => x.canceladas);
    const data = cuadrillasCategories.map((x) => ({
      cuadrillaKey: x.cuadrillaKey,
      label: x.cuadrillaLabel,
      finalizadas: x.finalizadas,
      canceladas: x.canceladas,
    }));
    return { categories: cuadrillasCategories, labels, finalizadas, canceladas, data };
  }, [cuadrillasCategories]);
  const dataFinalizadasPorDia = useMemo(
    () =>
      [...(data?.series.byDay || [])]
        .sort((a, b) => String(a.ymd || "").localeCompare(String(b.ymd || "")))
        .map((r) => ({
          ...r,
          dia: String(r.ymd || "").slice(8, 10) || String(r.ymd || ""),
          finalizadas: r.finalizadas || 0,
        })),
    [data]
  );
  const labelByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of chartCuadrillas.data) {
      m.set(r.cuadrillaKey, r.label);
    }
    return m;
  }, [chartCuadrillas.data]);
  const opcionesCuadrilla = useMemo(
    () =>
      Array.from(
        new Set(
          (data?.filtersMeta.cuadrillas || [])
            .map((c) => String(c.nombre || "").trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" })),
    [data]
  );
  const opcionesCuadrillaFiltradas = useMemo(() => {
    const q = norm(fCuadrilla);
    if (!q) return opcionesCuadrilla;
    return opcionesCuadrilla.filter((name) => norm(name).includes(q));
  }, [opcionesCuadrilla, fCuadrilla]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const { labels, finalizadas, canceladas, data } = chartCuadrillas;
    if (!(labels.length === finalizadas.length && labels.length === canceladas.length)) {
      console.warn("[DashboardInstalaciones] Longitudes descalzadas en chart de cuadrillas", {
        labels: labels.length,
        finalizadas: finalizadas.length,
        canceladas: canceladas.length,
      });
    }
    for (let i = 0; i < data.length; i += 1) {
      if (labels[i] !== data[i].label) {
        console.warn("[DashboardInstalaciones] Label descalzado por indice", { i, label: labels[i], row: data[i] });
      }
    }
  }, [chartCuadrillas]);

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      qs.set("mode", mode);
      qs.set("ymd", ymd);
      qs.set("ym", ym);
      qs.set("from", from);
      qs.set("to", to);
      qs.set("page", String(page));
      qs.set("pageSize", String(pageSize));
      if (fCuadrilla) qs.set("cuadrilla", fCuadrilla);
      if (fRegionOrden) qs.set("regionOrden", fRegionOrden);
      if (gestorUid) qs.set("gestorUid", gestorUid);
      if (coordinadorUid) qs.set("coordinadorUid", coordinadorUid);
      if (estado) qs.set("estado", estado);
      if (tipoOrden) qs.set("tipoOrden", tipoOrden);
      if (soloNoLiquidadas) qs.set("soloNoLiquidadas", "1");

      const res = await fetch(`/api/instalaciones/dashboard?${qs.toString()}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      setData(body as Resp);
    } catch (e: any) {
      setData(null);
      setError(String(e?.message || "ERROR"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [mode, ymd, ym, from, to, fCuadrilla, fRegionOrden, gestorUid, coordinadorUid, estado, tipoOrden, soloNoLiquidadas, page, pageSize]);

  const totalPages = useMemo(() => {
    const total = data?.detail.total || 0;
    return Math.max(1, Math.ceil(total / pageSize));
  }, [data, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const exportCurrentPage = () => {
    const rows = (data?.detail.items || []).map((x) => ({
      fecha: x.ymd,
      hora: x.hm,
      ordenId: x.ordenId,
      codigoCliente: x.codiSeguiClien,
      cliente: x.cliente,
      cuadrillaId: x.cuadrillaId,
      cuadrilla: x.cuadrillaNombre,
      estado: x.estado,
      tipoOrden: x.tipoOrden,
      tipoTraba: x.tipoTraba,
      gestor: x.gestorNombre,
      coordinador: x.coordinadorNombre,
      liquidado: x.liquidado ? "SI" : "NO",
      correccionPendiente: x.correccionPendiente ? "SI" : "NO",
      liquidacionAt: x.liquidacionAt || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dashboard");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const name = `dashboard_instalaciones_${data?.period?.fromYmd || "from"}_${data?.period?.toYmd || "to"}_p${page}.xlsx`;
    saveAs(new Blob([out], { type: "application/octet-stream" }), name);
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-500">Periodo</label>
            <select
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as Mode);
                setPage(1);
              }}
              className="rounded border px-3 py-2 text-sm"
            >
              <option value="day">Dia</option>
              <option value="week">Semana</option>
              <option value="month">Mes</option>
              <option value="range">Rango</option>
            </select>
          </div>
          {mode === "day" || mode === "week" ? (
            <div>
              <label className="mb-1 block text-xs text-slate-500">Fecha base</label>
              <input type="date" value={ymd} onChange={(e) => setYmd(e.target.value)} className="rounded border px-3 py-2 text-sm" />
            </div>
          ) : null}
          {mode === "month" ? (
            <div>
              <label className="mb-1 block text-xs text-slate-500">Mes</label>
              <input type="month" value={ym} onChange={(e) => setYm(e.target.value)} className="rounded border px-3 py-2 text-sm" />
            </div>
          ) : null}
          {mode === "range" ? (
            <>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Desde</label>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Hasta</label>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border px-3 py-2 text-sm" />
              </div>
            </>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            <button onClick={fetchData} className="rounded border px-3 py-2 text-sm">
              Actualizar
            </button>
            <button onClick={exportCurrentPage} disabled={!data?.detail.items?.length} className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">
              Exportar pagina
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-3 xl:grid-cols-7">
          <div>
            <label className="mb-1 block text-xs text-slate-500">Cuadrilla</label>
            <input
              list="d-cuadrillas-dashboard-inst"
              value={fCuadrilla}
              onChange={(e) => {
                setFCuadrilla(e.target.value);
                setPage(1);
              }}
              placeholder="Escribe para filtrar"
              className="w-full rounded border px-2 py-2 text-sm"
            />
            <datalist id="d-cuadrillas-dashboard-inst">
              {opcionesCuadrillaFiltradas.slice(0, 30).map((q) => (
                <option key={q} value={q} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Region (Ordenes)</label>
            <select value={fRegionOrden} onChange={(e) => { setFRegionOrden(e.target.value); setPage(1); }} className="w-full rounded border px-2 py-2 text-sm">
              <option value="">Todas</option>
              {(data?.filtersMeta.regionesOrdenes || []).map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Gestor</label>
            <select value={gestorUid} onChange={(e) => { setGestorUid(e.target.value); setPage(1); }} className="w-full rounded border px-2 py-2 text-sm">
              <option value="">Todos</option>
              {(data?.filtersMeta.gestores || []).map((g) => (
                <option key={g.uid} value={g.uid}>{g.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Coordinador</label>
            <select value={coordinadorUid} onChange={(e) => { setCoordinadorUid(e.target.value); setPage(1); }} className="w-full rounded border px-2 py-2 text-sm">
              <option value="">Todos</option>
              {(data?.filtersMeta.coordinadores || []).map((c) => (
                <option key={c.uid} value={c.uid}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Estado</label>
            <select value={estado} onChange={(e) => { setEstado(e.target.value); setPage(1); }} className="w-full rounded border px-2 py-2 text-sm">
              <option value="">Todos</option>
              {(data?.filtersMeta.estados || []).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Tipo orden</label>
            <select value={tipoOrden} onChange={(e) => { setTipoOrden(e.target.value); setPage(1); }} className="w-full rounded border px-2 py-2 text-sm">
              <option value="">Todos</option>
              {(data?.filtersMeta.tiposOrden || []).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <label className="inline-flex items-center gap-2 self-end rounded border px-3 py-2 text-sm">
            <input type="checkbox" checked={soloNoLiquidadas} onChange={(e) => { setSoloNoLiquidadas(e.target.checked); setPage(1); }} />
            Solo no liquidadas
          </label>
        </div>
      </section>

      {loading ? <div className="rounded-xl border bg-white p-4 text-sm text-slate-500">Cargando dashboard...</div> : null}
      {error ? <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}

      {!loading && !error && data ? (
        <>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <StatCard title="Finalizadas" value={data.kpi.finalizadas} tone="emerald" />
            <StatCard title="Pendientes (no finalizadas)" value={data.kpi.pendientes} tone="amber" hint="Agendadas + Iniciadas" />
            <StatCard title="Efectividad" value={`${data.kpi.efectividadPct.toFixed(1)}%`} tone="indigo" />
            <StatCard title="Liquidadas" value={data.kpi.liquidadas} tone="slate" />
            <StatCard title="Pendientes de liquidar" value={data.kpi.pendientesLiquidar} tone="rose" hint="Finalizadas aun no liquidadas" />
          </section>

          <section>
            <div className="rounded-xl border bg-white p-4">
              <h2 className="text-sm font-semibold">Finalizadas y Canceladas por Cuadrilla (sin garantia)</h2>
              <div className="mt-3 h-[360px]">
                <ResponsiveContainer width="100%" height={360}>
                  <BarChart
                    data={chartCuadrillas.data}
                    margin={{ top: 8, right: 16, left: 0, bottom: 100 }}
                    barCategoryGap="18%"
                    barGap={4}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="cuadrillaKey"
                      interval={0}
                      height={96}
                      tick={(props) => <CustomizedXAxisTick {...props} labelByKey={labelByKey} />}
                      padding={{ left: 0, right: 0 }}
                      allowDuplicatedCategory={false}
                    />
                    <YAxis allowDecimals={false} />
                    <Tooltip labelFormatter={(key) => labelByKey.get(String(key)) ?? String(key)} />
                    <Legend />
                    <Bar
                      dataKey="finalizadas"
                      name="Finalizadas"
                      fill="#10b981"
                      radius={[6, 6, 0, 0]}
                    />
                    <Bar
                      dataKey="canceladas"
                      name="Canceladas"
                      fill="#ef4444"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            {mode === "month" ? (
              <div className="rounded-xl border bg-white p-4">
                <h2 className="text-sm font-semibold">Finalizadas por dia</h2>
                <div className="mt-3 h-72">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      data={dataFinalizadasPorDia}
                      margin={{ top: 8, right: 16, left: 0, bottom: 24 }}
                      barCategoryGap="18%"
                      barGap={4}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="dia" interval={0} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Bar
                        dataKey="finalizadas"
                        name="Finalizadas"
                        fill="#10b981"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border bg-white p-4">
                <h2 className="text-sm font-semibold">Finalizadas por dia</h2>
                <div className="rounded border border-dashed p-4 text-xs text-slate-500">
                  Este grafico se habilita cuando el periodo esta en modo Mes.
                </div>
              </div>
            )}

            <div className="rounded-xl border bg-white p-4">
              <h2 className="text-sm font-semibold">Distribucion por tipo de orden</h2>
              <div className="mt-3 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.series.byTipoOrden || []}
                      dataKey="total"
                      nameKey="tipoOrden"
                      outerRadius={95}
                      label={({ tipoOrden, percent }: any) => `${tipoOrden} ${(percent * 100).toFixed(0)}%`}
                    >
                      {(data.series.byTipoOrden || []).map((_, idx) => (
                        <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className="rounded-xl border bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Detalle operativo</h2>
              <button
                type="button"
                onClick={() => setShowDetail((v) => !v)}
                className="rounded border px-3 py-1.5 text-xs"
              >
                {showDetail ? "Ocultar detalle" : "Ver detalle"}
              </button>
            </div>
            {showDetail ? (
              <>
                <div className="mb-3 flex items-center justify-between text-xs">
                  <span>Total: {data.detail.total}</span>
                  <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="rounded border px-2 py-1">
                    {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n}/pag</option>)}
                  </select>
                </div>
                <div className="overflow-auto rounded border">
                  <table className="min-w-full text-xs">
                    <thead className="sticky top-0 bg-slate-100">
                      <tr>
                        <th className="px-2 py-2 text-left">Fecha</th>
                        <th className="px-2 py-2 text-left">Orden</th>
                        <th className="px-2 py-2 text-left">Codigo</th>
                        <th className="px-2 py-2 text-left">Cliente</th>
                        <th className="px-2 py-2 text-left">Cuadrilla</th>
                        <th className="px-2 py-2 text-left">Estado</th>
                        <th className="px-2 py-2 text-left">Tipo</th>
                        <th className="px-2 py-2 text-left">Gestor</th>
                        <th className="px-2 py-2 text-left">Coordinador</th>
                        <th className="px-2 py-2 text-left">Liquidado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.detail.items.map((x) => (
                        <tr key={x.id} className="border-t">
                          <td className="px-2 py-1.5">{x.ymd} {x.hm || ""}</td>
                          <td className="px-2 py-1.5">{x.ordenId}</td>
                          <td className="px-2 py-1.5">{x.codiSeguiClien}</td>
                          <td className="px-2 py-1.5">{x.cliente}</td>
                          <td className="px-2 py-1.5">{x.cuadrillaNombre || x.cuadrillaId}</td>
                          <td className="px-2 py-1.5">{x.estado}</td>
                          <td className="px-2 py-1.5">{x.tipoOrden}</td>
                          <td className="px-2 py-1.5">{x.gestorNombre || "-"}</td>
                          <td className="px-2 py-1.5">{x.coordinadorNombre || "-"}</td>
                          <td className="px-2 py-1.5">{x.liquidado ? "SI" : "NO"}</td>
                        </tr>
                      ))}
                      {!data.detail.items.length ? (
                        <tr>
                          <td colSpan={10} className="px-2 py-8 text-center text-slate-500">No hay resultados.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span>Pagina {page} de {totalPages}</span>
                  <div className="flex items-center gap-2">
                    <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded border px-2 py-1 disabled:opacity-40">Anterior</button>
                    <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="rounded border px-2 py-1 disabled:opacity-40">Siguiente</button>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded border border-dashed p-4 text-xs text-slate-500">
                El detalle operativo esta oculto. Haz clic en "Ver detalle" para mostrar la tabla.
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
