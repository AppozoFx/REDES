"use client";

import { useEffect, useMemo, useState } from "react";
import { saveAs } from "file-saver";

type Summary = {
  totalExcelRows: number;
  matchedRows: number;
  notFoundInDbRows: number;
  modifiedRows: number;
  modifiedCells: number;
  filledActaMetrajeNoHighlight: number;
  missingClientes: number;
  cat5eRows: number;
  cat6Rows: number;
  cantidadInstalaciones: number;
  totalResidenciales: number;
  totalCondominio: number;
  totalOntInstalados: number;
  totalMeshInstalados: number;
  totalFonoInstalados: number;
  totalBoxInstalados: number;
  cat5ePunto1: number;
  cat5ePunto2: number;
  cat5ePunto3: number;
  cat5ePunto4: number;
  totalCat5ePuntos: number;
  totalCat6PlanGamer: number;
};

function parseFilename(contentDisposition: string | null) {
  if (!contentDisposition) return "VALIDACION_WIN.xlsx";
  const m = contentDisposition.match(/filename="([^"]+)"/i);
  return m?.[1] || "VALIDACION_WIN.xlsx";
}

/* ── Componentes de UI ── */

function KpiCard({
  label,
  value,
  sub,
  variant = "default",
}: {
  label: string;
  value: number | string;
  sub?: string;
  variant?: "default" | "blue" | "emerald" | "amber" | "rose" | "violet" | "slate";
}) {
  const variants: Record<string, string> = {
    default: "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800",
    blue: "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20",
    emerald: "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20",
    amber: "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20",
    rose: "border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-900/20",
    violet: "border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-900/20",
    slate: "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60",
  };
  const valueColors: Record<string, string> = {
    default: "text-slate-800 dark:text-slate-100",
    blue: "text-blue-700 dark:text-blue-300",
    emerald: "text-emerald-700 dark:text-emerald-300",
    amber: "text-amber-700 dark:text-amber-300",
    rose: "text-rose-700 dark:text-rose-300",
    violet: "text-violet-700 dark:text-violet-300",
    slate: "text-slate-600 dark:text-slate-300",
  };

  return (
    <div className={`rounded-xl border p-4 ${variants[variant]}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className={`mt-1.5 text-2xl font-bold leading-none ${valueColors[variant]}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{sub}</p>}
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {title}
      </h4>
      {children}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <span className="text-sm text-slate-600 dark:text-slate-400">{label}</span>
      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{value}</span>
    </div>
  );
}

/* ── Componente principal ── */

export default function ValidacionWinClient() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("VALIDACION_WIN.xlsx");
  const [dragOver, setDragOver] = useState(false);

  const canRun = useMemo(() => !!file && !loading, [file, loading]);

  const procesar = async () => {
    if (!file) return;
    setLoading(true);
    setProgress(2);
    setProgressText("Preparando archivo...");
    setError("");
    setSummary(null);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }
    let timer: ReturnType<typeof setInterval> | null = null;
    try {
      timer = setInterval(() => {
        setProgress((p) => {
          if (p >= 90) return p;
          const step = p < 35 ? 5 : p < 70 ? 3 : 2;
          return Math.min(90, p + step);
        });
      }, 320);

      const fd = new FormData();
      fd.set("file", file);
      setProgressText("Cruzando con base de datos...");

      const res = await fetch("/api/gerencia/validacion-win", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        let message = "No se pudo procesar el archivo";
        try {
          const body = await res.json();
          message = String(body?.error || message);
        } catch {}
        throw new Error(message);
      }

      setProgress(94);
      setProgressText("Generando Excel final...");
      const blob = await res.blob();
      const filename = parseFilename(res.headers.get("Content-Disposition"));
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setDownloadName(filename);

      const summaryHeader = res.headers.get("X-Validation-Summary");
      if (summaryHeader) {
        const parsed = JSON.parse(decodeURIComponent(summaryHeader)) as Summary;
        setSummary(parsed);
      }
      setProgress(100);
      setProgressText("Proceso completado");
    } catch (e: any) {
      setError(String(e?.message || "Error procesando"));
    } finally {
      if (timer) clearInterval(timer);
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  return (
    <div className="relative text-slate-900 dark:text-slate-100">

      {/* ── Modal de carga ── */}
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-7 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-1 flex items-center gap-3">
              <svg className="h-5 w-5 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              <span className="text-base font-semibold">Procesando archivo</span>
            </div>
            <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
              {progressText || "Procesando..."} — por favor espera.
            </p>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>{progressText}</span>
              <span className="font-semibold">{progress}%</span>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-5xl space-y-5">

        {/* ── Sección de carga ── */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          {/* Header */}
          <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Carga de Archivo WIN</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Genera hoja corregida · Clientes faltantes · CAT5e · CAT6
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-4">
            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const dropped = e.dataTransfer.files?.[0];
                if (dropped && dropped.name.endsWith(".xlsx")) setFile(dropped);
              }}
              className={[
                "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 transition-colors",
                dragOver
                  ? "border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20"
                  : "border-slate-300 bg-slate-50 hover:border-blue-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800/40 dark:hover:border-blue-600",
              ].join(" ")}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm dark:bg-slate-700">
                <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              </div>
              {file ? (
                <div className="text-center">
                  <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">{file.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {(file.size / 1024).toFixed(1)} KB · Listo para procesar
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    Arrastra el Excel aquí o
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">solo archivos .xlsx</p>
                </div>
              )}
              <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600">
                Seleccionar archivo
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  disabled={loading}
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="sr-only"
                />
              </label>
            </div>

            {/* Botones de acción */}
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={procesar}
                disabled={!canRun}
                className="inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 active:bg-blue-800"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
                </svg>
                {loading ? "Procesando..." : "Procesar Archivo"}
              </button>

              {downloadUrl && (
                <button
                  type="button"
                  onClick={() => saveAs(downloadUrl, downloadName)}
                  className="inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 active:bg-emerald-800"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Descargar Excel
                </button>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
                <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <span>{error}</span>
              </div>
            )}
          </div>
        </section>

        {/* ── Resumen ── */}
        {summary && (
          <section className="space-y-4">
            {/* KPIs principales */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label="Instalaciones BD"
                value={summary.cantidadInstalaciones}
                variant="blue"
              />
              <KpiCard
                label="Filas Modificadas"
                value={summary.modifiedRows}
                sub={`${summary.modifiedCells} celdas`}
                variant="amber"
              />
              <KpiCard
                label="Clientes Faltantes"
                value={summary.missingClientes}
                variant="rose"
              />
              <KpiCard
                label="Sin Match BD"
                value={summary.notFoundInDbRows}
                sub={`de ${summary.totalExcelRows} filas Excel`}
                variant="slate"
              />
            </div>

            {/* Detalle en 3 columnas */}
            <div className="grid gap-4 lg:grid-cols-3">
              <SectionCard title="Cruce Excel ↔ BD">
                <StatRow label="Total filas Excel" value={summary.totalExcelRows} />
                <StatRow label="Con match en BD" value={summary.matchedRows} />
                <StatRow label="Celdas modificadas" value={summary.modifiedCells} />
                <StatRow label="Acta / Metraje autocomp." value={summary.filledActaMetrajeNoHighlight} />
              </SectionCard>

              <SectionCard title="Operativo">
                <StatRow label="Residenciales" value={summary.totalResidenciales} />
                <StatRow label="Condominio" value={summary.totalCondominio} />
                <StatRow label="ONT instalados" value={summary.totalOntInstalados} />
                <StatRow label="MESH instalados" value={summary.totalMeshInstalados} />
                <StatRow label="FONOWIN" value={summary.totalFonoInstalados} />
                <StatRow label="WINBOX" value={summary.totalBoxInstalados} />
              </SectionCard>

              <SectionCard title="Cableados">
                <StatRow label="Filas CAT5e" value={summary.cat5eRows} />
                <StatRow label="Filas CAT6" value={summary.cat6Rows} />
                <StatRow label="Cat5e (1 punto)" value={summary.cat5ePunto1} />
                {summary.cat5ePunto2 > 0 && (
                  <StatRow label="Cat5e (2 puntos)" value={summary.cat5ePunto2} />
                )}
                {summary.cat5ePunto3 > 0 && (
                  <StatRow label="Cat5e (3 puntos)" value={summary.cat5ePunto3} />
                )}
                {summary.cat5ePunto4 > 0 && (
                  <StatRow label="Cat5e (4 puntos)" value={summary.cat5ePunto4} />
                )}
                <StatRow label="Total Cat5e (puntos)" value={summary.totalCat5ePuntos} />
                <StatRow label="Cat6 (Plan GAMER)" value={summary.totalCat6PlanGamer} />
              </SectionCard>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
