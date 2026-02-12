"use client";

import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";

import { importInconcertAction } from "./actions";
import {
  hasMinimumData,
  INCONCERT_PREVIEW_COLUMNS,
  mapCsvRow,
  type InconcertMappedRow,
} from "./csvMapping";

export default function ImportarInconcertClient() {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<InconcertMappedRow[]>([]);
  const [rawCount, setRawCount] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [notice, setNotice] = useState("");
  const [summary, setSummary] = useState<null | { nuevos: number; existentes: number; batches: number }>(null);
  const [result, action, pending] = useActionState(importInconcertAction as any, null as any);
  const inputRef = useRef<HTMLInputElement>(null);

  const previewSlice = useMemo(() => rows.slice(0, 200), [rows]);

  useEffect(() => {
    if (!result) return;
    if ((result as any).ok) {
      const r = (result as any).resumen;
      setSummary(r);
      setRows([]);
      setNotice("Guardado completado.");
      toast.success("Importacion completada");
    } else {
      const msg = (result as any)?.error?.formErrors?.join(", ") || "Error al importar";
      toast.error(msg);
      setNotice(msg);
    }
  }, [result]);

  async function parseSelectedFile() {
    if (!file) return;
    setParsing(true);
    setNotice("Leyendo CSV...");
    setSummary(null);
    setRows([]);
    setRawCount(0);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: false, raw: false });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error("SHEET_NOT_FOUND");
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
      const filtered = rawRows.filter(hasMinimumData);
      const mapped = filtered.map(mapCsvRow);
      setRawCount(filtered.length);
      setRows(mapped);
      setNotice(`Se cargaron ${mapped.length} filas para previsualizacion.`);
      toast.success("CSV leido correctamente");
    } catch (e: any) {
      const msg = String(e?.message || "Error al leer CSV");
      setNotice(msg);
      toast.error(msg);
    } finally {
      setParsing(false);
    }
  }

  function resetAll() {
    setFile(null);
    setRows([]);
    setRawCount(0);
    setSummary(null);
    setNotice("");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4 space-y-3">
        <h2 className="text-lg font-semibold">Importar InConcert (CSV)</h2>

        <div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.currentTarget.files?.[0] || null;
              setFile(f);
              setRows([]);
              setSummary(null);
              setNotice("");
            }}
          />
          <button
            type="button"
            className="rounded border px-3 py-2 text-sm"
            onClick={() => inputRef.current?.click()}
          >
            Seleccionar archivo CSV
          </button>
          <div className="mt-2 text-sm text-muted-foreground">
            {file ? `Archivo: ${file.name}` : "Ningun archivo seleccionado"}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!file || parsing || pending}
            className="rounded bg-blue-600 text-white px-3 py-2 text-sm disabled:opacity-60"
            onClick={parseSelectedFile}
          >
            {parsing ? "Leyendo CSV..." : "Leer CSV"}
          </button>

          <button
            type="button"
            disabled={!file || rows.length === 0 || pending}
            className="rounded bg-emerald-600 text-white px-3 py-2 text-sm disabled:opacity-60"
            onClick={() => {
              if (!file) return;
              const fd = new FormData();
              fd.set("file", file);
              startTransition(() => (action as any)(fd));
            }}
          >
            {pending ? "Guardando..." : "Guardar en Firestore"}
          </button>

          {summary ? (
            <button type="button" className="rounded bg-slate-700 text-white px-3 py-2 text-sm" onClick={resetAll}>
              Nueva importacion
            </button>
          ) : null}
        </div>

        {notice ? <div className="text-sm">{notice}</div> : null}
        {rawCount > 0 && !summary ? (
          <div className="text-xs text-muted-foreground">Filas validas para importar: {rawCount}</div>
        ) : null}
      </div>

      {pending ? (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center">
          <div className="rounded-lg bg-white p-4 shadow text-sm">Guardando datos, por favor espera...</div>
        </div>
      ) : null}

      {previewSlice.length > 0 && !summary ? (
        <div className="rounded-lg border overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                {INCONCERT_PREVIEW_COLUMNS.map((h) => (
                  <th key={h.key} className="px-2 py-2 text-left whitespace-nowrap border-b">
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewSlice.map((r, idx) => (
                <tr key={idx} className="border-b">
                  {INCONCERT_PREVIEW_COLUMNS.map((h) => (
                    <td key={h.key} className="px-2 py-1 whitespace-nowrap">
                      {String((r[h.key] ?? "") as string)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {summary ? (
        <div className="rounded-lg border p-4 bg-emerald-50">
          <h3 className="font-semibold mb-2">Resumen de importacion</h3>
          <div className="text-sm">Nuevos insertados: <b>{summary.nuevos}</b></div>
          <div className="text-sm">Omitidos por duplicidad: <b>{summary.existentes}</b></div>
          <div className="text-sm">Batches ejecutados: <b>{summary.batches}</b></div>
        </div>
      ) : null}
    </div>
  );
}

