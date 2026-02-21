"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

type Resumen = { nuevos: number; actualizados: number; duplicadosSinCambios: number };

export default function ImportClient() {
  const [rows, setRows] = useState<any[][]>([]);
  const [page, setPage] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [landing, setLanding] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [progress, setProgress] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [archivoNombre, setArchivoNombre] = useState("");
  const [archivoPesoMB, setArchivoPesoMB] = useState(0);
  const [lastResumen, setLastResumen] = useState<Resumen | null>(null);
  const [lastFecha, setLastFecha] = useState<string>("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resetTimerRef = useRef<number | null>(null);

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
    if (pending) {
      setEnviando(true);
      setProgress((p) => (p < 8 ? 8 : p));
      const id = window.setInterval(() => {
        setProgress((p) => {
          if (p >= 95) return p;
          const step = p < 40 ? 7 : p < 75 ? 4 : 2;
          return Math.min(95, p + step);
        });
      }, 280);
      return () => window.clearInterval(id);
    }
  }, [pending]);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current != null) window.clearTimeout(resetTimerRef.current);
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
        setEnviando(false);
        setProgress(0);
        setRows([]);
        setFile(null);
        setArchivoNombre("");
        setArchivoPesoMB(0);
        setPage(1);
      }, 450);
    } else {
      setEnviando(false);
      setProgress(0);
      const msg = safe?.error?.formErrors?.join(", ") || "Error al importar";
      toast.error(msg);
    }
  }, [result]);

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

  return (
    <div className="w-full space-y-4 p-3 md:p-4">
      <header className="sticky top-0 z-20 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Importar Registros</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Carga archivos Excel, valida una vista previa y confirma la importacion de ordenes.
        </p>
      </header>

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
                disabled={pending || enviando}
              >
                Seleccionar archivo
              </button>
              <button
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                onClick={limpiarArchivo}
                disabled={!file || pending || enviando}
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
            disabled={!file || pending || enviando}
            title={!file ? "Selecciona un archivo para habilitar" : undefined}
            className="rounded-xl bg-[#30518c] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={confirmarImportacion}
          >
            {pending || enviando ? "Importando..." : "Confirmar e importar"}
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
                    <th key={i} className="whitespace-nowrap border-b border-slate-200 px-3 py-2 text-left text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
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
                className="rounded-lg bg-[#30518c] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-95"
              >
                Importar
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
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Importando registros</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Procesando {totalRegistros} registros...</p>
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
