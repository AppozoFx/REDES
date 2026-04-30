"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { notifyEquiposImportAction, parseEquiposAction, saveEquiposChunkAction } from "./actions";

type ParseResult = Awaited<ReturnType<typeof parseEquiposAction>>;

const HEADERS = [
  "SN",
  "equipo",
  "proId",
  "descripcion",
  "ubicacion",
  "f_ingreso",
  "f_despacho",
  "f_devolucion",
  "f_instalado",
  "guia_ingreso",
  "guia_despacho",
  "guia_devolucion",
  "cliente",
  "codigoCliente",
  "caso",
  "observacion",
  "tecnicos",
  "pri_tec",
  "tec_liq",
  "inv",
];

function getFileFingerprint(file: File | null): string {
  if (!file) return "";
  return [file.name, file.size, file.lastModified].join(":");
}

function getReadableError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && "type" in error) {
    const type = String((error as { type?: unknown }).type ?? "").trim();
    return type ? `Evento del navegador: ${type}` : "Evento inesperado del navegador";
  }
  return "Error inesperado";
}

export default function ImportClient() {
  const [rowsPreview, setRowsPreview] = useState<any[][]>([]);
  const [page, setPage] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<ParseResult | null>(null);
  const [parsePending, setParsePending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [alreadyExistsDuringSave, setAlreadyExistsDuringSave] = useState(0);
  const [tab, setTab] = useState<"nuevos" | "duplicados">("nuevos");
  const [q, setQ] = useState("");
  const [analysisInvalidated, setAnalysisInvalidated] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const latestFingerprintRef = useRef("");

  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(rowsPreview.length / pageSize));
  const slice = useMemo(() => rowsPreview.slice((page - 1) * pageSize, page * pageSize), [rowsPreview, page]);

  const currentFingerprint = getFileFingerprint(file);
  const analysisOk = analysis?.ok ? analysis : null;
  const analysisMatchesCurrent = Boolean(analysisOk && analysisOk.data.fileFingerprint === currentFingerprint);
  const readyToImport = Boolean(analysisOk && analysisMatchesCurrent && analysisOk.data.importRows.length > 0);

  useEffect(() => {
    latestFingerprintRef.current = currentFingerprint;
  }, [currentFingerprint]);

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  async function handleFiles(fs: FileList | null) {
    if (saving || parsePending) return;
    const nextFile = fs?.[0] ?? null;
    if (!nextFile) return;

    const hadSuccessfulAnalysis = Boolean(analysisOk);
    setParsePending(false);
    setFile(nextFile);
    setAnalysis(null);
    setAnalysisInvalidated(hadSuccessfulAnalysis);
    setSaved(0);
    setProcessed(0);
    setAlreadyExistsDuringSave(0);
    setQ("");
    setTab("nuevos");

    try {
      const buf = await nextFile.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const sheet = wb.Sheets["Hoja de Datos"] ?? wb.Sheets[wb.SheetNames[0]];
      if (!sheet) {
        setRowsPreview([]);
        return;
      }
      const arr: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      setRowsPreview(arr.slice(1));
      setPage(1);
    } catch (error) {
      console.error(error);
      setRowsPreview([]);
      toast.error(`No se pudo leer el archivo seleccionado: ${getReadableError(error)}`);
    }
  }

  function onDrop(ev: React.DragEvent) {
    ev.preventDefault();
    void handleFiles(ev.dataTransfer.files);
  }

  function onDragOver(ev: React.DragEvent) {
    ev.preventDefault();
  }

  function downloadTemplate() {
    try {
      const ws = XLSX.utils.aoa_to_sheet([
        HEADERS,
        [
          "SN-EJEMPLO-123",
          "ONT",
          "PRO12345",
          "Modelo ABC",
          "K1 MOTO",
          "12/02/2026",
          "",
          "",
          "",
          "GI-0001",
          "",
          "",
          "Cliente Ejemplo",
          "CL123",
          "",
          "Observación de prueba",
          "TEC1,TEC2",
          "NO",
          "NO",
          "NO",
        ],
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
      XLSX.writeFile(wb, "Plantilla ingreso equipos.xlsx");
    } catch (error) {
      console.error("DOWNLOAD_TEMPLATE_FAILED", error);
      toast.error(`No se pudo descargar la plantilla: ${getReadableError(error)}`);
    }
  }

  function exportDuplicados() {
    try {
      const data = analysisOk?.data;
      if (!data) return;
      const rows = data.duplicadosBD.map((item) => ({
        SN: item.SN,
        equipo: item.equipo ?? "",
        descripcion: item.descripcion ?? "",
        ubicacion: item.ubicacion ?? "",
      }));
      const ws = XLSX.utils.json_to_sheet(rows, { header: ["SN", "equipo", "descripcion", "ubicacion"] });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Duplicados");
      XLSX.writeFile(wb, "equipos_duplicados.xlsx");
    } catch (error) {
      console.error("EXPORT_DUPLICADOS_FAILED", error);
      toast.error(`No se pudo exportar duplicados: ${getReadableError(error)}`);
    }
  }

  const nuevosFiltered = useMemo(() => {
    const list = analysisOk?.data.nuevos ?? [];
    if (!q) return list;
    const needle = q.toLowerCase();
    return list.filter((item) => [item.SN, item.equipo, item.descripcion, item.ubicacion].some((value) => String(value ?? "").toLowerCase().includes(needle)));
  }, [analysisOk, q]);

  const duplicadosFiltered = useMemo(() => {
    const list = analysisOk?.data.duplicadosBD ?? [];
    if (!q) return list;
    const needle = q.toLowerCase();
    return list.filter((item) =>
      [item.SN, item.equipo, item.descripcion, item.ubicacion].some((value) => String(value ?? "").toLowerCase().includes(needle))
    );
  }, [analysisOk, q]);

  async function analyzeCurrentFile() {
    if (!file) return;
    const fileFingerprint = getFileFingerprint(file);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("fileFingerprint", fileFingerprint);

    setParsePending(true);
    setAnalysisInvalidated(false);

    try {
      const result = await parseEquiposAction(fd);
      if (latestFingerprintRef.current !== fileFingerprint) return;

      setAnalysis(result);
      if (result.ok) {
        toast.success("Análisis completado", {
          description: `Nuevos: ${result.data.totalNuevos} · Duplicados BD: ${result.data.duplicadosBD.length}`,
        });
      } else {
        toast.error(result.error.formErrors.join(", ") || "Error al analizar");
      }
    } catch (error) {
      console.error(error);
      toast.error(`No se pudo analizar el archivo: ${getReadableError(error)}`);
    } finally {
      if (latestFingerprintRef.current === fileFingerprint) {
        setParsePending(false);
      }
    }
  }

  async function saveImport() {
    if (!analysisOk || !analysisMatchesCurrent) {
      toast.error("Vuelve a analizar el archivo actual antes de importar");
      return;
    }

    const total = analysisOk.data.importRows.length;
    const chunkSize = 200;
    let createdTotal = 0;
    let processedTotal = 0;
    let alreadyExistsTotal = 0;

    setSaving(true);
    setSaved(0);
    setProcessed(0);
    setAlreadyExistsDuringSave(0);

    try {
      for (let start = 0; start < total; start += chunkSize) {
        const chunk = analysisOk.data.importRows.slice(start, start + chunkSize);
        const fd = new FormData();
        fd.set("rows", JSON.stringify(chunk));
        const result = await saveEquiposChunkAction(fd);
        if (!result.ok) {
          toast.error(result.error.formErrors.join(", ") || "Error al guardar");
          return;
        }

        createdTotal += result.data.created;
        processedTotal += result.data.requested;
        alreadyExistsTotal += result.data.alreadyExists;
        setSaved(createdTotal);
        setProcessed(processedTotal);
        setAlreadyExistsDuringSave(alreadyExistsTotal);
      }

      await notifyEquiposImportAction({
        totalGuardados: createdTotal,
        duplicados: analysisOk.data.duplicadosBD.length,
        yaExistian: alreadyExistsTotal,
      });

      toast.success("Importación completada", {
        description: `Creados: ${createdTotal}/${total} · Ya existentes al guardar: ${alreadyExistsTotal}`,
      });
    } catch (error: any) {
      console.error("IMPORT_EQUIPOS_SAVE_FAILED", error);
      const msg = String(error?.message ?? "");
      const maybeBodyLimit = msg.toLowerCase().includes("body") || msg.toLowerCase().includes("payload");
      toast.error(
        maybeBodyLimit
          ? "La carga superó el límite del servidor. Reduce el tamaño del chunk o revisa bodySizeLimit."
          : `Error inesperado al guardar equipos: ${getReadableError(error)}`
      );
    } finally {
      setSaving(false);
    }
  }

  const stepCards = [
    {
      title: "1. Selecciona el archivo",
      description: file ? file.name : "Carga un Excel con la plantilla de equipos.",
      status: file ? "listo" : "pendiente",
    },
    {
      title: "2. Analiza y valida",
      description: analysisMatchesCurrent
        ? `Análisis vigente con ${analysisOk?.data.totalNuevos ?? 0} series nuevas.`
        : analysisInvalidated
          ? "Cambiaste el archivo; vuelve a analizar antes de importar."
          : "Confirma duplicados, inválidos y normalizaciones antes de guardar.",
      status: analysisMatchesCurrent ? "listo" : parsePending ? "proceso" : "pendiente",
    },
    {
      title: "3. Importa con control",
      description: readyToImport
        ? "Guardado create-only, sin sobrescribir series existentes."
        : "La importación se habilita cuando el archivo analizado coincide con el archivo actual.",
      status: saving ? "proceso" : readyToImport ? "listo" : "pendiente",
    },
  ];

  return (
    <div className="space-y-6 text-slate-900 dark:text-slate-100">
      <section className="rounded-[28px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.10),_transparent_42%),linear-gradient(135deg,_#ffffff,_#f8fafc)] p-5 shadow-sm dark:border-slate-700 dark:bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.18),_transparent_38%),linear-gradient(135deg,_rgba(15,23,42,1),_rgba(30,41,59,0.94))]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-700 dark:text-blue-300">Importación segura</p>
            <h2 className="text-2xl font-semibold text-slate-950 dark:text-slate-50">Carga masiva con validación previa y guardado sin sobreescritura</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              El flujo ahora obliga a trabajar siempre sobre el archivo analizado, detecta series existentes antes y durante el guardado,
              y procesa la importación por bloques para soportar cargas grandes con mejor trazabilidad.
            </p>
          </div>
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Descargar plantilla
          </button>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {stepCards.map((card) => (
          <div key={card.title} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/90">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{card.title}</div>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                  card.status === "listo"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                    : card.status === "proceso"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {card.status}
              </span>
            </div>
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{card.description}</p>
          </div>
        ))}
      </section>

      <section
        onDrop={onDrop}
        onDragOver={onDragOver}
        className="rounded-[32px] border border-dashed border-slate-300 bg-white p-6 shadow-sm transition dark:border-slate-600 dark:bg-slate-900"
      >
        <div className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="space-y-3">
            <div>
              <div className="text-lg font-semibold text-slate-950 dark:text-slate-50">Archivo de entrada</div>
              <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">Usa la primera hoja o una hoja llamada "Hoja de Datos".</div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5 dark:border-slate-700 dark:bg-slate-800/70">
              <div className="text-sm text-slate-700 dark:text-slate-200">Arrastra el archivo aquí o selecciónalo manualmente.</div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={saving || parsePending}
                  className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => inputRef.current?.click()}
                >
                  Seleccionar archivo
                </button>
                <button
                  type="button"
                  disabled={!file || parsePending || saving}
                  onClick={analyzeCurrentFile}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {parsePending ? "Analizando..." : "Analizar archivo"}
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  className="hidden"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(e) => void handleFiles(e.currentTarget.files)}
                />
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-slate-50 shadow-sm dark:border-slate-700">
            <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Estado actual</div>
            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="text-slate-400">Archivo</div>
                <div className="mt-1 font-medium text-white">{file ? file.name : "Sin archivo seleccionado"}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="text-slate-400">Análisis vigente</div>
                <div className="mt-1 font-medium text-white">
                  {analysisMatchesCurrent ? "Sí, listo para importar" : analysisInvalidated ? "No, fue invalidado por cambio de archivo" : "Aún no"}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="text-slate-400">Capacidad recomendada</div>
                <div className="mt-1 font-medium text-white">Hasta 3,000 series en bloques controlados</div>
              </div>
            </div>
          </div>
        </div>

        {analysisInvalidated && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            Cambiaste el archivo después del último análisis. El sistema bloquea la importación hasta que vuelvas a analizar el archivo actual.
          </div>
        )}
      </section>

      {rowsPreview.length > 0 && (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-base font-semibold text-slate-950 dark:text-slate-50">Vista previa del Excel</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">{rowsPreview.length} filas detectadas (sin contar cabecera)</div>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/80">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-slate-700"
              >
                Prev
              </button>
              <div className="text-sm">{page}/{totalPages}</div>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-slate-700"
              >
                Next
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 dark:text-slate-100">
                  {Array.from({ length: 10 }).map((_, index) => (
                    <th key={index} className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-200">
                      Col {index + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slice.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-slate-200 even:bg-slate-50/50 dark:border-slate-700 dark:even:bg-slate-800/30">
                    {Array.from({ length: 10 }).map((_, cellIndex) => (
                      <td key={cellIndex} className="max-w-[240px] overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2">
                        {String(row[cellIndex] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {analysisOk && (
        <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-base font-semibold text-slate-950 dark:text-slate-50">Resultado del análisis</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                {analysisMatchesCurrent ? "Este análisis corresponde al archivo actual." : "Este análisis ya no corresponde al archivo actual."}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar SN, descripción, equipo o ubicación"
                className="w-full min-w-[260px] rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
              <button
                type="button"
                disabled={saving || !analysisOk.data.duplicadosBD.length}
                onClick={exportDuplicados}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              >
                Exportar duplicados
              </button>
              <button
                type="button"
                disabled={!readyToImport || saving}
                onClick={saveImport}
                className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Importando..." : "Guardar nuevos"}
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-3xl border border-blue-100 bg-blue-50 p-4 dark:border-blue-400/25 dark:bg-blue-500/12">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300">Nuevos</div>
              <div className="mt-2 text-3xl font-semibold text-blue-950 dark:text-blue-100">{analysisOk.data.totalNuevos}</div>
            </div>
            <div className="rounded-3xl border border-amber-100 bg-amber-50 p-4 dark:border-amber-400/25 dark:bg-amber-500/12">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300">Duplicados BD</div>
              <div className="mt-2 text-3xl font-semibold text-amber-950 dark:text-amber-100">{analysisOk.data.duplicadosBD.length}</div>
            </div>
            <div className="rounded-3xl border border-rose-100 bg-rose-50 p-4 dark:border-rose-400/25 dark:bg-rose-500/12">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-700 dark:text-rose-300">Inválidas</div>
              <div className="mt-2 text-3xl font-semibold text-rose-950 dark:text-rose-100">{analysisOk.data.invalidas}</div>
            </div>
            <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4 dark:border-emerald-400/25 dark:bg-emerald-500/12">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">Ubicaciones corregidas</div>
              <div className="mt-2 text-3xl font-semibold text-emerald-950 dark:text-emerald-100">{analysisOk.data.ubicacionesInvalidas}</div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800/75">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Resumen operativo</div>
              <div className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                <div>Duplicados internos en Excel: {analysisOk.data.duplicadosInternosExcel}</div>
                <div>Conteo ONT: {analysisOk.data.conteoPorEquipo.ONT ?? 0}</div>
                <div>Conteo MESH: {analysisOk.data.conteoPorEquipo.MESH ?? 0}</div>
                <div>Conteo FONO: {analysisOk.data.conteoPorEquipo.FONO ?? 0}</div>
                <div>Conteo BOX: {analysisOk.data.conteoPorEquipo.BOX ?? 0}</div>
                <div>Importación segura: create-only, sin sobrescritura.</div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800/75">
              <div className="mb-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTab("nuevos")}
                  className={`rounded-2xl px-3 py-2 text-sm font-medium transition ${tab === "nuevos" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-white text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300 dark:ring-1 dark:ring-slate-700"}`}
                >
                  Nuevos ({analysisOk.data.totalNuevos})
                </button>
                <button
                  type="button"
                  onClick={() => setTab("duplicados")}
                  className={`rounded-2xl px-3 py-2 text-sm font-medium transition ${tab === "duplicados" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-white text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300 dark:ring-1 dark:ring-slate-700"}`}
                >
                  Duplicados ({analysisOk.data.duplicadosBD.length})
                </button>
              </div>

              {tab === "nuevos" && (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800 dark:text-slate-100">
                        <th className="px-3 py-2 text-left">SN</th>
                        <th className="px-3 py-2 text-left">Equipo</th>
                        <th className="px-3 py-2 text-left">Descripción</th>
                        <th className="px-3 py-2 text-left">Ubicación</th>
                        <th className="px-3 py-2 text-left">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nuevosFiltered.map((item) => (
                        <tr key={item.SN} className="border-b border-slate-200 even:bg-slate-50/60 dark:border-slate-700 dark:even:bg-slate-800/30">
                          <td className="px-3 py-2">{item.SN}</td>
                          <td className="px-3 py-2">{item.equipo}</td>
                          <td className="px-3 py-2">{item.descripcion}</td>
                          <td className="px-3 py-2">{item.ubicacion}</td>
                          <td className="px-3 py-2">{item.estado}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === "duplicados" && (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800 dark:text-slate-100">
                        <th className="px-3 py-2 text-left">SN</th>
                        <th className="px-3 py-2 text-left">Equipo</th>
                        <th className="px-3 py-2 text-left">Descripción</th>
                        <th className="px-3 py-2 text-left">Ubicación</th>
                      </tr>
                    </thead>
                    <tbody>
                      {duplicadosFiltered.map((item) => (
                        <tr key={item.SN} className="border-b border-slate-200 even:bg-slate-50/60 dark:border-slate-700 dark:even:bg-slate-800/30">
                          <td className="px-3 py-2">{item.SN}</td>
                          <td className="px-3 py-2">{item.equipo}</td>
                          <td className="px-3 py-2">{item.descripcion}</td>
                          <td className="px-3 py-2">{item.ubicacion}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {(saving || parsePending) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 backdrop-blur-sm">
          <div className="w-[420px] rounded-[28px] border border-slate-200 bg-white p-5 text-center shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600 dark:border-blue-500/20 dark:border-t-blue-300" />
            <div className="text-lg font-semibold">{saving ? "Importando equipos..." : "Analizando archivo..."}</div>
            <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {saving && analysisOk
                ? `${processed}/${analysisOk.data.totalNuevos} procesados · ${saved} creados · ${alreadyExistsDuringSave} ya existentes`
                : "Por favor espera mientras se procesa la información."}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
