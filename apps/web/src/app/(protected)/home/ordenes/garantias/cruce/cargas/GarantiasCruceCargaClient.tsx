"use client";

import Link from "next/link";
import type { DragEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type MonthSummary = {
  instYm: string;
  total: number;
  attentionMonths: Array<{ ym: string; total: number }>;
};

type PeriodRow = {
  instYm: string;
  totalRows: number;
  fileName: string;
  sheetName: string;
  importId: string;
  uploadedAtText: string;
  attentionMonths: Array<{ ym: string; total: number }>;
};

type PreviewResult = {
  fileName: string;
  fileSize: number;
  sheetName: string;
  totalRows: number;
  validRows: number;
  omittedRows: number;
  omittedByReason: Record<string, number>;
  months: MonthSummary[];
  sampleByMonth: Record<string, Array<{
    codPedido: string;
    nombre: string;
    fechaInstalacionYmd: string;
    fechaAtencionYmd: string;
    cuadrilla: string;
    diasDesdeInstalacion: number | null;
  }>>;
};

type ImportResult = {
  importId: string;
  fileName: string;
  sheetName: string;
  totalRows: number;
  validRows: number;
  omittedRows: number;
  omittedByReason: Record<string, number>;
  months: MonthSummary[];
};

type Step = "idle" | "analyzing" | "preview" | "uploading" | "done";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatYm(ym: string) {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym || "-";
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const [y, m] = ym.split("-");
  return `${months[Number(m) - 1]} ${y}`;
}

function formatMonthFull(ym: string) {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
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
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Lima",
  }).format(d);
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function attentionLabel(rows: Array<{ ym: string; total: number }>) {
  if (!rows.length) return "Sin atenciones";
  return rows.map((row) => `${formatYm(row.ym)}: ${row.total}`).join(" | ");
}

function reasonLabel(reason: string) {
  if (reason === "sin_fecha_instalacion") return "Sin fecha de instalacion";
  if (reason === "sin_fecha_atencion") return "Sin fecha de atencion";
  if (reason === "sin_codigo_y_cliente") return "Sin codigo y cliente";
  if (reason === "otro_partner") return "Otro partner";
  if (reason === "fuera_ventana_30_dias") return "Fuera de ventana 30 dias";
  return reason;
}

// ─── Subcomponentes ───────────────────────────────────────────────────────────

function StatChip({ label, value, tone }: { label: string; value: number; tone: "slate" | "emerald" | "amber" | "blue" }) {
  const cls =
    tone === "emerald" ? "border-emerald-200 bg-emerald-50 text-emerald-950"
    : tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-950"
    : tone === "blue" ? "border-blue-200 bg-blue-50 text-blue-950"
    : "border-slate-200 bg-slate-50 text-slate-950";
  return (
    <div className={`rounded-xl border p-4 ${cls}`}>
      <div className="text-[10px] font-bold uppercase tracking-widest text-current opacity-60">{label}</div>
      <div className="mt-1 text-3xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function GarantiasCruceCargaClient() {
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function loadPeriods() {
    try {
      const res = await fetch("/api/ordenes/garantias/cruce/import", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || "ERROR"));
      setPeriods(Array.isArray(json.periods) ? json.periods : []);
    } catch {
      setPeriods([]);
    }
  }

  useEffect(() => {
    loadPeriods();
  }, []);

  function onDrop(ev: DragEvent<HTMLDivElement>) {
    ev.preventDefault();
    const dropped = ev.dataTransfer.files?.[0];
    if (dropped) {
      setFile(dropped);
      setPreview(null);
      setStep("idle");
      setError("");
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setPreview(null);
    setStep("idle");
    setError("");
  }

  function resetToIdle() {
    setFile(null);
    setPreview(null);
    setStep("idle");
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function analyzeFile() {
    if (!file) {
      toast.error("Selecciona un archivo XLSX");
      return;
    }
    setStep("analyzing");
    setError("");
    setPreview(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/ordenes/garantias/cruce/preview", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || "ERROR"));
      setPreview(json as PreviewResult);
      setStep("preview");
    } catch (e: any) {
      const msg = String(e?.message || "ERROR");
      setError(msg);
      toast.error(msg);
      setStep("idle");
    }
  }

  async function confirmUpload() {
    if (!file) return;
    setStep("uploading");
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/ordenes/garantias/cruce/import", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || "ERROR"));
      setResult(json.result);
      setPeriods(Array.isArray(json.periods) ? json.periods : []);
      toast.success(`Excel guardado para cruce · ${json.result?.validRows ?? 0} garantias`);
      setStep("done");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (e: any) {
      const msg = String(e?.message || "ERROR");
      setError(msg);
      toast.error(msg);
      setStep("preview");
    }
  }

  const isAnalyzing = step === "analyzing";
  const isUploading = step === "uploading";
  const showPreview = step === "preview" && preview;
  const showDone = step === "done" && result;

  return (
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[#30518c]">Garantias · Carga de datos</div>
            <h1 className="mt-2 text-2xl font-bold text-slate-950 dark:text-slate-100">Cargar Excel del proveedor</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Sube el archivo enviado por el proveedor. REDES analiza el contenido y te muestra un resumen antes de guardar. Los datos se organizan por mes de instalacion.
            </p>
          </div>
          <Link
            href="/home/garantias/cruce"
            className="flex h-9 shrink-0 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Ver cruce
          </Link>
        </div>
      </section>

      {/* ── Carga ───────────────────────────────────────────────────────── */}
      {!showDone ? (
        <section className="grid gap-4 xl:grid-cols-2">
          {/* Panel izquierdo: dropzone + boton */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {step === "preview" ? "Archivo seleccionado" : "Seleccionar archivo"}
            </h2>

            {step === "idle" || step === "analyzing" ? (
              <>
                <div
                  onDrop={onDrop}
                  onDragOver={(ev) => ev.preventDefault()}
                  className="flex min-h-[11rem] flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition hover:border-[#30518c] hover:bg-blue-50/30 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-[#30518c]"
                >
                  <svg className="mb-3 h-10 w-10 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 5.25 5.25 0 011.96 10.59H6.75z" />
                  </svg>
                  <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Arrastra el archivo aqui o seleccionalo
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Formato XLSX · Hoja Garantia · Columnas: cod_pedido, nombre, Fecha atencion, PARTNER_INSTALADOR, FECHA DE INSTALACION
                  </div>
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={onFileChange}
                  />
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    Seleccionar archivo
                  </button>
                  {file ? (
                    <div className="mt-3 flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700">
                      <svg className="h-4 w-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <span className="font-medium">{file.name}</span>
                      <span className="text-slate-400">{formatFileSize(file.size)}</span>
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  disabled={isAnalyzing || !file}
                  onClick={analyzeFile}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#30518c] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#263f73] disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {isAnalyzing ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Analizando archivo...
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                      </svg>
                      Analizar archivo
                    </>
                  )}
                </button>
              </>
            ) : (
              // Vista del archivo en estado preview/uploading
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#30518c]/10">
                    <svg className="h-5 w-5 text-[#30518c]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{preview?.fileName}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {preview ? formatFileSize(preview.fileSize) : ""} · Hoja: {preview?.sheetName}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={resetToIdle}
                  disabled={isUploading}
                  className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                >
                  Cambiar archivo
                </button>
              </div>
            )}

            {error ? (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
                {error}
              </div>
            ) : null}
          </div>

          {/* Panel derecho: preview o placeholder */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            {!showPreview && !isAnalyzing ? (
              <div className="flex h-full min-h-[16rem] flex-col items-center justify-center text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                  <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                  </svg>
                </div>
                <p className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-300">Aqui apareceran los resultados del analisis</p>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Selecciona un archivo y haz clic en <span className="font-semibold">Analizar archivo</span></p>
              </div>
            ) : isAnalyzing ? (
              <div className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-3 text-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#30518c]" />
                <p className="text-sm text-slate-500">Analizando el contenido del archivo...</p>
              </div>
            ) : showPreview ? (
              <div className="space-y-5">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Resumen del analisis</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Revisa los datos antes de confirmar la carga</p>
                </div>

                {/* Counters */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatChip label="Filas Excel" value={preview.totalRows} tone="slate" />
                  <StatChip label="Validas" value={preview.validRows} tone="emerald" />
                  <StatChip label="Omitidas" value={preview.omittedRows} tone="amber" />
                  <StatChip label="Meses" value={preview.months.length} tone="blue" />
                </div>

                {/* Razones de omision */}
                {Object.keys(preview.omittedByReason || {}).length ? (
                  <div>
                    <div className="mb-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Razones de omision</div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(preview.omittedByReason).map(([reason, total]) => (
                        <span key={reason} className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                          {reasonLabel(reason)}: {total}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Meses detectados */}
                <div>
                  <div className="mb-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Meses detectados</div>
                  <div className="space-y-2">
                    {preview.months.map((month) => (
                      <div key={month.instYm} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{formatMonthFull(month.instYm)}</span>
                          <span className="text-sm font-bold tabular-nums text-[#30518c]">{month.total} garantias</span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">Atenciones: {attentionLabel(month.attentionMonths)}</div>

                        {/* Muestra de filas */}
                        {preview.sampleByMonth[month.instYm]?.length ? (
                          <div className="mt-2 overflow-x-auto">
                            <table className="min-w-full text-xs">
                              <thead>
                                <tr className="text-left text-[10px] uppercase text-slate-400">
                                  <th className="pr-3 py-1 font-semibold">Cod pedido</th>
                                  <th className="pr-3 py-1 font-semibold">Cliente</th>
                                  <th className="pr-3 py-1 font-semibold">F. inst.</th>
                                  <th className="pr-3 py-1 font-semibold">F. garantia</th>
                                  <th className="pr-3 py-1 font-semibold">Dias</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {preview.sampleByMonth[month.instYm].map((row, i) => (
                                  <tr key={i} className="text-slate-600 dark:text-slate-300">
                                    <td className="whitespace-nowrap pr-3 py-1 tabular-nums">{row.codPedido || "-"}</td>
                                    <td className="pr-3 py-1 max-w-[140px] truncate">{row.nombre || "-"}</td>
                                    <td className="whitespace-nowrap pr-3 py-1 tabular-nums">{formatYmd(row.fechaInstalacionYmd)}</td>
                                    <td className="whitespace-nowrap pr-3 py-1 tabular-nums">{formatYmd(row.fechaAtencionYmd)}</td>
                                    <td className="whitespace-nowrap py-1 tabular-nums">{row.diasDesdeInstalacion ?? "-"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {(preview.months.find(m => m.instYm === month.instYm)?.total ?? 0) > (preview.sampleByMonth[month.instYm]?.length ?? 0) ? (
                              <div className="mt-1 text-[10px] text-slate-400">
                                + {(preview.months.find(m => m.instYm === month.instYm)?.total ?? 0) - (preview.sampleByMonth[month.instYm]?.length ?? 0)} registros mas...
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Acciones */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={resetToIdle}
                    className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={confirmUpload}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#30518c] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#263f73] disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {isUploading ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Guardando...
                      </>
                    ) : (
                      <>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Confirmar y guardar
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ── Resultado guardado ───────────────────────────────────────────── */}
      {showDone ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm dark:border-emerald-800 dark:bg-emerald-950">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900">
              <svg className="h-5 w-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">Excel guardado correctamente</h2>
              <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-300">{result.fileName} · Hoja: {result.sheetName}</p>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2 dark:border-emerald-800 dark:bg-emerald-900">
                  <div className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">Filas Excel</div>
                  <div className="mt-1 text-2xl font-bold text-emerald-900 dark:text-emerald-100">{result.totalRows}</div>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2 dark:border-emerald-800 dark:bg-emerald-900">
                  <div className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">Validas</div>
                  <div className="mt-1 text-2xl font-bold text-emerald-900 dark:text-emerald-100">{result.validRows}</div>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2 dark:border-emerald-800 dark:bg-emerald-900">
                  <div className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">Omitidas</div>
                  <div className="mt-1 text-2xl font-bold text-emerald-900 dark:text-emerald-100">{result.omittedRows}</div>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2 dark:border-emerald-800 dark:bg-emerald-900">
                  <div className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">Meses</div>
                  <div className="mt-1 text-2xl font-bold text-emerald-900 dark:text-emerald-100">{result.months.length}</div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {result.months.map((month) => (
                  <Link
                    key={month.instYm}
                    href={`/home/garantias/cruce?instYm=${encodeURIComponent(month.instYm)}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
                  >
                    Ver cruce {formatMonthFull(month.instYm)}
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </Link>
                ))}
                <button
                  type="button"
                  onClick={() => { setStep("idle"); setResult(null); }}
                  className="inline-flex items-center rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-emerald-800 dark:bg-emerald-900 dark:text-slate-300"
                >
                  Cargar otro archivo
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* ── Meses guardados ──────────────────────────────────────────────── */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-100">Meses con datos guardados</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Cada mes usa la ultima carga que lo contenia. Disponibles para cruce inmediato.</p>
        </div>
        <div className="overflow-x-auto p-5">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500 dark:border-slate-700">
                <th className="px-3 py-2 font-semibold">Mes instalacion</th>
                <th className="px-3 py-2 text-right font-semibold">Garantias</th>
                <th className="px-3 py-2 font-semibold">Atenciones</th>
                <th className="px-3 py-2 font-semibold">Archivo</th>
                <th className="px-3 py-2 font-semibold">Fecha carga</th>
                <th className="px-3 py-2 text-right font-semibold">Accion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {periods.map((period) => (
                <tr key={period.instYm} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-slate-100">{formatMonthFull(period.instYm)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium text-slate-700 dark:text-slate-200">{period.totalRows}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">{attentionLabel(period.attentionMonths)}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300 max-w-[200px] truncate" title={period.fileName}>{period.fileName || "-"}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">{formatDateTime(period.uploadedAtText)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <Link
                      href={`/home/garantias/cruce?instYm=${encodeURIComponent(period.instYm)}`}
                      className="text-xs font-semibold text-[#30518c] hover:underline dark:text-blue-400"
                    >
                      Ver cruce
                    </Link>
                  </td>
                </tr>
              ))}
              {!periods.length ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-400">
                    No hay meses guardados. Carga el primer Excel para comenzar.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
