"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import "leaflet/dist/leaflet.css";
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
const MapContainer = dynamic(() => import("react-leaflet").then((m) => ({ default: m.MapContainer })), { ssr: false }) as ComponentType<any>;
const TileLayer = dynamic(() => import("react-leaflet").then((m) => ({ default: m.TileLayer })), { ssr: false }) as ComponentType<any>;
const CircleMarker = dynamic(() => import("react-leaflet").then((m) => ({ default: m.CircleMarker })), { ssr: false }) as ComponentType<any>;
const PopupMap = dynamic(() => import("react-leaflet").then((m) => ({ default: m.Popup })), { ssr: false }) as ComponentType<any>;

type Resp = {
  ok: true;
  period: { fromYmd: string; toYmd: string; label: string; mode: Mode };
  periodPrev?: { fromYmd: string; toYmd: string; label: string };
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
  kpiPrev?: {
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
    byRegionDistritoFinalizadas: Array<{ regionOrden: string; distritoOrden: string; totalFinalizadas: number; label: string }>;
    finalizadasMap: Array<{
      id: string;
      lat: number;
      lng: number;
      cliente: string;
      cuadrilla: string;
      regionOrden: string;
      distritoOrden: string;
      ymd: string;
    }>;
  };
  filtersMeta: {
    cuadrillas: Array<{ id: string; nombre: string }>;
    regionesOrdenes: string[];
    distritosOrdenes: string[];
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
      distritoOrden: string;
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

function extractDistritoLabel(fullName: string) {
  const raw = String(fullName || "").trim();
  if (!raw) return "";
  const parenRegion = raw.match(/^(.*?)\s*\(\s*REGION\b.*\)$/i);
  if (parenRegion?.[1]) return parenRegion[1].trim();
  const dashRegion = raw.match(/^(.*?)\s*-\s*REGION\b.*$/i);
  if (dashRegion?.[1]) return dashRegion[1].trim();
  if (/^REGION\b/i.test(raw) && raw.includes("/")) {
    const parts = raw.split("/").map((x) => x.trim()).filter(Boolean);
    if (parts.length > 1) return parts[parts.length - 1];
  }
  return raw;
}

function truncateLabel(s: string, max = 16) {
  const v = String(s || "");
  return v.length > max ? `${v.slice(0, max - 1)}…` : v;
}

function StatCard({
  title,
  value,
  hint,
  delta,
  deltaMode = "abs",
  tone = "slate",
}: {
  title: string;
  value: string | number;
  hint?: string;
  delta?: number;
  deltaMode?: "abs" | "pp";
  tone?: "slate" | "emerald" | "amber" | "indigo" | "rose";
}) {
  const badgeCls =
    tone === "emerald"
      ? "bg-emerald-100 text-emerald-700"
      : tone === "amber"
      ? "bg-amber-100 text-amber-700"
      : tone === "indigo"
      ? "bg-indigo-100 text-indigo-700"
      : tone === "rose"
      ? "bg-rose-100 text-rose-700"
      : "bg-slate-100 text-slate-700";
  const d = Number(delta || 0);
  const deltaIcon = d > 0 ? "▲" : d < 0 ? "▼" : "•";
  const deltaText =
    deltaMode === "pp"
      ? `${d > 0 ? "+" : ""}${d.toFixed(1)} pts`
      : `${d > 0 ? "+" : ""}${Math.round(d)}`;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-medium text-slate-500">{title}</div>
      <div className="mt-1 flex items-end gap-2">
        <div className="text-4xl font-extrabold tracking-tight text-slate-900">{value}</div>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${badgeCls}`}>
          {deltaIcon} {deltaText}
        </span>
      </div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}

function RegionDistritoTick({
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
  const raw = labelByKey.get(key) ?? key;
  const visible = truncateLabel(extractDistritoLabel(raw), 14);
  const tx = typeof x === "string" ? Number(x) : (x ?? 0);
  const ty = typeof y === "string" ? Number(y) : (y ?? 0);
  return (
    <g transform={`translate(${tx},${ty})`}>
      <text x={0} y={0} dy={14} textAnchor="end" transform="rotate(-28)" fill="#475569" fontSize={11}>
        {visible}
      </text>
    </g>
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
  const [mode, setMode] = useState<Mode>("day");
  const [ymd, setYmd] = useState(todayLimaYmd());
  const [ym, setYm] = useState(todayLimaYm());
  const [from, setFrom] = useState(todayLimaYmd());
  const [to, setTo] = useState(todayLimaYmd());
  const [rangeInitialized, setRangeInitialized] = useState(false);

  const [fCuadrilla, setFCuadrilla] = useState("");
  const [debouncedFCuadrilla, setDebouncedFCuadrilla] = useState("");
  const [fBusqueda, setFBusqueda] = useState("");
  const [debouncedFBusqueda, setDebouncedFBusqueda] = useState("");
  const [fRegionOrden, setFRegionOrden] = useState("");
  const [fDistritoOrden, setFDistritoOrden] = useState("");
  const [gestorUid, setGestorUid] = useState("");
  const [coordinadorUid, setCoordinadorUid] = useState("");
  const [tipoOrden, setTipoOrden] = useState("");
  const [soloNoLiquidadas, setSoloNoLiquidadas] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(200);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<Resp | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const fetchSeqRef = useRef(0);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const panelClass = "overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900";
  const inputClass = "rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900";
  const compactInputClass = "rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900";
  const primaryButtonClass = "rounded-xl bg-[#30518c] px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50";
  const secondaryButtonClass = "rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";
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
    return Array.from(acc.values()).sort((a, b) => {
      if ((b.finalizadas || 0) !== (a.finalizadas || 0)) return (b.finalizadas || 0) - (a.finalizadas || 0);
      if ((b.canceladas || 0) !== (a.canceladas || 0)) return (b.canceladas || 0) - (a.canceladas || 0);
      return String(a.cuadrillaLabel || "").localeCompare(String(b.cuadrillaLabel || ""), "es", {
        sensitivity: "base",
      });
    });
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
  const dataRegionDistritoFinalizadas = useMemo(
    () =>
      [...(data?.series.byRegionDistritoFinalizadas || [])]
        .map((r, idx) => {
          const region = String(r.regionOrden || "").trim();
          const distrito = String(r.distritoOrden || "").trim();
          const keyBase = distrito ? `${region} / ${distrito}` : region || "SIN REGION";
          const categoryKey = `${keyBase}__${idx}`;
          const fullLabel = distrito && region ? `${distrito} (${region})` : String(r.label || distrito || region || "SIN REGION");
          return {
            ...r,
            categoryKey,
            fullLabel,
            label: extractDistritoLabel(fullLabel),
          };
        })
        .sort((a, b) => b.totalFinalizadas - a.totalFinalizadas)
        .slice(0, 30),
    [data]
  );
  const finalizadasMapPoints = useMemo(() => data?.series.finalizadasMap || [], [data]);
  const finalizadasMapCenter = useMemo<[number, number]>(() => {
    if (!finalizadasMapPoints.length) return [-12.0464, -77.0428];
    const sum = finalizadasMapPoints.reduce(
      (acc, p) => {
        acc.lat += Number(p.lat || 0);
        acc.lng += Number(p.lng || 0);
        return acc;
      },
      { lat: 0, lng: 0 }
    );
    return [sum.lat / finalizadasMapPoints.length, sum.lng / finalizadasMapPoints.length];
  }, [finalizadasMapPoints]);
  const labelByRegionDistritoKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of dataRegionDistritoFinalizadas) {
      m.set(String(r.categoryKey), String(r.label));
    }
    return m;
  }, [dataRegionDistritoFinalizadas]);
  const fullLabelByRegionDistritoKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of dataRegionDistritoFinalizadas) {
      m.set(String(r.categoryKey), String(r.fullLabel || r.label || r.categoryKey));
    }
    return m;
  }, [dataRegionDistritoFinalizadas]);
  const kpiDelta = useMemo(() => {
    const prev = data?.kpiPrev;
    if (!data || !prev) {
      return { finalizadas: 0, pendientes: 0, efectividadPct: 0, liquidadas: 0, pendientesLiquidar: 0 };
    }
    return {
      finalizadas: data.kpi.finalizadas - prev.finalizadas,
      pendientes: data.kpi.pendientes - prev.pendientes,
      efectividadPct: data.kpi.efectividadPct - prev.efectividadPct,
      liquidadas: data.kpi.liquidadas - prev.liquidadas,
      pendientesLiquidar: data.kpi.pendientesLiquidar - prev.pendientesLiquidar,
    };
  }, [data]);
  const kpiMetaProyeccion = useMemo(() => {
    if (!data) {
      return {
        diasMes: 0,
        diasTranscurridos: 0,
        proyectadoFinMes: 0,
        metaMensual: 0,
        metaDiariaRequerida: 0,
        metaDiariaObjetivo: 0,
        metaDiaObjetivo: 0,
        cumplimientoMetaDiaPct: 0,
        avanceMetaMensualPct: 0,
      };
    }
    const [y, m] = String(data.period.fromYmd || "").split("-").map((v) => Number(v));
    const diasMes = y && m ? new Date(y, m, 0).getDate() : 30;
    const today = new Date();
    const todayYm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const selectedYm = `${String(data.period.fromYmd || "").slice(0, 7)}`;
    const diasTranscurridos =
      selectedYm === todayYm
        ? Math.max(1, Math.min(today.getDate(), diasMes))
        : diasMes;
    const acumulado = Number(data.kpi.finalizadas || 0);
    const proyectadoFinMes = diasTranscurridos > 0 ? (acumulado / diasTranscurridos) * diasMes : 0;
    const metaMensual = Number(data.kpiPrev?.finalizadas || 0);
    const metaDiariaObjetivo = metaMensual > 0 && diasMes > 0 ? metaMensual / diasMes : 0;
    const metaDiaObjetivo = Number(data.kpiPrev?.finalizadas || 0);
    const cumplimientoMetaDiaPct = metaDiaObjetivo > 0 ? (acumulado / metaDiaObjetivo) * 100 : 0;
    const avanceMetaMensualPct = metaMensual > 0 ? (acumulado / metaMensual) * 100 : 0;
    const diasRestantes = Math.max(diasMes - diasTranscurridos, 0);
    const metaDiariaRequerida =
      metaMensual > 0 && diasRestantes > 0
        ? Math.max(metaMensual - acumulado, 0) / diasRestantes
        : 0;
    return {
      diasMes,
      diasTranscurridos,
      proyectadoFinMes,
      metaMensual,
      metaDiariaRequerida,
      metaDiariaObjetivo,
      metaDiaObjetivo,
      cumplimientoMetaDiaPct,
      avanceMetaMensualPct,
    };
  }, [data]);
  const labelByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of chartCuadrillas.data) {
      m.set(r.cuadrillaKey, r.label);
    }
    return m;
  }, [chartCuadrillas.data]);
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedFCuadrilla(fCuadrilla.trim());
    }, 450);
    return () => clearTimeout(t);
  }, [fCuadrilla]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedFBusqueda(fBusqueda.trim());
    }, 450);
    return () => clearTimeout(t);
  }, [fBusqueda]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rangeParam = (params.get("range") || "").toLowerCase();
    if (rangeParam === "day" || rangeParam === "week" || rangeParam === "month" || rangeParam === "range") {
      setMode(rangeParam as Mode);
    } else {
      params.set("range", "day");
      const next = `${window.location.pathname}?${params.toString()}${window.location.hash || ""}`;
      window.history.replaceState(null, "", next);
    }
    setRangeInitialized(true);
  }, []);

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

  const fetchData = async (overrideCuadrilla?: string) => {
    const requestId = fetchSeqRef.current + 1;
    fetchSeqRef.current = requestId;
    fetchAbortRef.current?.abort();
    const abortController = new AbortController();
    fetchAbortRef.current = abortController;

    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      qs.set("range", mode);
      qs.set("mode", mode);
      qs.set("ymd", ymd);
      qs.set("ym", ym);
      qs.set("from", from);
      qs.set("to", to);
      qs.set("page", String(page));
      qs.set("pageSize", String(pageSize));
      const searchFilter = debouncedFBusqueda.trim();
      if (searchFilter) qs.set("q", searchFilter);
      const cuadrillaFilter = (overrideCuadrilla ?? debouncedFCuadrilla).trim();
      if (cuadrillaFilter) qs.set("cuadrilla", cuadrillaFilter);
      if (fRegionOrden) qs.set("regionOrden", fRegionOrden);
      if (fDistritoOrden) qs.set("distritoOrden", fDistritoOrden);
      if (gestorUid) qs.set("gestorUid", gestorUid);
      if (coordinadorUid) qs.set("coordinadorUid", coordinadorUid);
      if (tipoOrden) qs.set("tipoOrden", tipoOrden);
      if (soloNoLiquidadas) qs.set("soloNoLiquidadas", "1");

      const res = await fetch(`/api/instalaciones/dashboard?${qs.toString()}`, {
        cache: "no-store",
        signal: abortController.signal,
      });
      const body = await res.json();
      if (requestId !== fetchSeqRef.current) return;
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      setData(body as Resp);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      if (requestId !== fetchSeqRef.current) return;
      setData(null);
      setError(String(e?.message || "ERROR"));
    } finally {
      if (requestId === fetchSeqRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!rangeInitialized) return;
    fetchData();
  }, [rangeInitialized, mode, ymd, ym, from, to, debouncedFBusqueda, debouncedFCuadrilla, fRegionOrden, fDistritoOrden, gestorUid, coordinadorUid, tipoOrden, soloNoLiquidadas, page, pageSize]);

  useEffect(() => {
    return () => {
      fetchAbortRef.current?.abort();
    };
  }, []);

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
      <section className="sticky top-0 z-20 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-300">Periodo</label>
            <select
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as Mode);
                setPage(1);
              }}
              className={compactInputClass}
            >
              <option value="day">Dia</option>
              <option value="week">Semana</option>
              <option value="month">Mes</option>
              <option value="range">Rango</option>
            </select>
          </div>
          {mode === "day" || mode === "week" ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-300">Fecha base</label>
              <input type="date" value={ymd} onChange={(e) => setYmd(e.target.value)} className={compactInputClass} />
            </div>
          ) : null}
          {mode === "month" ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-300">Mes</label>
              <input type="month" value={ym} onChange={(e) => setYm(e.target.value)} className={compactInputClass} />
            </div>
          ) : null}
          {mode === "range" ? (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-300">Desde</label>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={compactInputClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-300">Hasta</label>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={compactInputClass} />
              </div>
            </>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => fetchData(fCuadrilla)} className={secondaryButtonClass}>
              Actualizar
            </button>
            <button onClick={exportCurrentPage} disabled={!data?.detail.items?.length} className={primaryButtonClass}>
              Exportar pagina
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-3 xl:grid-cols-8 dark:border-slate-700 dark:bg-slate-800/50">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Buscar orden</label>
            <input
              type="text"
              value={fBusqueda}
              onChange={(e) => {
                setFBusqueda(e.target.value);
                setPage(1);
              }}
              placeholder="Orden, codigo o cliente"
              className={`w-full ${inputClass}`}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Cuadrilla</label>
            <input
              value={fCuadrilla}
              onChange={(e) => {
                setFCuadrilla(e.target.value);
                setPage(1);
              }}
              placeholder="Escribe para filtrar"
              autoComplete="off"
              className={`w-full ${inputClass}`}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Region (Ordenes)</label>
            <select value={fRegionOrden} onChange={(e) => { setFRegionOrden(e.target.value); setPage(1); }} className={`w-full ${inputClass}`}>
              <option value="">Todas</option>
              {(data?.filtersMeta.regionesOrdenes || []).map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Distrito (Ordenes)</label>
            <select value={fDistritoOrden} onChange={(e) => { setFDistritoOrden(e.target.value); setPage(1); }} className={`w-full ${inputClass}`}>
              <option value="">Todos</option>
              {(data?.filtersMeta.distritosOrdenes || []).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Gestor</label>
            <select value={gestorUid} onChange={(e) => { setGestorUid(e.target.value); setPage(1); }} className={`w-full ${inputClass}`}>
              <option value="">Todos</option>
              {(data?.filtersMeta.gestores || []).map((g) => (
                <option key={g.uid} value={g.uid}>{g.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Coordinador</label>
            <select value={coordinadorUid} onChange={(e) => { setCoordinadorUid(e.target.value); setPage(1); }} className={`w-full ${inputClass}`}>
              <option value="">Todos</option>
              {(data?.filtersMeta.coordinadores || []).map((c) => (
                <option key={c.uid} value={c.uid}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">CONDOMINIO / RESIDENCIAL</label>
            <select value={tipoOrden} onChange={(e) => { setTipoOrden(e.target.value); setPage(1); }} className={`w-full ${inputClass}`}>
              <option value="">Todos</option>
              {(data?.filtersMeta.tiposOrden || []).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <label className="inline-flex items-center gap-2 self-end rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
            <input type="checkbox" checked={soloNoLiquidadas} onChange={(e) => { setSoloNoLiquidadas(e.target.checked); setPage(1); }} />
            Solo no liquidadas
          </label>
        </div>
      </section>

      {loading && !data ? <div className="rounded border border-slate-200 bg-white p-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Cargando dashboard...</div> : null}
      {loading && data ? <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">Actualizando datos...</div> : null}
      {error ? <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      {!error && data ? (
        <>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <StatCard title="Finalizadas" value={data.kpi.finalizadas} tone="emerald" delta={kpiDelta.finalizadas} hint={data.periodPrev?.label ? `Vs ${data.periodPrev.label}` : undefined} />
            <StatCard
              title={mode === "month" ? "Meta diaria" : "Meta del dia"}
              value={mode === "month" ? kpiMetaProyeccion.metaDiariaObjetivo.toFixed(1) : kpiMetaProyeccion.metaDiaObjetivo.toFixed(1)}
              tone="slate"
              hint={
                mode === "month"
                  ? `Avance meta mensual: ${kpiMetaProyeccion.avanceMetaMensualPct.toFixed(1)}%`
                  : `Base: ${data.periodPrev?.label || "Dia anterior"}`
              }
            />
            {mode === "month" ? (
              <StatCard
                title="Proyectado fin de mes"
                value={Math.round(kpiMetaProyeccion.proyectadoFinMes)}
                tone="amber"
                hint={`${data.kpi.finalizadas}/${kpiMetaProyeccion.diasTranscurridos} dias`}
              />
            ) : (
              <StatCard
                title="Cumplimiento meta del dia"
                value={`${kpiMetaProyeccion.cumplimientoMetaDiaPct.toFixed(1)}%`}
                tone="amber"
                hint="Finalizadas del periodo / Meta del dia"
              />
            )}
            <StatCard title="Efectividad" value={`${data.kpi.efectividadPct.toFixed(1)}%`} tone="indigo" delta={kpiDelta.efectividadPct} deltaMode="pp" />
            <StatCard title="Liquidadas" value={data.kpi.liquidadas} tone="slate" delta={kpiDelta.liquidadas} />
            <StatCard title="Pendientes de liquidar" value={data.kpi.pendientesLiquidar} tone="rose" hint="Finalizadas aun no liquidadas" delta={kpiDelta.pendientesLiquidar} />
          </section>

          <section>
            <div className={panelClass}>
              <div className="p-4">
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
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            {mode === "month" ? (
              <div className={panelClass}>
                <div className="p-4">
                <h2 className="text-sm font-semibold">Finalizadas por dia (Total)</h2>
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
              </div>
            ) : (
              <div className={panelClass}>
                <div className="p-4">
                <h2 className="text-sm font-semibold">Finalizadas por dia</h2>
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
                  Este grafico se habilita cuando el periodo esta en modo Mes.
                </div>
                </div>
              </div>
            )}

            <div className={panelClass}>
              <div className="p-4">
              <h2 className="text-sm font-semibold">Finalizadas por Region/Distrito (Ordenes)</h2>
              <div className="mt-3 h-72">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={dataRegionDistritoFinalizadas}
                    margin={{ top: 8, right: 16, left: 0, bottom: 56 }}
                    barCategoryGap="18%"
                    barGap={4}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="categoryKey"
                      interval={0}
                      height={96}
                      allowDuplicatedCategory={false}
                      tick={(props) => <RegionDistritoTick {...props} labelByKey={labelByRegionDistritoKey} />}
                    />
                    <YAxis allowDecimals={false} />
                    <Tooltip
                      labelFormatter={(k) => {
                        const key = String(k);
                        return fullLabelByRegionDistritoKey.get(key) ?? key;
                      }}
                    />
                    <Legend />
                    <Bar
                      dataKey="totalFinalizadas"
                      name="Finalizadas"
                      fill="#10b981"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              </div>
            </div>

            <div className={panelClass}>
              <div className="p-4">
              <h2 className="text-sm font-semibold">Mapa de Finalizadas</h2>
              <div className="mt-3 h-72 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                {finalizadasMapPoints.length ? (
                  <MapContainer center={finalizadasMapCenter} zoom={11} scrollWheelZoom className="h-full w-full">
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {finalizadasMapPoints.map((p) => (
                      <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={6} pathOptions={{ color: "#10b981", fillColor: "#10b981", fillOpacity: 0.85 }}>
                        <PopupMap>
                          <div className="text-xs">
                            <div><b>Cliente:</b> {p.cliente || "-"}</div>
                            <div><b>Cuadrilla:</b> {p.cuadrilla || "-"}</div>
                            <div><b>Region:</b> {p.regionOrden || "-"}</div>
                            <div><b>Distrito:</b> {p.distritoOrden || "-"}</div>
                            <div><b>Fecha:</b> {p.ymd || "-"}</div>
                          </div>
                        </PopupMap>
                      </CircleMarker>
                    ))}
                  </MapContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-slate-500">
                    No hay coordenadas de finalizadas para los filtros seleccionados.
                  </div>
                )}
              </div>
              </div>
            </div>

            <div className={panelClass}>
              <div className="p-4">
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
            </div>
          </section>

          <section className={panelClass}>
            <div className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Detalle operativo</h2>
              <button
                type="button"
                onClick={() => setShowDetail((v) => !v)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {showDetail ? "Ocultar detalle" : "Ver detalle"}
              </button>
            </div>
            {showDetail ? (
              <>
                <div className="mb-3 flex items-center justify-between text-xs">
                  <span className="text-slate-600 dark:text-slate-300">Total: {data.detail.total}</span>
                  <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="ui-select-inline rounded-lg border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900">
                    {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n}/pag</option>)}
                  </select>
                </div>
                <div className="overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="min-w-[1200px] w-full text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100">
                      <tr>
                        <th className="whitespace-nowrap border-b border-slate-200 px-2 py-2 text-left dark:border-slate-700">Fecha</th>
                        <th className="whitespace-nowrap border-b border-slate-200 px-2 py-2 text-left dark:border-slate-700">Orden</th>
                        <th className="whitespace-nowrap border-b border-slate-200 px-2 py-2 text-left dark:border-slate-700">Codigo</th>
                        <th className="whitespace-nowrap border-b border-slate-200 px-2 py-2 text-left dark:border-slate-700">Cliente</th>
                        <th className="whitespace-nowrap border-b border-slate-200 px-2 py-2 text-left dark:border-slate-700">Cuadrilla</th>
                        <th className="whitespace-nowrap border-b border-slate-200 px-2 py-2 text-left dark:border-slate-700">Estado</th>
                        <th className="whitespace-nowrap border-b border-slate-200 px-2 py-2 text-left dark:border-slate-700">Tipo</th>
                        <th className="whitespace-nowrap border-b border-slate-200 px-2 py-2 text-left dark:border-slate-700">Gestor</th>
                        <th className="whitespace-nowrap border-b border-slate-200 px-2 py-2 text-left dark:border-slate-700">Coordinador</th>
                        <th className="whitespace-nowrap border-b border-slate-200 px-2 py-2 text-left dark:border-slate-700">Liquidado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.detail.items.map((x) => (
                        <tr key={x.id} className="odd:bg-white even:bg-slate-50/60 dark:odd:bg-slate-900 dark:even:bg-slate-800/60">
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
                          <td colSpan={10} className="px-2 py-8 text-center text-slate-500 dark:text-slate-300">No hay resultados.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-slate-600 dark:text-slate-300">Pagina {page} de {totalPages}</span>
                  <div className="flex items-center gap-2">
                    <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-slate-300 px-3 py-1 text-sm disabled:opacity-40 dark:border-slate-600">Anterior</button>
                    <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="rounded-lg border border-slate-300 px-3 py-1 text-sm disabled:opacity-40 dark:border-slate-600">Siguiente</button>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
                El detalle operativo esta oculto. Haz clic en "Ver detalle" para mostrar la tabla.
              </div>
            )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
