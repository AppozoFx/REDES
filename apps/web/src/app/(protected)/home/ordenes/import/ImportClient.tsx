"use client";

import { useActionState, useEffect, useMemo, useRef, useState, startTransition } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { importOrdenesAction } from "./actions";

export default function ImportClient() {
  const [rows, setRows] = useState<any[][]>([]);
  const [page, setPage] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [result, action, pending] = useActionState(importOrdenesAction as any, null as any);
  const inputRef = useRef<HTMLInputElement>(null);

  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const slice = useMemo(() => rows.slice((page - 1) * pageSize, page * pageSize), [rows, page]);

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  useEffect(() => {
    if (!result) return;
    if ((result as any).ok) {
      const resumen = (result as any).resumen as { nuevos: number; actualizados: number; duplicadosSinCambios: number };
      toast.success("Importación completada", {
        description: `nuevos: ${resumen.nuevos}, actualizados: ${resumen.actualizados}, duplicados: ${resumen.duplicadosSinCambios}`,
      });
      setRows([]);
      setFile(null);
      setPage(1);
    } else {
      const msg = (result as any)?.error?.formErrors?.join(", ") || "Error al importar";
      toast.error(msg);
    }
  }, [result]);

  async function handleFiles(fs: FileList | null) {
    const f = fs && fs[0];
    if (!f) return;
    setFile(f);
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
    }
  }

  function onDrop(ev: React.DragEvent) {
    ev.preventDefault();
    handleFiles(ev.dataTransfer.files);
  }

  function onDragOver(ev: React.DragEvent) {
    ev.preventDefault();
  }

  return (
    <div className="space-y-4">
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        className="rounded border border-dashed p-6 text-center"
      >
        <div className="mb-2">Arrastra tu archivo .xlsx aquí</div>
        <div className="text-xs text-muted-foreground">Hoja: "Hoja de Datos", headers en fila 8</div>
        <div className="mt-3">
          <button
            className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700"
            onClick={() => inputRef.current?.click()}
          >
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
        {file && (
          <div className="mt-2 text-sm">Archivo: {file.name}</div>
        )}

        <form action={action} className="pt-4">
          <input name="file" type="file" className="hidden" readOnly onChange={() => {}} />
          <button
            type="button"
            disabled={!file || pending}
            title={!file ? "Selecciona un archivo para habilitar" : undefined}
            className="rounded bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={async () => {
              if (!file) return;
              const fd = new FormData();
              fd.set("file", file);
              startTransition(() => {
                (action as any)(fd);
              });
            }}
          >
            {pending ? "Importando..." : "Confirmar e importar"}
          </button>
        </form>
      </div>

      {rows.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">Prevista: {rows.length} filas</div>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded border px-2 py-1 disabled:opacity-50">Prev</button>
              <div className="text-sm">{page}/{totalPages}</div>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="rounded border px-2 py-1 disabled:opacity-50">Next</button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted">
                  {Array.from({ length: 21 }).map((_, i) => (
                    <th key={i} className="px-2 py-1 text-left">{i}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slice.map((r, idx) => (
                  <tr key={idx} className="border-b">
                    {Array.from({ length: 21 }).map((_, i) => (
                      <td key={i} className="px-2 py-1 whitespace-nowrap max-w-[240px] overflow-hidden text-ellipsis">{String(r[i] ?? "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result?.ok && (
            <div className="rounded border p-3 text-sm">
              <div className="font-medium">Importación completada</div>
              <div>nuevos: {result.resumen.nuevos}</div>
              <div>actualizados: {result.resumen.actualizados}</div>
              <div>duplicados sin cambios: {result.resumen.duplicadosSinCambios}</div>
            </div>
          )}

          {result?.ok === false && (
            <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              {(result.error.formErrors || []).join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
