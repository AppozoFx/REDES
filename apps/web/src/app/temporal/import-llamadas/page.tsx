"use client";

import * as XLSX from "xlsx";
import { useRef, useState } from "react";

const HEADERS = [
  "ordenId",
  "telefono",
  "estadoLlamada",
  "horaInicioLlamada",
  "horaFinLlamada",
  "observacionLlamada",
];

export default function ImportLlamadasPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      HEADERS,
      [
        "ORD-000123",
        "999888777",
        "Contesto",
        "08:15",
        "08:21",
        "Cliente confirmo visita",
      ],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Llamadas");
    XLSX.writeFile(wb, "Plantilla_llamadas.xlsx");
  }

  async function handleUpload() {
    if (!file) return;
    setLoading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/ordenes/llamadas/import", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      setResult(data);
    } catch (e: any) {
      setResult({ ok: false, error: String(e?.message || "ERROR") });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-xl font-semibold">Importar Llamadas (Temporal)</h1>
      <div className="text-sm text-muted-foreground">
        Esta pagina es temporal y no requiere permisos. Elimina esta ruta despues de migrar.
      </div>

      <div className="flex gap-2">
        <button className="rounded border px-3 py-2" onClick={downloadTemplate}>
          Descargar plantilla
        </button>
        <button className="rounded border px-3 py-2" onClick={() => inputRef.current?.click()}>
          Seleccionar Excel
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => setFile(e.currentTarget.files?.[0] || null)}
        />
      </div>

      {file && <div className="text-sm">Archivo: {file.name}</div>}

      <button
        className="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50"
        disabled={!file || loading}
        onClick={handleUpload}
      >
        {loading ? "Importando..." : "Importar"}
      </button>

      {result && (
        <pre className="rounded border p-3 text-xs overflow-auto bg-muted/30">
{JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
