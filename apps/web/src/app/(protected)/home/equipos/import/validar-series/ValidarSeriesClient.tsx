"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { guardarProIdLoteAction, validarSerieAction } from "./actions";

type GeneralRow = {
  idx: number;
  sn: string;
  ok: boolean;
  status: "ok" | "not_found";
  equipo: string;
  descripcion: string;
  ubicacion: string;
  estado: string;
  proId: string;
  message: string;
  scannedAt: string;
};

type OntSnRow = {
  idx: number;
  sn: string;
  ok: boolean;
  status: "ok" | "not_found" | "not_ont";
  equipo: string;
  proIdActual: string;
  message: string;
};

type OntSaveRow = {
  sn: string;
  proId: string;
  ok: boolean;
  status: string;
  previousProId: string;
  message: string;
};

function nowHm() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function normalizeSn(v: string) {
  return String(v || "").trim().toUpperCase();
}

function normalizeProId(v: string) {
  return String(v || "").trim().toUpperCase();
}

export default function ValidarSeriesClient() {
  const [mode, setMode] = useState<"general" | "ont">("general");
  const [rows, setRows] = useState<GeneralRow[]>([]);

  const [ontLotSize, setOntLotSize] = useState(20);
  const [ontSnRows, setOntSnRows] = useState<OntSnRow[]>([]);
  const [ontProIds, setOntProIds] = useState<string[]>([]);
  const [forceReplace, setForceReplace] = useState(false);
  const [sessionLabel, setSessionLabel] = useState("");
  const [saveRows, setSaveRows] = useState<OntSaveRow[]>([]);

  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const generalSnSetRef = useRef<Set<string>>(new Set());
  const ontSnSetRef = useRef<Set<string>>(new Set());
  const inflightGeneralSnRef = useRef<Set<string>>(new Set());
  const inflightOntSnRef = useRef<Set<string>>(new Set());

  const generalSummary = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.total += 1;
        if (r.ok) acc.ok += 1;
        else acc.notFound += 1;
        return acc;
      },
      { total: 0, ok: 0, notFound: 0 }
    );
  }, [rows]);

  const ontValidSn = useMemo(() => ontSnRows.filter((x) => x.ok), [ontSnRows]);
  const ontPhase = ontValidSn.length < ontLotSize ? "scan_sn" : "scan_proid";
  const canSaveOnt = ontValidSn.length === ontLotSize && ontProIds.length === ontLotSize && !isPending;
  const hasOntSessionStarted = ontSnRows.length > 0 || ontProIds.length > 0 || saveRows.length > 0;
  const ontRowsWithAlignedProId = useMemo(() => {
    let validIdx = 0;
    return ontSnRows.map((row) => {
      if (!row.ok) return { row, proIdEscaneado: "" };
      const proIdEscaneado = ontProIds[validIdx] || "";
      validIdx += 1;
      return { row, proIdEscaneado };
    });
  }, [ontSnRows, ontProIds]);

  const focusInput = () => {
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  };

  const addGeneralScan = (snRaw: string) => {
    const sn = normalizeSn(snRaw);
    if (!sn) return;
    if (generalSnSetRef.current.has(sn) || inflightGeneralSnRef.current.has(sn)) {
      toast.error(`SN duplicado en sesion: ${sn}`);
      return;
    }
    inflightGeneralSnRef.current.add(sn);

    startTransition(async () => {
      try {
        const r = await validarSerieAction({ sn });
        let added = false;
        let wasOk = false;
        setRows((prev) => {
          if (prev.some((x) => x.sn === sn)) return prev;
          const next: GeneralRow = {
            idx: prev.length + 1,
            sn,
            ok: !!r.exists,
            status: r.exists ? "ok" : "not_found",
            equipo: r.equipo || "",
            descripcion: r.descripcion || "",
            ubicacion: r.ubicacion || "",
            estado: r.estado || "",
            proId: r.proId || "",
            message: r.exists ? "Coincide con sistema" : "No existe en EQUIPOS",
            scannedAt: nowHm(),
          };
          generalSnSetRef.current.add(sn);
          added = true;
          wasOk = next.ok;
          return [...prev, next];
        });
        if (added) {
          if (wasOk) toast.success(`OK: ${sn}`);
          else toast.error(`NO COINCIDE: ${sn}`);
        }
      } catch (e: any) {
        toast.error(String(e?.message || "Error validando serie"));
      } finally {
        inflightGeneralSnRef.current.delete(sn);
        focusInput();
      }
    });
  };

  const addOntScan = (raw: string) => {
    if (ontPhase === "scan_sn") {
      const sn = normalizeSn(raw);
      if (!sn) return;
      if (ontSnSetRef.current.has(sn) || inflightOntSnRef.current.has(sn)) {
        toast.error(`SN ONT duplicado en lote: ${sn}`);
        return;
      }
      inflightOntSnRef.current.add(sn);
      startTransition(async () => {
        try {
          const r = await validarSerieAction({ sn });
          let addedRow = false;
          let addedRowOk = false;
          let addedRowIdx = 0;
          setOntSnRows((prev) => {
            if (prev.some((x) => x.sn === sn)) return prev;
            const ok = !!r.exists && !!r.isOnt;
            const status: OntSnRow["status"] = !r.exists ? "not_found" : r.isOnt ? "ok" : "not_ont";
            const row: OntSnRow = {
              idx: prev.length + 1,
              sn,
              ok,
              status,
              equipo: r.equipo || "",
              proIdActual: r.proId || "",
              message: !r.exists ? "No existe en EQUIPOS" : r.isOnt ? "ONT valido" : `Equipo ${r.equipo} (no ONT)`,
            };
            ontSnSetRef.current.add(sn);
            addedRow = true;
            addedRowOk = row.ok;
            addedRowIdx = row.idx;
            return [...prev, row];
          });
          if (addedRow) {
            if (addedRowOk) toast.success(`ONT valida ${addedRowIdx}/${ontLotSize}: ${sn}`);
            else toast.error(`SN invalido para lote ONT: ${sn}`);
          }
        } catch (e: any) {
          toast.error(String(e?.message || "Error validando ONT"));
        } finally {
          inflightOntSnRef.current.delete(sn);
          focusInput();
        }
      });
      return;
    }

    const proId = normalizeProId(raw);
    if (!proId) return;
    if (ontProIds.length >= ontLotSize) {
      toast.error("El lote ONT ya tiene todos los ProID");
      return;
    }
    setOntProIds((prev) => [...prev, proId]);
    toast.success(`ProID ${ontProIds.length + 1}/${ontLotSize}`);
    focusInput();
  };

  const handleScan = (rawValue?: string) => {
    const raw = String(rawValue ?? inputRef.current?.value ?? "");
    if (!raw.trim()) return;
    if (inputRef.current) inputRef.current.value = "";
    if (mode === "general") addGeneralScan(raw);
    else addOntScan(raw);
  };

  const clearGeneral = () => {
    setRows([]);
    generalSnSetRef.current.clear();
    inflightGeneralSnRef.current.clear();
    if (inputRef.current) inputRef.current.value = "";
    focusInput();
  };

  const clearOnt = () => {
    setOntSnRows([]);
    setOntProIds([]);
    setSaveRows([]);
    ontSnSetRef.current.clear();
    inflightOntSnRef.current.clear();
    if (inputRef.current) inputRef.current.value = "";
    focusInput();
  };

  const saveOntPairs = () => {
    if (!canSaveOnt) return;
    const pairs = ontValidSn.map((row, idx) => ({ sn: row.sn, proId: ontProIds[idx] || "" }));
    startTransition(async () => {
      try {
        const res = await guardarProIdLoteAction({
          pairs,
          forceReplace,
          sessionLabel: sessionLabel.trim(),
        });
        setSaveRows((res.rows || []) as OntSaveRow[]);
        toast.success(
          `Lote procesado. Actualizados: ${res.summary.updated}, ya iguales: ${res.summary.alreadySame}, no encontrados: ${res.summary.notFound}`
        );
      } catch (e: any) {
        toast.error(String(e?.message || "Error guardando ProID por lote"));
      } finally {
        focusInput();
      }
    });
  };

  const exportGeneral = () => {
    if (!rows.length) return toast.error("No hay registros para exportar");
    const ws = XLSX.utils.json_to_sheet(
      rows.map((r) => ({
        idx: r.idx,
        SN: r.sn,
        resultado: r.status,
        equipo: r.equipo,
        descripcion: r.descripcion,
        ubicacion: r.ubicacion,
        estado: r.estado,
        proId: r.proId,
        mensaje: r.message,
        hora: r.scannedAt,
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ValidacionSeries");
    XLSX.writeFile(wb, `validacion_series_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportOnt = () => {
    if (!ontSnRows.length) return toast.error("No hay datos ONT para exportar");
    const ws = XLSX.utils.json_to_sheet(
      ontRowsWithAlignedProId.map(({ row: r, proIdEscaneado }) => ({
        idx: r.idx,
        SN: r.sn,
        validacion_sn: r.status,
        equipo: r.equipo,
        proId_actual: r.proIdActual,
        proId_escaneado: proIdEscaneado,
        mensaje: r.message,
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "LoteONT");
    XLSX.writeFile(wb, `lote_ont_proid_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-4 text-slate-900 dark:text-slate-100">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setMode("general")}
          className={`rounded-lg px-3 py-2 text-sm ${mode === "general" ? "bg-blue-600 text-white" : "border border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"}`}
        >
          Validacion General SN
        </button>
        <button
          type="button"
          onClick={() => setMode("ont")}
          className={`rounded-lg px-3 py-2 text-sm ${mode === "ont" ? "bg-emerald-600 text-white" : "border border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"}`}
        >
          Lote ONT + ProID
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
        <div className="mb-2 text-sm font-medium">
          {mode === "general"
            ? "Pistolea SN fisica para validar contra la coleccion EQUIPOS"
            : "Pistolea lote ONT: primero SN (valida), luego ProID en el mismo orden"}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleScan((e.currentTarget as HTMLInputElement).value);
              }
            }}
            placeholder={mode === "general" ? "Pistolea SN y Enter" : ontPhase === "scan_sn" ? "Fase SN ONT: pistolea serie y Enter" : "Fase ProID: pistolea ProID y Enter"}
            className="w-full max-w-[560px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          <button
            type="button"
            onClick={() => handleScan()}
            disabled={isPending}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Registrar
          </button>
        </div>
      </div>

      {mode === "general" && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full border border-slate-300 bg-white px-3 py-1 dark:border-slate-700 dark:bg-slate-900">Total: {generalSummary.total}</span>
            <span className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-900/20 dark:text-emerald-200">OK: {generalSummary.ok}</span>
            <span className="rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-rose-700 dark:border-rose-700/50 dark:bg-rose-900/20 dark:text-rose-200">No coincide: {generalSummary.notFound}</span>
            <button type="button" onClick={exportGeneral} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900">
              Exportar
            </button>
            <button type="button" onClick={clearGeneral} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900">
              Limpiar sesion
            </button>
          </div>

          <div className="max-h-[520px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800/70">
                <tr>
                  <th className="p-2 text-left">#</th>
                  <th className="p-2 text-left">SN</th>
                  <th className="p-2 text-left">Resultado</th>
                  <th className="p-2 text-left">Equipo</th>
                  <th className="p-2 text-left">Ubicacion</th>
                  <th className="p-2 text-left">ProID</th>
                  <th className="p-2 text-left">Hora</th>
                  <th className="p-2 text-left">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.sn}_${r.idx}`} className="border-t border-slate-200 dark:border-slate-700">
                    <td className="p-2">{r.idx}</td>
                    <td className="p-2 font-mono">{r.sn}</td>
                    <td className="p-2">
                      <span className={r.ok ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}>
                        {r.ok ? "OK" : "NO COINCIDE"}
                      </span>
                    </td>
                    <td className="p-2">{r.equipo || "-"}</td>
                    <td className="p-2">{r.ubicacion || "-"}</td>
                    <td className="p-2">{r.proId || "-"}</td>
                    <td className="p-2">{r.scannedAt}</td>
                    <td className="p-2">{r.message}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-4 text-center text-slate-500 dark:text-slate-400">
                      Sin lecturas aun
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {mode === "ont" && (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <label className="text-xs font-medium">Tamanio lote ONT</label>
              <input
                type="number"
                min={1}
                max={20}
                value={ontLotSize}
                disabled={hasOntSessionStarted || isPending}
                onChange={(e) => {
                  if (hasOntSessionStarted) {
                    toast.error("Reinicia el lote para cambiar el tamanio");
                    return;
                  }
                  setOntLotSize(Math.max(1, Math.min(20, Number(e.target.value || 20))));
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  disabled={hasOntSessionStarted || isPending}
                  onClick={() => setOntLotSize(20)}
                  className={`rounded-md border px-2 py-1 text-xs ${ontLotSize === 20 ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"} disabled:opacity-50`}
                >
                  Caja estandar (20)
                </button>
                <span className="text-xs text-slate-500 dark:text-slate-400">Para caja pequena u otros casos, ingresa manualmente un valor de 1 a 19.</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Sesion/Lote (opcional)</label>
              <input
                value={sessionLabel}
                onChange={(e) => setSessionLabel(e.target.value)}
                placeholder="Caja 1"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={forceReplace} onChange={(e) => setForceReplace(e.target.checked)} />
                Reemplazar ProID existente
              </label>
            </div>
            <div className="flex items-end gap-2">
              <button type="button" onClick={exportOnt} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900">
                Exportar lote
              </button>
              <button type="button" onClick={clearOnt} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900">
                Reiniciar lote
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full border border-slate-300 bg-white px-3 py-1 dark:border-slate-700 dark:bg-slate-900">
              Fase: {ontPhase === "scan_sn" ? `SN ONT (${ontValidSn.length}/${ontLotSize})` : `ProID (${ontProIds.length}/${ontLotSize})`}
            </span>
            <span className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-900/20 dark:text-emerald-200">
              SN validas: {ontValidSn.length}
            </span>
            <span className="rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-blue-700 dark:border-blue-700/50 dark:bg-blue-900/20 dark:text-blue-200">
              ProID leidos: {ontProIds.length}
            </span>
            <button
              type="button"
              onClick={saveOntPairs}
              disabled={!canSaveOnt}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              Guardar pares SN-ProID
            </button>
          </div>

          <div className="max-h-[460px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800/70">
                <tr>
                  <th className="p-2 text-left">#</th>
                  <th className="p-2 text-left">SN ONT</th>
                  <th className="p-2 text-left">Validacion</th>
                  <th className="p-2 text-left">ProID actual</th>
                  <th className="p-2 text-left">ProID escaneado</th>
                  <th className="p-2 text-left">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: Math.max(ontSnRows.length, ontLotSize) }).map((_, idx) => {
                  const item = ontRowsWithAlignedProId[idx];
                  const snRow = item?.row;
                  const proId = item?.proIdEscaneado || "";
                  return (
                    <tr key={`ont_row_${idx}`} className="border-t border-slate-200 dark:border-slate-700">
                      <td className="p-2">{idx + 1}</td>
                      <td className="p-2 font-mono">{snRow?.sn || "-"}</td>
                      <td className="p-2">
                        {!snRow ? "-" : snRow.ok ? <span className="text-emerald-700 dark:text-emerald-300">OK</span> : <span className="text-rose-700 dark:text-rose-300">{snRow.status}</span>}
                      </td>
                      <td className="p-2">{snRow?.proIdActual || "-"}</td>
                      <td className="p-2 font-mono">{proId || "-"}</td>
                      <td className="p-2">{snRow?.message || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {saveRows.length > 0 && (
            <div className="max-h-[280px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800/70">
                  <tr>
                    <th className="p-2 text-left">SN</th>
                    <th className="p-2 text-left">ProID</th>
                    <th className="p-2 text-left">Estado</th>
                    <th className="p-2 text-left">ProID previo</th>
                    <th className="p-2 text-left">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {saveRows.map((r, idx) => (
                    <tr key={`${r.sn}_${idx}`} className="border-t border-slate-200 dark:border-slate-700">
                      <td className="p-2 font-mono">{r.sn}</td>
                      <td className="p-2 font-mono">{r.proId}</td>
                      <td className="p-2">{r.status}</td>
                      <td className="p-2">{r.previousProId || "-"}</td>
                      <td className="p-2">{r.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
