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

type Resp = {
  ok: true;
  period: {
    instYm: string;
    instFrom: string;
    instTo: string;
    garantiaFrom: string;
    garantiaTo: string;
    windowDays: number;
    workbookName: string;
    workbookSheet: string;
    source: {
      mode: "firestore" | "local";
      importId: string;
      fileName: string;
      sheetName: string;
      uploadedAtText: string;
    };
    powerBiUrl: string;
    powerBiPartner: string;
  };
  kpi: {
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
  series: {
    providerByAttentionMonth: Array<{ ym: string; total: number }>;
    byDay: Array<{ ymd: string; proveedor: number; redes: number }>;
    byCuadrilla: Array<{ cuadrilla: string; proveedor: number; redes: number; diferencia: number }>;
  };
  detail: {
    cruce: CruceRow[];
    redesSolo: RedesGarantia[];
    providerRows: ProviderGarantia[];
    redesFinalizadas: RedesGarantia[];
  };
};

type ViewKey = "resumen" | "coinciden" | "proveedor" | "soloProveedor" | "soloRedes";

const VIEW_LABELS: Record<ViewKey, string> = {
  resumen: "Todo el cruce",
  coinciden: "Coinciden",
  proveedor: "Proveedor sin finalizada REDES",
  soloProveedor: "Solo proveedor",
  soloRedes: "Solo REDES",
};

function formatYm(ym: string) {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym || "-";
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const [y, m] = ym.split("-");
  return `${months[Number(m) - 1]} ${y}`;
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

function statusClass(status: CruceRow["status"]) {
  if (status === "COINCIDE") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "COINCIDE_FECHA_DIFERENTE") return "border-blue-200 bg-blue-50 text-blue-800";
  if (status === "PROVEEDOR_REDES_NO_FINALIZADA") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-rose-200 bg-rose-50 text-rose-800";
}

function KpiCard({
  label,
  value,
  hint,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "slate" | "blue" | "emerald" | "amber" | "rose";
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
            : "border-slate-200 bg-white text-slate-950";
  return (
    <div className={`rounded-lg border p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${toneClass}`}>
      <div className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      {hint ? <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{hint}</div> : null}
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-100">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

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

function downloadWorkbook(data: Resp) {
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
    ["Garantias proveedor", data.kpi.proveedorGarantias],
    ["Garantias REDES finalizadas", data.kpi.redesGarantiasFinalizadas],
    ["Instalaciones finalizadas", data.kpi.instalacionesFinalizadas],
    ["Tasa proveedor", data.kpi.proveedorTasaPct],
    ["Tasa REDES", data.kpi.redesTasaPct],
    ["Brecha garantias", data.kpi.brechaGarantias],
    ["Coincidencias finalizadas", data.kpi.coincidenciasFinalizadas],
    ["Proveedor sin REDES", data.kpi.proveedorSinRedes],
    ["Proveedor con REDES no finalizada", data.kpi.proveedorRedesNoFinalizada],
    ["REDES sin proveedor", data.kpi.redesSinProveedor],
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
    "Proveedor revisar"
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.detail.redesSolo.map(toRedesExportRow)), "Solo REDES");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.series.byDay), "Por dia");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.series.byCuadrilla), "Por cuadrilla");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  saveAs(new Blob([out], { type: "application/octet-stream" }), `cruce_garantias_${data.period.instYm}.xlsx`);
}

function CruceTable({ rows }: { rows: CruceRow[] }) {
  if (!rows.length) {
    return <div className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Sin registros para esta vista.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] uppercase text-slate-500 dark:border-slate-700">
            <th className="whitespace-nowrap px-3 py-2 font-semibold">Cruce</th>
            <th className="whitespace-nowrap px-3 py-2 font-semibold">Cod pedido</th>
            <th className="min-w-[220px] px-3 py-2 font-semibold">Cliente</th>
            <th className="whitespace-nowrap px-3 py-2 font-semibold">F. inst Excel</th>
            <th className="whitespace-nowrap px-3 py-2 font-semibold">F. garantia Excel</th>
            <th className="whitespace-nowrap px-3 py-2 font-semibold">F. inst REDES</th>
            <th className="whitespace-nowrap px-3 py-2 font-semibold">F. garantia REDES</th>
            <th className="whitespace-nowrap px-3 py-2 font-semibold">Estado REDES</th>
            <th className="min-w-[180px] px-3 py-2 font-semibold">Cuadrilla</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((row) => (
            <tr key={row.provider.key} className="align-top hover:bg-slate-50 dark:hover:bg-slate-800/70">
              <td className="px-3 py-2">
                <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${statusClass(row.status)}`}>
                  {row.statusLabel}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2 font-medium tabular-nums text-slate-900 dark:text-slate-100">
                {row.provider.codPedido || "-"}
                {row.provider.id ? <div className="text-[10px] font-normal text-slate-400">{row.provider.id}</div> : null}
              </td>
              <td className="px-3 py-2">
                <div className="font-medium text-slate-900 dark:text-slate-100">{row.provider.nombre || row.redes?.cliente || "-"}</div>
                {row.redes?.cliente && row.redes.cliente !== row.provider.nombre ? (
                  <div className="mt-0.5 text-xs text-slate-500">REDES: {row.redes.cliente}</div>
                ) : null}
              </td>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600 dark:text-slate-300">{formatYmd(row.provider.fechaInstalacionYmd)}</td>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600 dark:text-slate-300">
                {formatYmd(row.provider.fechaAtencionYmd)}
                {typeof row.provider.diasDesdeInstalacion === "number" ? (
                  <div className="text-[10px] text-slate-400">{row.provider.diasDesdeInstalacion} dias</div>
                ) : null}
              </td>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600 dark:text-slate-300">{formatYmd(row.redes?.fechaInstalacionBase || "")}</td>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600 dark:text-slate-300">
                {formatYmd(row.redes?.fechaGarantiaYmd || "")}
                {typeof row.redes?.diasDesdeInstalacion === "number" ? (
                  <div className="text-[10px] text-slate-400">{row.redes.diasDesdeInstalacion} dias</div>
                ) : null}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-300">{row.redes?.estado || "-"}</td>
              <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
                <div>{row.provider.cuadrilla || "-"}</div>
                {row.redes?.cuadrilla && row.redes.cuadrilla !== row.provider.cuadrilla ? (
                  <div className="mt-1 text-slate-400">REDES: {row.redes.cuadrilla}</div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RedesSoloTable({ rows }: { rows: RedesGarantia[] }) {
  if (!rows.length) {
    return <div className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Sin garantias REDES fuera del Excel.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] uppercase text-slate-500 dark:border-slate-700">
            <th className="whitespace-nowrap px-3 py-2 font-semibold">Cod pedido</th>
            <th className="min-w-[220px] px-3 py-2 font-semibold">Cliente</th>
            <th className="whitespace-nowrap px-3 py-2 font-semibold">F. instalacion</th>
            <th className="whitespace-nowrap px-3 py-2 font-semibold">F. garantia</th>
            <th className="whitespace-nowrap px-3 py-2 font-semibold">Estado</th>
            <th className="min-w-[180px] px-3 py-2 font-semibold">Cuadrilla</th>
            <th className="min-w-[180px] px-3 py-2 font-semibold">Motivo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((row) => (
            <tr key={row.id} className="align-top hover:bg-slate-50 dark:hover:bg-slate-800/70">
              <td className="whitespace-nowrap px-3 py-2 font-medium tabular-nums text-slate-900 dark:text-slate-100">
                {row.codigoCliente || "-"}
                <div className="text-[10px] font-normal text-slate-400">{row.ordenId}</div>
              </td>
              <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{row.cliente || "-"}</td>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600 dark:text-slate-300">{formatYmd(row.fechaInstalacionBase)}</td>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600 dark:text-slate-300">
                {formatYmd(row.fechaGarantiaYmd)}
                {typeof row.diasDesdeInstalacion === "number" ? <div className="text-[10px] text-slate-400">{row.diasDesdeInstalacion} dias</div> : null}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-300">{row.estado || "-"}</td>
              <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">{row.cuadrilla || "-"}</td>
              <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">{row.motivo || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function GarantiasCruceClient() {
  const [instYm, setInstYm] = useState(() => {
    if (typeof window === "undefined") return "2026-04";
    const fromUrl = new URLSearchParams(window.location.search).get("instYm") || "";
    return /^\d{4}-\d{2}$/.test(fromUrl) ? fromUrl : "2026-04";
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
      try {
        const res = await fetch(`/api/ordenes/garantias/cruce?instYm=${encodeURIComponent(instYm)}`, {
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
  }, [instYm]);

  const filteredCruce = useMemo(() => {
    const q = search.trim().toUpperCase();
    const base = data?.detail.cruce || [];
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
  }, [data?.detail.cruce, search, view]);

  const filteredRedesSolo = useMemo(() => {
    const rows = data?.detail.redesSolo || [];
    const q = search.trim().toUpperCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.codigoCliente, row.cliente, row.ordenId, row.cuadrilla, row.motivo].filter(Boolean).join(" ").toUpperCase().includes(q)
    );
  }, [data?.detail.redesSolo, search]);

  const viewCounts = useMemo(() => {
    const cruce = data?.detail.cruce || [];
    return {
      resumen: cruce.length,
      coinciden: cruce.filter((row) => row.redes?.finalizada).length,
      proveedor: cruce.filter((row) => !row.redes?.finalizada).length,
      soloProveedor: cruce.filter((row) => row.status === "SOLO_PROVEEDOR").length,
      soloRedes: data?.detail.redesSolo.length || 0,
    };
  }, [data?.detail.cruce, data?.detail.redesSolo.length]);

  const proveedorByMonthLabel = useMemo(() => {
    if (!data?.series.providerByAttentionMonth.length) return "Sin atenciones";
    return data.series.providerByAttentionMonth.map((row) => `${formatYm(row.ym)}: ${row.total}`).join(" | ");
  }, [data?.series.providerByAttentionMonth]);

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase text-[#30518c]">Garantias</div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-100">Cruce Power BI / REDES</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              Comparacion por fecha de instalacion, codigo de pedido y fecha de atencion usando el archivo del proveedor y las ordenes registradas en REDES.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-[11rem_auto_auto_auto]">
            <label className="space-y-1 text-xs font-medium text-slate-600 dark:text-slate-300">
              Mes instalacion
              <input
                type="month"
                value={instYm}
                onChange={(e) => setInstYm(e.target.value || "2026-04")}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#30518c] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            {data ? (
              <button
                type="button"
                onClick={() => downloadWorkbook(data)}
                className="self-end rounded-md bg-[#30518c] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#263f73]"
              >
                Exportar Excel
              </button>
            ) : null}
            <Link
              href="/home/garantias/cruce/cargas"
              className="self-end rounded-md border border-slate-300 px-4 py-2 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cargar Excel
            </Link>
            {data?.period.powerBiUrl ? (
              <a
                href={data.period.powerBiUrl}
                target="_blank"
                rel="noreferrer"
                className="self-end rounded-md border border-slate-300 px-4 py-2 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Abrir Power BI
              </a>
            ) : null}
          </div>
        </div>

        {data ? (
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-800">
              Fuente: {data.period.source.mode === "firestore" ? "Carga guardada" : "Archivo local"}
            </span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-800">{data.period.source.fileName || data.period.workbookName}</span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-800">Hoja: {data.period.source.sheetName || data.period.workbookSheet}</span>
            {data.period.source.uploadedAtText ? (
              <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-800">
                Cargado: {formatDateTime(data.period.source.uploadedAtText)}
              </span>
            ) : null}
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-800">{data.period.powerBiPartner}</span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-800">Garantias: {formatYmd(data.period.garantiaFrom)} a {formatYmd(data.period.garantiaTo)}</span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-800">{proveedorByMonthLabel}</span>
          </div>
        ) : null}
      </section>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      ) : null}

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          Cargando cruce de garantias...
        </div>
      ) : null}

      {data ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <KpiCard label="Proveedor" value={data.kpi.proveedorGarantias} tone="blue" hint={`${formatPct(data.kpi.proveedorTasaPct)} sobre ${formatNum(data.kpi.instalacionesFinalizadas)} instalaciones`} />
            <KpiCard label="REDES finalizadas" value={data.kpi.redesGarantiasFinalizadas} tone="emerald" hint={`${formatPct(data.kpi.redesTasaPct)} sobre el mismo denominador`} />
            <KpiCard label="Brecha" value={data.kpi.brechaGarantias} tone={data.kpi.brechaGarantias > 0 ? "amber" : "slate"} hint={`${formatPct(data.kpi.brechaTasaPct)} puntos de diferencia`} />
            <KpiCard label="Coinciden" value={data.kpi.coincidenciasFinalizadas} tone="emerald" hint="Proveedor y REDES finalizada" />
            <KpiCard label="Proveedor revisar" value={data.kpi.proveedorSinRedes + data.kpi.proveedorRedesNoFinalizada} tone="rose" hint={`${data.kpi.proveedorSinRedes} sin REDES | ${data.kpi.proveedorRedesNoFinalizada} no finalizadas`} />
            <KpiCard label="Solo REDES" value={data.kpi.redesSinProveedor} tone="amber" hint="Finalizadas no consideradas por proveedor" />
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
            <Panel title="Garantias por fecha de atencion" subtitle="Proveedor vs REDES finalizadas">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.series.byDay} margin={{ left: 0, right: 12, top: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="ymd" tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={formatYmd} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip
                      contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: 12 }}
                      labelFormatter={(v) => formatYmd(String(v))}
                      formatter={(value, name) => [value, name === "proveedor" ? "Proveedor" : "REDES"]}
                    />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} formatter={(v) => (v === "proveedor" ? "Proveedor" : "REDES")} />
                    <Bar dataKey="proveedor" fill="#30518c" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="redes" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Brecha por cuadrilla" subtitle="Top diferencias absolutas">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[11px] uppercase text-slate-500 dark:border-slate-700">
                      <th className="px-3 py-2 font-semibold">Cuadrilla</th>
                      <th className="px-3 py-2 text-right font-semibold">Proveedor</th>
                      <th className="px-3 py-2 text-right font-semibold">REDES</th>
                      <th className="px-3 py-2 text-right font-semibold">Dif.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.series.byCuadrilla.map((row) => (
                      <tr key={row.cuadrilla} className="hover:bg-slate-50 dark:hover:bg-slate-800/70">
                        <td className="max-w-[220px] truncate px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100">{row.cuadrilla || "-"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{row.proveedor}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{row.redes}</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-semibold ${row.diferencia > 0 ? "text-rose-600" : row.diferencia < 0 ? "text-amber-600" : "text-emerald-600"}`}>
                          {row.diferencia}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </section>

          <Panel title="Detalle del cruce" subtitle={`${view === "soloRedes" ? filteredRedesSolo.length : filteredCruce.length} registros visibles`}>
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                {(Object.keys(VIEW_LABELS) as ViewKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setView(key)}
                    className={`rounded-md border px-3 py-2 text-xs font-semibold transition ${
                      view === key
                        ? "border-[#30518c] bg-[#30518c] text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
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
                placeholder="Buscar codigo, cliente o cuadrilla"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#30518c] lg:max-w-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            {view === "soloRedes" ? <RedesSoloTable rows={filteredRedesSolo} /> : <CruceTable rows={filteredCruce} />}
          </Panel>
        </>
      ) : null}
    </div>
  );
}
