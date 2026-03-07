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

function StatCard(props: { label: string; value: number; accent?: "blue" | "emerald" | "amber" }) {
  const accent = props.accent || "blue";
  const accentClass =
    accent === "emerald"
      ? "border-emerald-200 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-900/20"
      : accent === "amber"
        ? "border-amber-200 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-900/20"
        : "border-blue-200 bg-blue-50/80 dark:border-blue-800 dark:bg-blue-900/20";
  return (
    <div className={`rounded-xl border p-3 ${accentClass}`}>
      <div className="text-xs text-slate-600 dark:text-slate-300">{props.label}</div>
      <div className="mt-1 text-2xl font-semibold leading-none">{props.value}</div>
    </div>
  );
}

export default function ValidacionWinClient() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("VALIDACION_WIN.xlsx");

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
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-1 text-lg font-semibold">Procesando VALIDACION WIN</div>
            <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
              {progressText || "Procesando..."} Espera por favor.
            </p>
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-2 text-right text-sm font-semibold">{progress}%</div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-5xl space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">Carga de Archivo</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Sube el Excel mensual de WIN y genera automáticamente:
              <b> hoja corregida</b>, <b>Clientes faltantes</b>, <b>CAT5e</b> y <b>CAT6</b>.
            </p>
          </div>

          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 dark:border-slate-600 dark:bg-slate-800/40">
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={loading}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full rounded border border-slate-300 bg-white p-2 text-sm disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950"
            />
            {file && (
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Archivo seleccionado: <b>{file.name}</b>
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-center">
            <button
              type="button"
              onClick={procesar}
              disabled={!canRun}
              className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Procesando..." : "Procesar Archivo"}
            </button>
          </div>
          {downloadUrl && (
            <div className="mt-3 flex items-center justify-center">
              <button
                type="button"
                onClick={() => saveAs(downloadUrl, downloadName)}
                className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700"
              >
                Descargar Excel
              </button>
            </div>
          )}

          {error && <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
        </section>

        {summary && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <h3 className="mb-4 text-xl font-semibold">Resumen Ejecutivo</h3>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Instalaciones" value={summary.cantidadInstalaciones} accent="blue" />
              <StatCard label="Filas Modificadas" value={summary.modifiedRows} accent="amber" />
              <StatCard label="Clientes Faltantes" value={summary.missingClientes} accent="amber" />
              <StatCard label="Sin Match BD" value={summary.notFoundInDbRows} accent="emerald" />
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <div className="mb-2 text-sm font-semibold">Cruce</div>
                <div className="space-y-1 text-sm">
                  <div>Total filas Excel: <b>{summary.totalExcelRows}</b></div>
                  <div>Con match en BD: <b>{summary.matchedRows}</b></div>
                  <div>Celdas modificadas: <b>{summary.modifiedCells}</b></div>
                  <div>Acta/Metraje autocompletados: <b>{summary.filledActaMetrajeNoHighlight}</b></div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <div className="mb-2 text-sm font-semibold">Operativo</div>
                <div className="space-y-1 text-sm">
                  <div>Residenciales: <b>{summary.totalResidenciales}</b></div>
                  <div>Condominio: <b>{summary.totalCondominio}</b></div>
                  <div>ONT: <b>{summary.totalOntInstalados}</b></div>
                  <div>MESH: <b>{summary.totalMeshInstalados}</b></div>
                  <div>FONOWIN: <b>{summary.totalFonoInstalados}</b></div>
                  <div>WINBOX: <b>{summary.totalBoxInstalados}</b></div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <div className="mb-2 text-sm font-semibold">Cableados</div>
                <div className="space-y-1 text-sm">
                <div>Filas CAT5e: <b>{summary.cat5eRows}</b></div>
                <div>Filas CAT6: <b>{summary.cat6Rows}</b></div>
                <div>Cat5e (1 punto): <b>{summary.cat5ePunto1}</b></div>
                {summary.cat5ePunto2 > 0 && <div>Cat5e (2 puntos): <b>{summary.cat5ePunto2}</b></div>}
                {summary.cat5ePunto3 > 0 && <div>Cat5e (3 puntos): <b>{summary.cat5ePunto3}</b></div>}
                {summary.cat5ePunto4 > 0 && <div>Cat5e (4 puntos): <b>{summary.cat5ePunto4}</b></div>}
                <div>Total Cat5e (puntos): <b>{summary.totalCat5ePuntos}</b></div>
                <div>Cat6 (Plan GAMER): <b>{summary.totalCat6PlanGamer}</b></div>
              </div>
            </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
