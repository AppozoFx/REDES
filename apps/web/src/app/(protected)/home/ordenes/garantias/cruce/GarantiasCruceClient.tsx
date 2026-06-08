"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type ProviderGarantia = {
  key: string;
  id: string;
  codPedido: string;
  nombre: string;
  fechaAtencionYmd: string;
  fechaInstalacionYmd: string;
  solucionado: string;
  partner: string;
  tipoCierre: string;
  cuadrilla: string;
  diasDesdeInstalacion: number | null;
  rowNumber: number;
};

type RedesGarantia = {
  id: string;
  ordenId: string;
  codigoCliente: string;
  cliente: string;
  fechaGarantiaYmd: string;
  fechaInstalacionBase: string;
  diasDesdeInstalacion: number | null;
  estado: string;
  finalizada: boolean;
  cuadrilla: string;
  motivo: string;
  coordinadorUid: string;
  coordinadorNombre: string;
  recurrente: boolean;
};

type CruceRow = {
  status: "COINCIDE" | "COINCIDE_FECHA_DIFERENTE" | "PROVEEDOR_REDES_NO_FINALIZADA" | "SOLO_PROVEEDOR";
  statusLabel: string;
  exactFechaGarantia: boolean;
  exactFechaInstalacion: boolean;
  provider: ProviderGarantia;
  redes: RedesGarantia | null;
};

type PeriodInfo = {
  instYm: string;
  instFrom: string;
  instTo: string;
  garantiaFrom?: string;
  garantiaTo?: string;
  windowDays?: number;
  workbookName?: string;
  workbookSheet?: string;
  source?: {
    mode: "firestore" | "local";
    importId: string;
    fileName: string;
    sheetName: string;
    uploadedAtText: string;
  };
  powerBiUrl?: string;
  powerBiPartner?: string;
};

type KpiData = {
  proveedorGarantias: number;
  redesGarantiasFinalizadas: number;
  redesGarantiasTotal: number;
  instalacionesFinalizadas: number;
  proveedorTasaPct: number;
  redesTasaPct: number;
  brechaGarantias: number;
  brechaTasaPct: number;
  coincidenciasFinalizadas: number;
  proveedorSinRedes: number;
  proveedorRedesNoFinalizada: number;
  redesSinProveedor: number;
};

type Resp = {
  ok: true;
  noData?: true;
  period: PeriodInfo;
  kpi?: KpiData;
  series?: {
    providerByAttentionMonth: Array<{ ym: string; total: number }>;
    byDay: Array<{ ymd: string; proveedor: number; redes: number }>;
    byCuadrilla: Array<{ cuadrilla: string; proveedor: number; redes: number; diferencia: number }>;
  };
  detail?: {
    cruce: CruceRow[];
    redesSolo: RedesGarantia[];
    providerRows: ProviderGarantia[];
    redesFinalizadas: RedesGarantia[];
  };
};

type ViewKey = "resumen" | "coinciden" | "proveedor" | "soloProveedor" | "soloRedes";

// ─── Helpers de fecha/formato ─────────────────────────────────────────────────

function getDefaultInstYm(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const t = m - 2;
  if (t <= 0) return `${y - 1}-${String(12 + t).padStart(2, "0")}`;
  return `${y}-${String(t).padStart(2, "0")}`;
}

function prevMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}

function nextMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

function getPeriodStatus(instYm: string): "cerrado" | "ventana" | "actual" {
  const now = new Date();
  const cy = now.getFullYear();
  const cm = now.getMonth() + 1;
  const [iy, im] = instYm.split("-").map(Number);
  const diff = (cy - iy) * 12 + (cm - im);
  if (diff >= 2) return "cerrado";
  if (diff === 1) return "ventana";
  return "actual";
}

const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MONTH_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function formatPeriodLabel(ym: string) {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, m] = ym.split("-");
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}

function formatYm(ym: string) {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym || "-";
  const [y, m] = ym.split("-");
  return `${MONTH_SHORT[Number(m) - 1]} ${y}`;
}

function formatYmd(ymd: string) {
  const v = String(ymd || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "-";
  const [y, m, d] = v.split("-");
  return `${d}/${m}/${y}`;
}

function formatDateTime(value: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Lima",
  }).format(d);
}

function formatNum(n: number) {
  return new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(Number(n || 0));
}

function formatPct(n: number) {
  return `${formatNum(n)}%`;
}

// ─── Componentes UI ───────────────────────────────────────────────────────────

const VIEW_LABELS: Record<ViewKey, string> = {
  resumen: "Todo el cruce",
  coinciden: "Coinciden",
  proveedor: "WIN cuenta / REDES no finalizadas",
  soloProveedor: "Solo WIN",
  soloRedes: "Solo REDES",
};

function statusClass(status: CruceRow["status"]) {
  if (status === "COINCIDE") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "COINCIDE_FECHA_DIFERENTE") return "border-blue-200 bg-blue-50 text-blue-800";
  if (status === "PROVEEDOR_REDES_NO_FINALIZADA") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-rose-200 bg-rose-50 text-rose-800";
}

function PeriodBadge({ instYm }: { instYm: string }) {
  const status = getPeriodStatus(instYm);
  if (status === "cerrado") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Cerrado · Analisis completo
      </span>
    );
  }
  if (status === "ventana") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        En ventana · Garantias en curso
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
      <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
      Mes actual
    </span>
  );
}

function KpiCard({
  label,
  value,
  hint,
  sub,
  tone = "slate",
  size = "md",
}: {
  label: string;
  value: string | number;
  hint?: string;
  sub?: string;
  tone?: "slate" | "blue" | "emerald" | "amber" | "rose" | "indigo";
  size?: "md" | "lg";
}) {
  const toneClass =
    tone === "blue"
      ? "border-blue-200 bg-blue-50 text-blue-950"
      : tone === "emerald"
        ? "border-emerald-200 bg-emerald-50 text-emerald-950"
        : tone === "amber"
          ? "border-amber-200 bg-amber-50 text-amber-950"
          : tone === "rose"
            ? "border-rose-200 bg-rose-50 text-rose-950"
            : tone === "indigo"
              ? "border-indigo-200 bg-indigo-50 text-indigo-950"
              : "border-slate-200 bg-white text-slate-950";
  return (
    <div className={`rounded-xl border p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${toneClass}`}>
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`mt-2 tabular-nums font-bold ${size === "lg" ? "text-4xl" : "text-3xl"}`}>{value}</div>
      {sub ? <div className="mt-1 text-sm font-semibold tabular-nums">{sub}</div> : null}
      {hint ? <div className="mt-1.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{hint}</div> : null}
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-100">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

// ─── Exportar Excel ───────────────────────────────────────────────────────────

function toCruceExportRow(row: CruceRow) {
  return {
    estado_cruce: row.statusLabel,
    cod_pedido: row.provider.codPedido,
    cliente_excel: row.provider.nombre,
    fecha_instalacion_excel: row.provider.fechaInstalacionYmd,
    fecha_garantia_excel: row.provider.fechaAtencionYmd,
    dias_excel: row.provider.diasDesdeInstalacion ?? "",
    cuadrilla_excel: row.provider.cuadrilla,
    id_garantia_excel: row.provider.id,
    solucionado_excel: row.provider.solucionado,
    tipo_cierre_excel: row.provider.tipoCierre,
    orden_redes: row.redes?.ordenId || "",
    cliente_redes: row.redes?.cliente || "",
    fecha_instalacion_redes: row.redes?.fechaInstalacionBase || "",
    fecha_garantia_redes: row.redes?.fechaGarantiaYmd || "",
    dias_redes: row.redes?.diasDesdeInstalacion ?? "",
    estado_redes: row.redes?.estado || "",
    cuadrilla_redes: row.redes?.cuadrilla || "",
    coordinador_redes: row.redes?.coordinadorNombre || "",
    motivo_redes: row.redes?.motivo || "",
    fecha_garantia_igual: row.exactFechaGarantia ? "SI" : "NO",
    fecha_instalacion_igual: row.exactFechaInstalacion ? "SI" : "NO",
  };
}

function toRedesExportRow(row: RedesGarantia) {
  return {
    orden_redes: row.ordenId,
    cod_pedido: row.codigoCliente,
    cliente: row.cliente,
    fecha_instalacion_redes: row.fechaInstalacionBase,
    fecha_garantia_redes: row.fechaGarantiaYmd,
    dias_redes: row.diasDesdeInstalacion ?? "",
    estado_redes: row.estado,
    cuadrilla_redes: row.cuadrilla,
    coordinador_redes: row.coordinadorNombre,
    motivo_redes: row.motivo,
    recurrente: row.recurrente ? "SI" : "NO",
  };
}

function downloadWorkbook(data: Required<Pick<Resp, "period" | "kpi" | "series" | "detail">>) {
  const wb = XLSX.utils.book_new();
  const resumen = [
    ["Cruce de garantias"],
    [""],
    ["Periodo instalacion", data.period.instYm],
    ["Ventana garantia", `${data.period.garantiaFrom} a ${data.period.garantiaTo}`],
    ["Archivo", data.period.workbookName],
    ["Hoja", data.period.workbookSheet],
    ["Power BI", data.period.powerBiPartner],
    [""],
    ["Metrica", "Valor"],
    ["Garantias WIN", data.kpi.proveedorGarantias],
    ["Garantias REDES finalizadas", data.kpi.redesGarantiasFinalizadas],
    ["Instalaciones finalizadas", data.kpi.instalacionesFinalizadas],
    ["Tasa WIN", data.kpi.proveedorTasaPct],
    ["Tasa REDES", data.kpi.redesTasaPct],
    ["Brecha garantias", data.kpi.brechaGarantias],
    ["Coincidencias finalizadas", data.kpi.coincidenciasFinalizadas],
    ["WIN sin REDES", data.kpi.proveedorSinRedes],
    ["WIN con REDES no finalizada", data.kpi.proveedorRedesNoFinalizada],
    ["REDES sin WIN", data.kpi.redesSinProveedor],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), "Resumen");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.detail.cruce.map(toCruceExportRow)), "Cruce");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(data.detail.cruce.filter((r) => r.redes?.finalizada).map(toCruceExportRow)),
    "Coinciden"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(data.detail.cruce.filter((r) => !r.redes?.finalizada).map(toCruceExportRow)),
    "WIN revisar"
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.detail.redesSolo.map(toRedesExportRow)), "Solo REDES");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.series.byDay), "Por dia");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.series.byCuadrilla), "Por cuadrilla");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  saveAs(new Blob([out], { type: "application/octet-stream" }), `cruce_garantias_${data.period.instYm}.xlsx`);
}

// ─── Tablas de detalle ────────────────────────────────────────────────────────

function CruceTable({ rows }: { rows: CruceRow[] }) {
  if (!rows.length) {
    return <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Sin registros para esta vista.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500 dark:border-slate-700">
            <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Estado</th>
            <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Cod pedido</th>
            <th className="min-w-[220px] px-3 py-2.5 font-semibold">Cliente</th>
            <th className="whitespace-nowrap px-3 py-2.5 font-semibold">F. Instalacion</th>
            <th className="whitespace-nowrap px-3 py-2.5 font-semibold">F. Garantia</th>
            <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Estado</th>
            <th className="min-w-[160px] px-3 py-2.5 font-semibold">Cuadrilla</th>
            <th className="min-w-[200px] px-3 py-2.5 font-semibold">Motivo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((row) => (
            <tr key={row.provider.key} className="align-top hover:bg-slate-50 dark:hover:bg-slate-800/60">
              <td className="px-3 py-2.5">
                <span className={`inline-flex rounded-md border px-2 py-1 text-[11px] font-semibold ${statusClass(row.status)}`}>
                  {row.statusLabel}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 font-medium tabular-nums text-slate-900 dark:text-slate-100">
                {row.provider.codPedido || "-"}
                {row.provider.id ? <div className="text-[10px] font-normal text-slate-400">{row.provider.id}</div> : null}
              </td>
              <td className="px-3 py-2.5">
                <div className="font-medium text-slate-900 dark:text-slate-100">{row.provider.nombre || row.redes?.cliente || "-"}</div>
                {row.redes?.cliente && row.redes.cliente !== row.provider.nombre ? (
                  <div className="mt-0.5 text-xs text-slate-500">REDES: {row.redes.cliente}</div>
                ) : null}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">
                {formatYmd(row.redes?.fechaInstalacionBase || "")}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">
                {formatYmd(row.redes?.fechaGarantiaYmd || "")}
                {typeof row.redes?.diasDesdeInstalacion === "number" ? (
                  <div className="text-[10px] text-slate-400">{row.redes.diasDesdeInstalacion} dias</div>
                ) : null}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-slate-600 dark:text-slate-300">{row.redes?.estado || "-"}</td>
              <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">
                <div>{row.provider.cuadrilla || "-"}</div>
                {row.redes?.cuadrilla && row.redes.cuadrilla !== row.provider.cuadrilla ? (
                  <div className="mt-1 text-slate-400">REDES: {row.redes.cuadrilla}</div>
                ) : null}
              </td>
              <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">{row.redes?.motivo || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RedesSoloTable({ rows }: { rows: RedesGarantia[] }) {
  if (!rows.length) {
    return <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Sin garantias REDES fuera del Excel.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500 dark:border-slate-700">
            <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Cod pedido</th>
            <th className="min-w-[220px] px-3 py-2.5 font-semibold">Cliente</th>
            <th className="whitespace-nowrap px-3 py-2.5 font-semibold">F. instalacion</th>
            <th className="whitespace-nowrap px-3 py-2.5 font-semibold">F. garantia</th>
            <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Estado</th>
            <th className="min-w-[160px] px-3 py-2.5 font-semibold">Cuadrilla</th>
            <th className="min-w-[180px] px-3 py-2.5 font-semibold">Motivo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((row) => (
            <tr key={row.id} className="align-top hover:bg-slate-50 dark:hover:bg-slate-800/60">
              <td className="whitespace-nowrap px-3 py-2.5 font-medium tabular-nums text-slate-900 dark:text-slate-100">
                {row.codigoCliente || "-"}
                <div className="text-[10px] font-normal text-slate-400">{row.ordenId}</div>
              </td>
              <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100">{row.cliente || "-"}</td>
              <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">{formatYmd(row.fechaInstalacionBase)}</td>
              <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-600 dark:text-slate-300">
                {formatYmd(row.fechaGarantiaYmd)}
                {typeof row.diasDesdeInstalacion === "number" ? <div className="text-[10px] text-slate-400">{row.diasDesdeInstalacion} dias</div> : null}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-slate-600 dark:text-slate-300">{row.estado || "-"}</td>
              <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">{row.cuadrilla || "-"}</td>
              <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">{row.motivo || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function GarantiasCruceClient() {
  const [instYm, setInstYm] = useState(() => {
    if (typeof window === "undefined") return getDefaultInstYm();
    const fromUrl = new URLSearchParams(window.location.search).get("instYm") || "";
    return /^\d{4}-\d{2}$/.test(fromUrl) ? fromUrl : getDefaultInstYm();
  });
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<ViewKey>("resumen");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    async function load() {
      setLoading(true);
      setError("");
      setData(null);
      try {
        const res = await fetch(`/api/ordenes/garantias/cruce?instYm=${encodeURIComponent(instYm)}`, {
          cache: "no-store",
          signal: ctrl.signal,
        });
        const json = await res.json();
        if (!res.ok || !json?.ok) throw new Error(String(json?.error || "ERROR"));
        if (!cancelled) setData(json);
      } catch (e: any) {
        if (!cancelled && e?.name !== "AbortError") {
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
  }, [instYm]);

  const filteredCruce = useMemo(() => {
    const q = search.trim().toUpperCase();
    const base = data?.detail?.cruce || [];
    const byView = base.filter((row) => {
      if (view === "coinciden") return Boolean(row.redes?.finalizada);
      if (view === "proveedor") return !row.redes?.finalizada;
      if (view === "soloProveedor") return row.status === "SOLO_PROVEEDOR";
      return view === "resumen";
    });
    if (!q) return byView;
    return byView.filter((row) => {
      const txt = [
        row.provider.codPedido,
        row.provider.nombre,
        row.provider.id,
        row.provider.cuadrilla,
        row.redes?.ordenId,
        row.redes?.cliente,
        row.redes?.cuadrilla,
        row.statusLabel,
      ]
        .filter(Boolean)
        .join(" ")
        .toUpperCase();
      return txt.includes(q);
    });
  }, [data?.detail?.cruce, search, view]);

  const filteredRedesSolo = useMemo(() => {
    const rows = data?.detail?.redesSolo || [];
    const q = search.trim().toUpperCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.codigoCliente, row.cliente, row.ordenId, row.cuadrilla, row.motivo].filter(Boolean).join(" ").toUpperCase().includes(q)
    );
  }, [data?.detail?.redesSolo, search]);

  const viewCounts = useMemo(() => {
    const cruce = data?.detail?.cruce || [];
    return {
      resumen: cruce.length,
      coinciden: cruce.filter((row) => row.redes?.finalizada).length,
      proveedor: cruce.filter((row) => !row.redes?.finalizada).length,
      soloProveedor: cruce.filter((row) => row.status === "SOLO_PROVEEDOR").length,
      soloRedes: data?.detail?.redesSolo?.length || 0,
    };
  }, [data?.detail?.cruce, data?.detail?.redesSolo]);

  const proveedorByMonthLabel = useMemo(() => {
    if (!data?.series?.providerByAttentionMonth?.length) return null;
    return data.series.providerByAttentionMonth.map((row) => `${formatYm(row.ym)}: ${row.total}`).join(" | ");
  }, [data?.series?.providerByAttentionMonth]);

  const matchPct = useMemo(() => {
    const kpi = data?.kpi;
    if (!kpi || !kpi.proveedorGarantias) return null;
    return Number(((kpi.coincidenciasFinalizadas / kpi.proveedorGarantias) * 100).toFixed(1));
  }, [data?.kpi]);

  const periodLabel = formatPeriodLabel(instYm);
  const hasKpi = data && !data.noData && data.kpi;

  return (
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-widest text-[#30518c]">Garantias · Analisis de Cruce</div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-950 dark:text-slate-100">
                Power BI · REDES
              </h1>
              <PeriodBadge instYm={instYm} />
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Instalaciones de <span className="font-semibold text-slate-700 dark:text-slate-200">{periodLabel}</span> · Ventana de garantia de 30 dias desde la instalacion
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            {/* Navegacion de mes */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setInstYm(prevMonth(instYm))}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                title="Mes anterior"
              >
                ‹
              </button>
              <input
                type="month"
                value={instYm}
                onChange={(e) => setInstYm(e.target.value || getDefaultInstYm())}
                className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#30518c] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() => setInstYm(nextMonth(instYm))}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                title="Mes siguiente"
              >
                ›
              </button>
            </div>

            {hasKpi && data.kpi ? (
              <button
                type="button"
                onClick={() => downloadWorkbook(data as any)}
                className="h-9 rounded-md bg-[#30518c] px-4 text-sm font-semibold text-white transition hover:bg-[#263f73]"
              >
                Exportar Excel
              </button>
            ) : null}
            <Link
              href="/home/garantias/cruce/cargas"
              className="flex h-9 items-center rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cargar Excel
            </Link>
            {data?.period?.powerBiUrl ? (
              <a
                href={data.period.powerBiUrl}
                target="_blank"
                rel="noreferrer"
                className="flex h-9 items-center rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Power BI
              </a>
            ) : null}
          </div>
        </div>

        {/* Metadata de la carga */}
        {data && !data.noData && data.period.source ? (
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <span className="font-medium">Archivo:</span> {data.period.source.fileName || data.period.workbookName}
            </span>
            {data.period.source.sheetName ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <span className="font-medium">Hoja:</span> {data.period.source.sheetName}
              </span>
            ) : null}
            {data.period.source.uploadedAtText ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <span className="font-medium">Cargado:</span> {formatDateTime(data.period.source.uploadedAtText)}
              </span>
            ) : null}
            {data.period.powerBiPartner ? (
              <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {data.period.powerBiPartner}
              </span>
            ) : null}
            {proveedorByMonthLabel ? (
              <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                Atenciones: {proveedorByMonthLabel}
              </span>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
          <span className="font-semibold">Error al cargar:</span> {error}
        </div>
      ) : null}

      {/* ── Loading ──────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-8 text-center dark:border-slate-700 dark:bg-slate-900">
          <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-[#30518c]" />
          <p className="text-sm text-slate-500">Cargando analisis de garantias de {periodLabel}...</p>
        </div>
      ) : null}

      {/* ── Sin datos ───────────────────────────────────────────────────── */}
      {!loading && data?.noData ? (
        <section className="rounded-xl border-2 border-dashed border-slate-200 bg-white px-8 py-16 text-center dark:border-slate-700 dark:bg-slate-900">
          <div className="mx-auto max-w-md">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
              <svg className="h-7 w-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Sin datos para {periodLabel}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
              No hay Excel del proveedor cargado para este periodo.
              Carga el archivo de garantias para iniciar el analisis de cruce.
            </p>
            <Link
              href="/home/garantias/cruce/cargas"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#30518c] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#263f73]"
            >
              Cargar Excel del proveedor
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>
        </section>
      ) : null}

      {/* ── Datos cargados ───────────────────────────────────────────────── */}
      {!loading && hasKpi && data.kpi && data.series && data.detail ? (
        <>
          {/* KPIs */}
          <section className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            <KpiCard
              label="WIN"
              value={data.kpi.proveedorGarantias}
              tone="blue"
              hint={`${formatPct(data.kpi.proveedorTasaPct)} de ${formatNum(data.kpi.instalacionesFinalizadas)} instalaciones`}
            />
            <KpiCard
              label="REDES finalizadas"
              value={data.kpi.redesGarantiasFinalizadas}
              tone="emerald"
              hint={`${formatPct(data.kpi.redesTasaPct)} del mismo denominador`}
            />
            <KpiCard
              label="Tasa de coincidencia"
              value={matchPct !== null ? `${matchPct}%` : "-"}
              tone={matchPct !== null && matchPct >= 70 ? "emerald" : matchPct !== null && matchPct >= 50 ? "amber" : "rose"}
              hint={`${data.kpi.coincidenciasFinalizadas} de ${data.kpi.proveedorGarantias} registros de WIN`}
            />
            <KpiCard
              label="Brecha"
              value={data.kpi.brechaGarantias}
              tone={data.kpi.brechaGarantias > 0 ? "amber" : "slate"}
              hint={`${formatPct(Math.abs(data.kpi.brechaTasaPct))} pts de diferencia`}
            />
            <KpiCard
              label="Revisar"
              value={data.kpi.proveedorSinRedes + data.kpi.proveedorRedesNoFinalizada}
              tone="rose"
              hint={`${data.kpi.proveedorSinRedes} sin REDES · ${data.kpi.proveedorRedesNoFinalizada} no finalizadas`}
            />
            <KpiCard
              label="Solo REDES"
              value={data.kpi.redesSinProveedor}
              tone="amber"
              hint="Finalizadas no reportadas por WIN"
            />
          </section>

          {/* Graficos */}
          <section className="grid gap-4 xl:grid-cols-[1.4fr_.6fr]">
            <Panel title="Garantias por fecha de atencion" subtitle={`WIN vs REDES finalizadas · ${periodLabel}`}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.series.byDay} margin={{ left: 0, right: 12, top: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="ymd" tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={formatYmd} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip
                      contentStyle={{ borderRadius: "10px", border: "1px solid #e2e8f0", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,.08)" }}
                      labelFormatter={(v) => formatYmd(String(v))}
                      formatter={(value, name) => [value, name === "proveedor" ? "WIN" : "REDES"]}
                    />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 10 }} formatter={(v) => (v === "proveedor" ? "WIN" : "REDES")} />
                    <Bar dataKey="proveedor" fill="#30518c" radius={[4, 4, 0, 0]} maxBarSize={24} />
                    <Bar dataKey="redes" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Brecha por cuadrilla" subtitle="Top 20 diferencias absolutas">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500 dark:border-slate-700">
                      <th className="px-3 py-2 font-semibold">Cuadrilla</th>
                      <th className="px-3 py-2 text-right font-semibold">WIN</th>
                      <th className="px-3 py-2 text-right font-semibold">REDES</th>
                      <th className="px-3 py-2 text-right font-semibold">Dif.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.series.byCuadrilla.map((row) => (
                      <tr key={row.cuadrilla} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                        <td className="max-w-[180px] truncate px-3 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100">{row.cuadrilla || "-"}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{row.proveedor}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{row.redes}</td>
                        <td className={`px-3 py-1.5 text-right tabular-nums font-bold ${row.diferencia > 0 ? "text-rose-600" : row.diferencia < 0 ? "text-amber-600" : "text-emerald-600"}`}>
                          {row.diferencia > 0 ? `+${row.diferencia}` : row.diferencia}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </section>

          {/* Detalle */}
          <Panel
            title="Detalle del cruce"
            subtitle={`${view === "soloRedes" ? filteredRedesSolo.length : filteredCruce.length} registros visibles`}
          >
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(VIEW_LABELS) as ViewKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setView(key)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                      view === key
                        ? "border-[#30518c] bg-[#30518c] text-white shadow-sm"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    {VIEW_LABELS[key]} ({viewCounts[key]})
                  </button>
                ))}
              </div>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar codigo, cliente o cuadrilla..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#30518c] lg:max-w-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            {view === "soloRedes" ? <RedesSoloTable rows={filteredRedesSolo} /> : <CruceTable rows={filteredCruce} />}
          </Panel>
        </>
      ) : null}
    </div>
  );
}
