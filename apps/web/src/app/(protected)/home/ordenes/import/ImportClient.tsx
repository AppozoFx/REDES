"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

type Resumen = { nuevos: number; actualizados: number; duplicadosSinCambios: number };

type WinboIssue = {
  rowNumber: number;
  level: "warning" | "error";
  code: string;
  detail?: string;
};

type WinboResponse = {
  ok: boolean;
  dryRun?: boolean;
  export?: { nombreArchivo?: string; downloadUrl?: string };
  parse?: {
    sheetName?: string;
    totalRows?: number;
    rowsValidas?: number;
    rowsOmitidas?: number;
    columnasFaltantes?: string[];
  };
  resumen?: {
    nuevos: number;
    actualizados: number;
    duplicadosSinCambios: number;
    invalidos: number;
  };
  warnings?: string[];
  issues?: WinboIssue[];
  error?: string;
};

type WinboMode = "today" | "range";

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default function ImportClient() {
  const today = useMemo(() => todayLimaYmd(), []);

  const [rows, setRows] = useState<any[][]>([]);
  const [page, setPage] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [landing, setLanding] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressTitle, setProgressTitle] = useState("Importando registros");
  const [progressText, setProgressText] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [archivoNombre, setArchivoNombre] = useState("");
  const [archivoPesoMB, setArchivoPesoMB] = useState(0);
  const [lastResumen, setLastResumen] = useState<Resumen | null>(null);
  const [lastFecha, setLastFecha] = useState<string>("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [winboMode, setWinboMode] = useState<WinboMode>("today");
  const [winboFrom, setWinboFrom] = useState(today);
  const [winboTo, setWinboTo] = useState(today);
  const [winboDryRun, setWinboDryRun] = useState(true);
  const [winboNombreArchivo, setWinboNombreArchivo] = useState("");
  const [winboPending, setWinboPending] = useState(false);
  const [winboResult, setWinboResult] = useState<WinboResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resetTimerRef = useRef<number | null>(null);
  const progressTimerRef = useRef<number | null>(null);

  const pageSize = 50;
  const totalRegistros = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRegistros / pageSize));
  const slice = useMemo(() => rows.slice((page - 1) * pageSize, page * pageSize), [rows, page]);

  useEffect(() => {
    const id = window.setTimeout(() => setLanding(false), 850);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current != null) window.clearTimeout(resetTimerRef.current);
      if (progressTimerRef.current != null) window.clearInterval(progressTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!result) return;
    const safe: any = result ?? {};
    if (safe.ok && safe.resumen) {
      const resumen = safe.resumen as Resumen;
      setLastResumen(resumen);
      setLastFecha(new Date().toLocaleString("es-PE"));
      setProgress(100);

      toast.success("Importacion completada", {
        description: `Nuevos: ${resumen.nuevos}, actualizados: ${resumen.actualizados}, sin cambios: ${resumen.duplicadosSinCambios}`,
      });

      resetTimerRef.current = window.setTimeout(() => {
        stopProgress();
        setRows([]);
        setFile(null);
        setArchivoNombre("");
        setArchivoPesoMB(0);
        setPage(1);
      }, 450);
    } else {
      stopProgress();
      const msg = safe?.error?.formErrors?.join(", ") || "Error al importar";
      toast.error(msg);
    }
  }, [result]);

  function startProgress(title: string, text: string) {
    if (progressTimerRef.current != null) window.clearInterval(progressTimerRef.current);
    setProgressTitle(title);
    setProgressText(text);
    setEnviando(true);
    setProgress((p) => (p < 8 ? 8 : p));
    progressTimerRef.current = window.setInterval(() => {
      setProgress((p) => {
        if (p >= 95) return p;
        const step = p < 40 ? 7 : p < 75 ? 4 : 2;
        return Math.min(95, p + step);
      });
    }, 280);
  }

  function stopProgress() {
    if (progressTimerRef.current != null) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    setEnviando(false);
    setProgress(0);
  }

  async function handleFiles(fs: FileList | null) {
    const f = fs && fs[0];
    if (!f) return;

    setFile(f);
    setArchivoNombre(f.name);
    setArchivoPesoMB(Number((f.size / (1024 * 1024)).toFixed(2)));

    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const sheet = wb.Sheets["Hoja de Datos"] ?? wb.Sheets[wb.SheetNames[0]];
      if (!sheet) {
        setRows([]);
        return;
      }
      const arr: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", range: 7 });
      setRows(arr);
      setPage(1);
    } catch (e) {
      console.error(e);
      setRows([]);
      toast.error("No se pudo leer el archivo");
    }
  }

  function onDrop(ev: React.DragEvent) {
    ev.preventDefault();
    handleFiles(ev.dataTransfer.files);
  }

  function onDragOver(ev: React.DragEvent) {
    ev.preventDefault();
  }

  function limpiarArchivo() {
    setRows([]);
    setFile(null);
    setArchivoNombre("");
    setArchivoPesoMB(0);
    setPage(1);
    if (inputRef.current) inputRef.current.value = "";
  }

  function confirmarImportacion() {
    if (!file || pending) return;
    setConfirmOpen(true);
  }

  async function ejecutarImportacion() {
    if (!file || pending) return;
    setConfirmOpen(false);
    toast("Importacion iniciada", { description: `Procesando ${totalRegistros} registros` });
    const fd = new FormData();
    fd.set("file", file);
    setPending(true);
    startProgress("Importando registros", `Procesando ${totalRegistros} registros...`);
    try {
      const res = await fetch("/api/ordenes/import", {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = String(data?.error || `HTTP_${res.status}`);
        setResult({ ok: false, error: { formErrors: [msg] } });
      } else {
        setResult(data);
      }
    } catch (e: any) {
      setResult({ ok: false, error: { formErrors: [String(e?.message || "NETWORK_ERROR")] } });
    } finally {
      setPending(false);
    }
  }

  function applyTodayPreset() {
    const current = todayLimaYmd();
    setWinboMode("today");
    setWinboFrom(current);
    setWinboTo(current);
  }

  async function ejecutarWinbo(forceDryRun: boolean) {
    if (winboPending || pending) return;

    const isToday = winboMode === "today";
    const fechaVisiDesde = isToday ? todayLimaYmd() : winboFrom;
    const fechaVisiHasta = isToday ? todayLimaYmd() : winboTo;

    if (!fechaVisiDesde || !fechaVisiHasta) {
      toast.error("Debes indicar ambas fechas");
      return;
    }
    if (fechaVisiDesde > fechaVisiHasta) {
      toast.error("El rango de fechas es invalido");
      return;
    }

    setWinboPending(true);
    setWinboResult(null);
    startProgress(
      forceDryRun ? "Validando exportacion WinBo" : "Importando desde WinBo",
      isToday ? "Consultando ordenes del dia actual..." : "Consultando rango manual en WinBo..."
    );

    try {
      const res = await fetch("/api/ordenes/import/winbo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dryRun: forceDryRun,
          mode: "manual",
          scope: isToday ? "today" : "range",
          fechaVisiDesde,
          fechaVisiHasta,
          nombreArchivo: winboNombreArchivo.trim(),
          filtros: {},
        }),
      });
      const data = (await res.json().catch(() => ({}))) as WinboResponse;
      if (!res.ok || !data?.ok) {
        const msg = String(data?.error || `HTTP_${res.status}`);
        toast.error(msg);
        stopProgress();
        setWinboResult({ ok: false, error: msg });
        return;
      }

      setProgress(100);
      setWinboResult(data);
      if (data.warnings?.length) {
        toast.warning("Importacion WinBo con observaciones", {
          description: data.warnings[0],
        });
      } else {
        toast.success(forceDryRun ? "Dry run completado" : "Importacion WinBo completada");
      }
      resetTimerRef.current = window.setTimeout(() => stopProgress(), 350);
    } catch (e: any) {
      stopProgress();
      const msg = String(e?.message || "NETWORK_ERROR");
      toast.error(msg);
      setWinboResult({ ok: false, error: msg });
    } finally {
      setWinboPending(false);
    }
  }

  const canUseRange = winboMode === "range";

  return (
    <div className="w-full space-y-4 p-3 md:p-4">
      <header className="sticky top-0 z-20 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Importar Registros</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Importa ordenes por archivo manual o sincroniza un export WinBo desde el servidor.
        </p>
      </header>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <div className="border-b border-slate-200 p-6 dark:border-slate-700">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Sincronizar desde WinBo</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Ejecuta la exportacion remota desde WinBo y luego importa el Excel resultante.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={applyTodayPreset}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                disabled={winboPending || pending}
              >
                Reset a hoy
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-b border-slate-200 p-6 md:grid-cols-2 dark:border-slate-700">
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/40">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Modo</p>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="radio"
                name="winboMode"
                checked={winboMode === "today"}
                onChange={() => applyTodayPreset()}
              />
              Hoy
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="radio"
                name="winboMode"
                checked={winboMode === "range"}
                onChange={() => setWinboMode("range")}
              />
              Rango personalizado
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={winboDryRun}
                onChange={(e) => setWinboDryRun(e.currentTarget.checked)}
              />
              Dry run por defecto
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">Fecha desde</span>
              <input
                type="date"
                value={winboFrom}
                onChange={(e) => setWinboFrom(e.currentTarget.value)}
                disabled={!canUseRange || winboPending || pending}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">Fecha hasta</span>
              <input
                type="date"
                value={winboTo}
                onChange={(e) => setWinboTo(e.currentTarget.value)}
                disabled={!canUseRange || winboPending || pending}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">Nombre de archivo opcional</span>
              <input
                type="text"
                value={winboNombreArchivo}
                onChange={(e) => setWinboNombreArchivo(e.currentTarget.value)}
                placeholder="MisOrdenes_20260315_101530.xlsx"
                disabled={winboPending || pending}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 p-6">
          <button
            type="button"
            disabled={winboPending || pending}
            onClick={() => ejecutarWinbo(true)}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Validar en WinBo (dry run)
          </button>
          <button
            type="button"
            disabled={winboPending || pending}
            onClick={() => ejecutarWinbo(winboDryRun)}
            className="rounded-xl bg-[#30518c] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {winboDryRun ? "Ejecutar modo configurado" : "Importar desde WinBo"}
          </button>
        </div>

        {winboResult?.ok && winboResult.resumen && (
          <div className="border-t border-slate-200 p-6 dark:border-slate-700">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <MetricCard title="Origen" value="WinBo Export" />
              <MetricCard title="Modo" value={winboResult.dryRun ? "Dry run" : "Importacion"} />
              <MetricCard title="Nuevos" value={String(winboResult.resumen.nuevos)} />
              <MetricCard title="Actualizados" value={String(winboResult.resumen.actualizados)} />
              <MetricCard title="Sin cambios" value={String(winboResult.resumen.duplicadosSinCambios)} />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/40">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Resumen de parseo</h3>
                <div className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                  <div>Archivo: {winboResult.export?.nombreArchivo || "-"}</div>
                  <div>Hoja: {winboResult.parse?.sheetName || "-"}</div>
                  <div>Filas leidas: {winboResult.parse?.totalRows ?? 0}</div>
                  <div>Filas validas: {winboResult.parse?.rowsValidas ?? 0}</div>
                  <div>Filas omitidas: {winboResult.parse?.rowsOmitidas ?? 0}</div>
                  <div>Filas invalidas: {winboResult.resumen.invalidos}</div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/40">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Observaciones</h3>
                <div className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                  {(winboResult.warnings || []).length > 0 ? (
                    winboResult.warnings?.map((warning, index) => <div key={index}>- {warning}</div>)
                  ) : (
                    <div>Sin observaciones.</div>
                  )}
                  {(winboResult.parse?.columnasFaltantes || []).length > 0 && (
                    <div>Columnas faltantes: {winboResult.parse?.columnasFaltantes?.join(", ")}</div>
                  )}
                </div>
              </div>
            </div>

            {(winboResult.issues || []).length > 0 && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                <h3 className="font-semibold">Primeras incidencias detectadas</h3>
                <div className="mt-2 space-y-1">
                  {winboResult.issues?.slice(0, 8).map((issue, index) => (
                    <div key={`${issue.rowNumber}-${index}`}>
                      Fila {issue.rowNumber}: {issue.code}
                      {issue.detail ? ` (${issue.detail})` : ""}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {winboResult && !winboResult.ok && (
          <div className="border-t border-slate-200 p-6 dark:border-slate-700">
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
              {winboResult.error || "No se pudo completar la sincronizacion WinBo"}
            </div>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <div className="border-b border-slate-200 p-6 dark:border-slate-700">
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center transition hover:border-[#30518c] hover:bg-slate-100/70 dark:border-slate-600 dark:bg-slate-800/40 dark:hover:bg-slate-800/70"
          >
            <p className="text-base font-semibold text-slate-800 dark:text-slate-100">Arrastra tu archivo .xlsx aqui</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Hoja: "Hoja de Datos" · Headers en fila 8</p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Tamano recomendado menor a 20 MB</p>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                className="rounded-xl bg-[#30518c] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => inputRef.current?.click()}
                disabled={pending || enviando || winboPending}
              >
                Seleccionar archivo
              </button>
              <button
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                onClick={limpiarArchivo}
                disabled={!file || pending || enviando || winboPending}
              >
                Limpiar
              </button>
            </div>

            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => handleFiles(e.currentTarget.files)}
            />

            {file && (
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
                <span className="font-medium">{archivoNombre}</span>
                <span className="text-slate-400">·</span>
                <span>{archivoPesoMB} MB</span>
              </div>
            )}

            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Total de registros cargados: {totalRegistros}</p>
          </div>
        </div>

        <div className="border-b border-slate-200 p-6 dark:border-slate-700">
          <button
            type="button"
            disabled={!file || pending || enviando || winboPending}
            title={!file ? "Selecciona un archivo para habilitar" : undefined}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#30518c] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={confirmarImportacion}
          >
            {pending || enviando ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
                Procesando...
              </>
            ) : (
              "Confirmar e importar"
            )}
          </button>
        </div>

        {lastResumen && (
          <div className="border-b border-slate-200 p-6 dark:border-slate-700">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <MetricCard title="Usuario" value="Sesion actual" />
              <MetricCard title="Fecha" value={lastFecha || "-"} />
              <MetricCard title="Nuevos" value={String(lastResumen.nuevos)} />
              <MetricCard title="Actualizados" value={String(lastResumen.actualizados)} />
              <MetricCard title="Sin cambios" value={String(lastResumen.duplicadosSinCambios)} />
            </div>
          </div>
        )}

        <div className="p-6">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-slate-300">Vista previa: {totalRegistros} filas</p>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-300 px-2 py-1 text-sm disabled:opacity-50 dark:border-slate-600"
              >
                Prev
              </button>
              <div className="text-sm text-slate-600 dark:text-slate-300">
                {page}/{totalPages}
              </div>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-slate-300 px-2 py-1 text-sm disabled:opacity-50 dark:border-slate-600"
              >
                Next
              </button>
            </div>
          </div>

          <div className="max-h-[420px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="min-w-[1200px] text-sm">
              <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800">
                <tr>
                  {Array.from({ length: 21 }).map((_, i) => (
                    <th
                      key={i}
                      className="whitespace-nowrap border-b border-slate-200 px-3 py-2 text-left text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
                    >
                      {i}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slice.map((r, idx) => (
                  <tr key={idx} className="odd:bg-white even:bg-slate-50 dark:odd:bg-slate-900 dark:even:bg-slate-800/60">
                    {Array.from({ length: 21 }).map((_, i) => (
                      <td
                        key={i}
                        className="max-w-[260px] whitespace-nowrap border-b border-slate-100 px-3 py-2 text-slate-700 dark:border-slate-800 dark:text-slate-200"
                        title={String(r[i] ?? "")}
                      >
                        <span className="block overflow-hidden text-ellipsis">{String(r[i] ?? "")}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Confirmar importacion</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Se importaran {totalRegistros} registros del archivo cargado.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                onClick={ejecutarImportacion}
                disabled={pending || enviando || winboPending}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#30518c] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending || enviando ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
                    Procesando...
                  </>
                ) : (
                  "Importar"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {landing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 dark:from-[#0f172a] dark:to-slate-900">
          <div className="rounded-3xl border border-slate-200 bg-white/85 p-8 text-center shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/80">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-[#30518c] border-t-transparent" />
            <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Cargando importador</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Preparando recursos</p>
          </div>
        </div>
      )}

      {enviando && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          aria-busy="true"
          aria-live="polite"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{progressTitle}</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{progressText || "Procesando..."}</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-[#30518c] transition-all duration-300"
                style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
              />
            </div>
            <p className="mt-2 text-right text-xs text-slate-500 dark:text-slate-400">{progress}%</p>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
      <p className="text-xs text-slate-500 dark:text-slate-400">{title}</p>
      <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  );
}
