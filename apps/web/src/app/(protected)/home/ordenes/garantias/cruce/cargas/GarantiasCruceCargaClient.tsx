"use client";

import Link from "next/link";
import type { DragEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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

function formatYm(ym: string) {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym || "-";
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const [y, m] = ym.split("-");
  return `${months[Number(m) - 1]} ${y}`;
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

function attentionLabel(rows: Array<{ ym: string; total: number }>) {
  if (!rows.length) return "Sin atenciones";
  return rows.map((row) => `${formatYm(row.ym)}: ${row.total}`).join(" | ");
}

function reasonLabel(reason: string) {
  if (reason === "sin_fecha_instalacion") return "Sin fecha de instalacion";
  if (reason === "sin_fecha_atencion") return "Sin fecha de atencion";
  if (reason === "sin_codigo_y_cliente") return "Sin codigo y cliente";
  if (reason === "otro_partner") return "Otro partner";
  if (reason === "fuera_ventana_30_dias") return "Fuera de 30 dias";
  return reason;
}

export default function GarantiasCruceCargaClient() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
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
    if (dropped) setFile(dropped);
  }

  async function upload() {
    if (!file) {
      toast.error("Selecciona un archivo XLSX");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/ordenes/garantias/cruce/import", {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || "ERROR"));
      setResult(json.result);
      setPeriods(Array.isArray(json.periods) ? json.periods : []);
      toast.success("Excel guardado para cruce");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (e: any) {
      const msg = String(e?.message || "ERROR");
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase text-[#30518c]">Garantias</div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-100">Cargar Excel para cruce</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              Sube el archivo enviado por el proveedor. REDES detecta los meses desde FECHA DE INSTALACION y guarda la data por mes para que el cruce no dependa del archivo local.
            </p>
          </div>
          <Link
            href="/home/garantias/cruce"
            className="rounded-md border border-slate-300 px-4 py-2 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Ver cruce
          </Link>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[.8fr_1.2fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div
            onDrop={onDrop}
            onDragOver={(ev) => ev.preventDefault()}
            className="flex min-h-[13rem] flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center dark:border-slate-700 dark:bg-slate-950"
          >
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Archivo XLSX de garantias</div>
            <div className="mt-1 max-w-sm text-xs leading-5 text-slate-500 dark:text-slate-400">
              Debe contener la hoja Garantia con cod_pedido, nombre, Fecha atencion, PARTNER_INSTALADOR y FECHA DE INSTALACION.
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="mt-4 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Seleccionar archivo
            </button>
            {file ? (
              <div className="mt-3 rounded-md bg-white px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700">
                {file.name} | {(file.size / (1024 * 1024)).toFixed(2)} MB
              </div>
            ) : null}
          </div>

          <button
            type="button"
            disabled={loading || !file}
            onClick={upload}
            className="mt-4 w-full rounded-md bg-[#30518c] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#263f73] disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {loading ? "Guardando..." : "Subir y guardar por mes"}
          </button>

          {error ? <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div> : null}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-100">Resultado de la ultima carga</h2>
          {result ? (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
                  <div className="text-[11px] uppercase text-slate-500">Filas Excel</div>
                  <div className="mt-1 text-xl font-semibold">{result.totalRows}</div>
                </div>
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-950">
                  <div className="text-[11px] uppercase text-emerald-700">Validas</div>
                  <div className="mt-1 text-xl font-semibold">{result.validRows}</div>
                </div>
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-950">
                  <div className="text-[11px] uppercase text-amber-700">Omitidas</div>
                  <div className="mt-1 text-xl font-semibold">{result.omittedRows}</div>
                </div>
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-blue-950">
                  <div className="text-[11px] uppercase text-blue-700">Meses</div>
                  <div className="mt-1 text-xl font-semibold">{result.months.length}</div>
                </div>
              </div>

              {Object.keys(result.omittedByReason || {}).length ? (
                <div className="flex flex-wrap gap-2 text-xs">
                  {Object.entries(result.omittedByReason).map(([reason, total]) => (
                    <span key={reason} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {reasonLabel(reason)}: {total}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
                {result.months.map((month) => (
                  <Link
                    key={month.instYm}
                    href={`/home/garantias/cruce?instYm=${encodeURIComponent(month.instYm)}`}
                    className="rounded-md border border-slate-200 p-3 transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{formatYm(month.instYm)}</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{month.total} garantias | {attentionLabel(month.attentionMonths)}</div>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
              Aun no se subio ningun archivo en esta sesion.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-100">Meses guardados para cruce</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Cada mes usa la ultima carga que lo contenia.</p>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase text-slate-500 dark:border-slate-700">
                <th className="px-3 py-2 font-semibold">Mes instalacion</th>
                <th className="px-3 py-2 text-right font-semibold">Garantias</th>
                <th className="px-3 py-2 font-semibold">Atenciones</th>
                <th className="px-3 py-2 font-semibold">Archivo</th>
                <th className="px-3 py-2 font-semibold">Carga</th>
                <th className="px-3 py-2 text-right font-semibold">Accion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {periods.map((period) => (
                <tr key={period.instYm} className="hover:bg-slate-50 dark:hover:bg-slate-800/70">
                  <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{formatYm(period.instYm)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{period.totalRows}</td>
                  <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">{attentionLabel(period.attentionMonths)}</td>
                  <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">{period.fileName || "-"}</td>
                  <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">{formatDateTime(period.uploadedAtText)}</td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/home/garantias/cruce?instYm=${encodeURIComponent(period.instYm)}`} className="text-xs font-semibold text-[#30518c] hover:underline">
                      Abrir cruce
                    </Link>
                  </td>
                </tr>
              ))}
              {!periods.length ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">
                    No hay meses guardados todavia.
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
