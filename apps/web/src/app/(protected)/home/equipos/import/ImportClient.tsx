"use client";

import React from "react";
import { useActionState, useEffect, useMemo, useRef, useState, startTransition } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { parseEquiposAction, saveEquiposChunkAction, notifyEquiposImportAction } from "./actions";

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

export default function ImportClient() {
  const [rowsPreview, setRowsPreview] = useState<any[][]>([]);
  const [page, setPage] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, parseAction, parsePending] = useActionState(parseEquiposAction as any, null as any);
  const [saveResult, _saveAction, savePending] = useActionState(async () => null as any, null as any);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"nuevos" | "duplicados">("nuevos");
  const [q, setQ] = useState("");

  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(rowsPreview.length / pageSize));
  const slice = useMemo(() => rowsPreview.slice((page - 1) * pageSize, page * pageSize), [rowsPreview, page]);

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  useEffect(() => {
    if (!parseResult) return;
    if ((parseResult as any).ok) {
      toast.success("Análisis completado", { description: `Nuevos: ${(parseResult as any).data.totalNuevos}` });
    } else {
      const msg = (parseResult as any)?.error?.formErrors?.join(", ") || "Error al analizar";
      toast.error(msg);
    }
  }, [parseResult]);

  useEffect(() => {
    // no-op: guardamos por chunks manualmente
  }, [saveResult]);

  async function handleFiles(fs: FileList | null) {
    const f = fs && fs[0];
    if (!f) return;
    setFile(f);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const sheet = wb.Sheets["Hoja de Datos"] ?? wb.Sheets[wb.SheetNames[0]];
      if (!sheet) {
        setRowsPreview([]);
        return;
      }
      const arr: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      // Drop header row for preview if present
      const preview = arr.slice(1);
      setRowsPreview(preview);
      setPage(1);
    } catch (e) {
      console.error(e);
      setRowsPreview([]);
    }
  }

  function onDrop(ev: React.DragEvent) {
    ev.preventDefault();
    handleFiles(ev.dataTransfer.files);
  }

  function onDragOver(ev: React.DragEvent) {
    ev.preventDefault();
  }

  function downloadTemplate() {
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
  }

  function exportDuplicados() {
    const d = (parseResult as any)?.data;
    if (!d) return;
    const rows = d.duplicadosBD.map((x: any) => ({ SN: x.SN, equipo: x.equipo ?? "", descripcion: x.descripcion ?? "", ubicacion: x.ubicacion ?? "" }));
    const ws = XLSX.utils.json_to_sheet(rows, { header: ["SN", "equipo", "descripcion", "ubicacion"] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Duplicados");
    XLSX.writeFile(wb, "equipos_duplicados.xlsx");
  }

  const nuevosFiltered = useMemo(() => {
    const list = (parseResult?.ok ? (parseResult as any).data.nuevos : []) as any[];
    if (!q) return list;
    const needle = q.toLowerCase();
    return list.filter((x) => [x.SN, x.equipo, x.descripcion, x.ubicacion].some((v: any) => String(v ?? "").toLowerCase().includes(needle)));
  }, [parseResult, q]);

  const duplicadosFiltered = useMemo(() => {
    const list = (parseResult?.ok ? (parseResult as any).data.duplicadosBD : []) as any[];
    if (!q) return list;
    const needle = q.toLowerCase();
    return list.filter((x) =>
      [x.SN, x.equipo, x.descripcion, x.ubicacion].some((v: any) => String(v ?? "").toLowerCase().includes(needle))
    );
  }, [parseResult, q]);

  return (
    <div className="space-y-5 text-slate-900 dark:text-slate-100">
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
        <button onClick={downloadTemplate} className="rounded-xl border border-slate-300 bg-white px-3 py-2 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">
          Descargar Plantilla
        </button>
      </div>

      <div onDrop={onDrop} onDragOver={onDragOver} className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-2">Arrastra tu archivo .xlsx aquí</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">Primera hoja o "Hoja de Datos"; usa headers de la plantilla</div>
        <div className="mt-3">
          <button className="rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-700" onClick={() => inputRef.current?.click()}>
            Seleccionar archivo
          </button>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => handleFiles(e.currentTarget.files)}
          />
        </div>
        {file && <div className="mt-2 text-sm">Archivo: {file.name}</div>}

        <form className="pt-4">
          <input name="file" type="file" className="hidden" readOnly onChange={() => {}} />
          <button
            type="button"
            disabled={!file || parsePending}
            title={!file ? "Selecciona un archivo para habilitar" : undefined}
            className="rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={async () => {
              if (!file) return;
              const fd = new FormData();
              fd.set("file", file);
              startTransition(() => {
                (parseAction as any)(fd);
              });
            }}
          >
            {parsePending ? "Analizando..." : "Analizar"}
          </button>
        </form>
      </div>

      {rowsPreview.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-500 dark:text-slate-400">Vista previa (primeras filas): {rowsPreview.length}</div>
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
              <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800">
                Prev
              </button>
              <div className="text-sm">{page}/{totalPages}</div>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800">
                Next
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 dark:text-slate-100">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <th key={i} className="px-2 py-1 text-left">
                      {i}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slice.map((r, idx) => (
                  <tr key={idx} className="border-b border-slate-200 dark:border-slate-700">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <td key={i} className="px-2 py-1 whitespace-nowrap max-w-[240px] overflow-hidden text-ellipsis">{String(r[i] ?? "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {parseResult?.ok && (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-3 border-b border-slate-200 pb-2 dark:border-slate-700">
            <button onClick={() => setTab("nuevos")} className={`px-2 py-1 rounded ${tab === "nuevos" ? "bg-slate-100 dark:bg-slate-800" : ""}`}>
              Nuevos: {parseResult.data.totalNuevos}
            </button>
            <button onClick={() => setTab("duplicados")} className={`px-2 py-1 rounded ${tab === "duplicados" ? "bg-slate-100 dark:bg-slate-800" : ""}`}>
              Duplicados BD: {parseResult.data.duplicadosBD.length}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div>Conteo por equipo</div>
              <ul className="list-disc pl-5">
                <li>ONT: {parseResult.data.conteoPorEquipo.ONT ?? 0}</li>
                <li>MESH: {parseResult.data.conteoPorEquipo.MESH ?? 0}</li>
                <li>FONO: {parseResult.data.conteoPorEquipo.FONO ?? 0}</li>
                <li>BOX: {parseResult.data.conteoPorEquipo.BOX ?? 0}</li>
              </ul>
            </div>
            <div className="text-sm">
              <div>Duplicados internos (Excel): {parseResult.data.duplicadosInternosExcel}</div>
              <div>Filas inválidas: {parseResult.data.invalidas}</div>
              <div>Ubicaciones inválidas reasignadas: {parseResult.data.ubicacionesInvalidas}</div>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar SN/descripcion/equipo/ubicacion"
              className="w-full rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <button
              type="button"
              disabled={!file || saving}
              className="rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => {
                (async () => {
                  if (!file || !parseResult?.ok) return;
                  try {
                    const nuevos = (parseResult as any).data.nuevos as { SN: string }[];
                    const total = nuevos.length;
                    setSaving(true);
                    setSaved(0);
                    const chunkSize = 100;
                    let localSaved = 0;
                    for (let i = 0; i < total; i += chunkSize) {
                      const part = nuevos.slice(i, i + chunkSize).map((x) => x.SN);
                      const fd = new FormData();
                      fd.set("file", file);
                      fd.set("sns", JSON.stringify(part));
                      const res = await saveEquiposChunkAction(fd);
                      if ((res as any)?.ok) {
                        const inc = (res as any).saved || 0;
                        localSaved += inc;
                        setSaved((s) => s + inc);
                      } else {
                        const msg = (res as any)?.error?.formErrors?.join(", ") || "Error al guardar";
                        toast.error(msg);
                        return;
                      }
                    }
                    await notifyEquiposImportAction({ totalGuardados: localSaved, duplicados: (parseResult as any).data.duplicadosBD.length });
                    toast.success("Importación de equipos completada", {
                      description: `Nuevos: ${localSaved}/${total}`,
                    });
                  } catch (e: any) {
                    console.error("IMPORT_EQUIPOS_SAVE_FAILED", e);
                    const msg = String(e?.message ?? "");
                    const maybeBodyLimit = msg.toLowerCase().includes("body") || msg.toLowerCase().includes("payload");
                    toast.error(
                      maybeBodyLimit
                        ? "Archivo demasiado grande para procesar. Intenta con menos filas o aumenta bodySizeLimit."
                        : "Error inesperado al guardar equipos"
                    );
                  } finally {
                    setSaving(false);
                  }
                })();
              }}
            >
              {saving ? "Guardando..." : "Guardar nuevos"}
            </button>
          </div>

          {tab === "duplicados" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                <button onClick={exportDuplicados} className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                  Exportar duplicados
                </button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-800 dark:text-slate-100">
                      <th className="px-2 py-1 text-left">SN</th>
                      <th className="px-2 py-1 text-left">Equipo</th>
                      <th className="px-2 py-1 text-left">Descripción</th>
                      <th className="px-2 py-1 text-left">Ubicación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {duplicadosFiltered.map((d: any) => (
                      <tr key={d.SN} className="border-b border-slate-200 dark:border-slate-700">
                        <td className="px-2 py-1">{d.SN}</td>
                        <td className="px-2 py-1">{d.equipo}</td>
                        <td className="px-2 py-1">{d.descripcion}</td>
                        <td className="px-2 py-1">{d.ubicacion}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "nuevos" && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 dark:text-slate-100">
                    <th className="px-2 py-1 text-left">SN</th>
                    <th className="px-2 py-1 text-left">Equipo</th>
                    <th className="px-2 py-1 text-left">Descripción</th>
                    <th className="px-2 py-1 text-left">Ubicación</th>
                    <th className="px-2 py-1 text-left">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {nuevosFiltered.map((n: any) => (
                    <tr key={n.SN} className="border-b border-slate-200 dark:border-slate-700">
                      <td className="px-2 py-1">{n.SN}</td>
                      <td className="px-2 py-1">{n.equipo}</td>
                      <td className="px-2 py-1">{n.descripcion}</td>
                      <td className="px-2 py-1">{n.ubicacion}</td>
                      <td className="px-2 py-1">{n.estado}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {(saving || parsePending) && (
        <div className="fixed inset-0 bg-black/25 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="w-[360px] space-y-2 rounded bg-white p-4 text-center shadow-md dark:bg-slate-900 dark:text-slate-100">
            <div className="font-medium">{saving ? "Guardando equipos..." : "Analizando archivo..."}</div>
            <div className="text-sm text-slate-500 dark:text-slate-400">{saving && parseResult?.ok ? `${saved}/${(parseResult as any).data.totalNuevos} (${Math.round(((saved || 0) / Math.max(1, (parseResult as any).data.totalNuevos)) * 100)}%)` : "Por favor espera"}</div>
          </div>
        </div>
      )}
    </div>
  );
}


