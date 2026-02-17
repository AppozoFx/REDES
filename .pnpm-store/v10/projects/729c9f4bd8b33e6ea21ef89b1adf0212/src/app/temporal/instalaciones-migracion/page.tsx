"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

type ApiTemplate = {
  ok: boolean;
  headers: string[];
  rows: Record<string, any>[];
  count: number;
  error?: string;
};

export default function InstalacionesMigracionPage() {
  const [limit, setLimit] = useState(2000);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [allowCreate, setAllowCreate] = useState(false);
  const [dryRunInfo, setDryRunInfo] = useState<any>(null);
  const [lastResult, setLastResult] = useState<any>(null);

  const preview = useMemo(() => rows.slice(0, 3), [rows]);

  const downloadTemplate = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/instalaciones/template?limit=${encodeURIComponent(String(limit))}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as ApiTemplate;
      if (!res.ok || !data.ok) throw new Error(data?.error || "ERROR");

      const ws = XLSX.utils.json_to_sheet(data.rows, { header: data.headers });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Instalaciones");
      const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const name = `instalaciones_template_${data.count}.xlsx`;
      saveAs(new Blob([out], { type: "application/octet-stream" }), name);
    } catch (e: any) {
      alert(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  };

  const handleFile = async (f: File | null) => {
    setFile(f);
    setRows([]);
    setDryRunInfo(null);
    setLastResult(null);
    if (!f) return;
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
    setRows(data);
  };

  const runDry = async () => {
    if (!rows.length) return;
    setLoading(true);
    try {
      const res = await fetch("/api/instalaciones/template/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, dryRun: true, allowCreate }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || "ERROR");
      setDryRunInfo(data.summary);
    } catch (e: any) {
      alert(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  };

  const importNow = async () => {
    if (!rows.length) return;
    setLoading(true);
    try {
      const res = await fetch("/api/instalaciones/template/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, allowCreate }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || "ERROR");
      setLastResult(data.summary);
    } catch (e: any) {
      alert(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="rounded-xl border p-4 bg-white">
        <h1 className="text-xl font-bold">Instalaciones Migracion (temporal)</h1>
        <p className="text-sm text-slate-600">
          Descarga una plantilla con todos los campos actuales, edita y vuelve a subir para actualizar.
          Se usa <code>codigoCliente</code> como identificador (tambien acepta <code>id</code> como alias).
        </p>
        <div className="mt-3 flex items-center gap-3">
          <label className="text-sm">
            Limite docs:
            <input
              type="number"
              min={1}
              max={5000}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value || 0))}
              className="ml-2 w-24 border rounded px-2 py-1 text-sm"
            />
          </label>
          <button
            onClick={downloadTemplate}
            disabled={loading}
            className="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Generando..." : "Descargar plantilla"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border p-4 bg-white">
        <h2 className="text-lg font-semibold">Subir Excel</h2>
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => handleFile(e.target.files?.[0] || null)}
          className="mt-2"
        />
        {file && (
          <div className="mt-2 text-sm text-slate-600">
            Archivo: <strong>{file.name}</strong> - {rows.length} filas
          </div>
        )}

        <div className="mt-3 flex items-center gap-3">
          <label className="text-sm inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={allowCreate}
              onChange={(e) => setAllowCreate(e.target.checked)}
            />
            Crear si no existe
          </label>
          <button
            onClick={runDry}
            disabled={loading || rows.length === 0}
            className="px-3 py-1.5 rounded border text-sm hover:bg-slate-50 disabled:opacity-60"
          >
            {loading ? "Procesando..." : "Simular"}
          </button>
          <button
            onClick={importNow}
            disabled={loading || rows.length === 0}
            className="px-3 py-1.5 rounded bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-60"
          >
            {loading ? "Actualizando..." : "Actualizar ahora"}
          </button>
        </div>

        {dryRunInfo && (
          <div className="mt-3 text-sm">
            <div className="font-semibold">Simulacion</div>
            <div>Total: {dryRunInfo.total}</div>
            <div>Actualizables: {dryRunInfo.updated}</div>
            <div>Creables: {dryRunInfo.created}</div>
            <div>Sin ID: {dryRunInfo.skippedNoId}</div>
            <div>Sin cambios: {dryRunInfo.skippedEmpty}</div>
            <div>No existen: {dryRunInfo.skippedMissing}</div>
          </div>
        )}

        {lastResult && (
          <div className="mt-3 text-sm">
            <div className="font-semibold">Resultado</div>
            <div>Total: {lastResult.total}</div>
            <div>Actualizadas: {lastResult.updated}</div>
            <div>Creadas: {lastResult.created}</div>
            <div>Sin ID: {lastResult.skippedNoId}</div>
            <div>Sin cambios: {lastResult.skippedEmpty}</div>
            <div>No existen: {lastResult.skippedMissing}</div>
          </div>
        )}

        {preview.length > 0 && (
          <div className="mt-4">
            <div className="text-sm font-semibold">Vista previa (3 filas)</div>
            <pre className="mt-2 max-h-56 overflow-auto bg-slate-50 border rounded p-3 text-xs">
              {JSON.stringify(preview, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
