"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { guardarProIdLoteAction, guardarProIdMasivoDesdeSnAction, validarSerieAction } from "./actions";

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

const MIN_SN_SCAN_LEN = 6;
const BULK_CHUNK_SIZE = 20;

function nowHm() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function normalizeSn(v: string) {
  const raw = String(v || "")
    .toUpperCase()
    .split(/\r?\n|\t/g)
    .map((x) => x.trim())
    .filter(Boolean)[0] || "";
  return raw.replace(/\s+/g, "").replace(/[^A-Z0-9._-]/g, "");
}

function normalizeProId(v: string) {
  return String(v || "").trim().toUpperCase();
}

export default function ValidarSeriesClient() {
  const [mode, setMode] = useState<"general" | "ont" | "ont_bulk">("general");
  const [rows, setRows] = useState<GeneralRow[]>([]);

  const [ontLotSize, setOntLotSize] = useState(20);
  const [ontSnRows, setOntSnRows] = useState<OntSnRow[]>([]);
  const [ontProIds, setOntProIds] = useState<string[]>([]);
  const [forceReplace, setForceReplace] = useState(false);
  const [sessionLabel, setSessionLabel] = useState("");
  const [saveRows, setSaveRows] = useState<OntSaveRow[]>([]);
  const [bulkRawInput, setBulkRawInput] = useState("");
  const [bulkRows, setBulkRows] = useState<OntSaveRow[]>([]);
  const [isBulkPending, setIsBulkPending] = useState(false);
  const [bulkProgressDone, setBulkProgressDone] = useState(0);
  const [bulkProgressTotal, setBulkProgressTotal] = useState(0);

  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const ontRowRefs = useRef<Record<number, HTMLTableRowElement | null>>({});
  const generalSnSetRef = useRef<Set<string>>(new Set());
  const ontSnSetRef = useRef<Set<string>>(new Set());
  const ontProIdSetRef = useRef<Set<string>>(new Set());
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
  const ontActiveRowIndex = useMemo(() => {
    if (ontPhase === "scan_sn") return ontSnRows.length;
    let validIdx = 0;
    for (let i = 0; i < ontSnRows.length; i += 1) {
      if (!ontSnRows[i]?.ok) continue;
      if (validIdx === ontProIds.length) return i;
      validIdx += 1;
    }
    return null;
  }, [ontPhase, ontSnRows, ontProIds.length]);
  const ontNextReadHint = useMemo(() => {
    if (ontActiveRowIndex === null) return "Lote completo";
    const rowNum = ontActiveRowIndex + 1;
    if (ontPhase === "scan_sn") return `SN fila ${rowNum}`;
    return `ProID fila ${rowNum}`;
  }, [ontActiveRowIndex, ontPhase]);
  const bulkSnPreview = useMemo(() => {
    const parts = bulkRawInput
      .split(/\r?\n|\t|,|;/g)
      .map((v) => normalizeSn(v))
      .filter(Boolean);
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const sn of parts) {
      if (seen.has(sn)) continue;
      seen.add(sn);
      unique.push(sn);
    }
    return unique;
  }, [bulkRawInput]);
  const bulkProgressPct = useMemo(() => {
    if (!bulkProgressTotal) return 0;
    return Math.max(0, Math.min(100, Math.round((bulkProgressDone / bulkProgressTotal) * 100)));
  }, [bulkProgressDone, bulkProgressTotal]);

  useEffect(() => {
    if (mode !== "ont") return;
    if (ontActiveRowIndex === null) return;
    const rowEl = ontRowRefs.current[ontActiveRowIndex];
    if (!rowEl) return;
    rowEl.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [mode, ontActiveRowIndex, ontRowsWithAlignedProId.length, ontLotSize]);

  const focusInput = () => {
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  };

  const addGeneralScan = (snRaw: string) => {
    const sn = normalizeSn(snRaw);
    if (!sn) return;
    if (sn.length < MIN_SN_SCAN_LEN || /^\d{1,5}$/.test(sn)) {
      toast.error(`Lectura SN invalida: ${sn}`);
      return;
    }
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
      if (sn.length < MIN_SN_SCAN_LEN || /^\d{1,5}$/.test(sn)) {
        toast.error(`Lectura SN invalida: ${sn}`);
        return;
      }
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
    if (ontProIdSetRef.current.has(proId)) {
      toast.error(`ProID duplicado en lote: ${proId}`);
      return;
    }
    let addedCount = -1;
    setOntProIds((prev) => {
      if (prev.length >= ontLotSize) return prev;
      if (prev.includes(proId)) return prev;
      const next = [...prev, proId];
      ontProIdSetRef.current = new Set(next);
      addedCount = next.length;
      return next;
    });
    if (addedCount < 0) {
      toast.error("El lote ONT ya tiene todos los ProID");
      return;
    }
    toast.success(`ProID ${addedCount}/${ontLotSize}`);
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
    ontProIdSetRef.current.clear();
    inflightOntSnRef.current.clear();
    if (inputRef.current) inputRef.current.value = "";
    focusInput();
  };

  const getValidPosByRowIndex = (rowIndex: number) => {
    let validPos = 0;
    for (let i = 0; i < ontSnRows.length; i += 1) {
      const row = ontSnRows[i];
      if (!row?.ok) continue;
      if (i === rowIndex) return validPos;
      validPos += 1;
    }
    return -1;
  };

  const corregirSnFila = (rowIndex: number) => {
    const target = ontSnRows[rowIndex];
    if (!target) return;
    const typed = window.prompt(`Corregir SN para fila ${target.idx}`, target.sn);
    if (typed == null) return;
    const nextSn = normalizeSn(typed);
    if (!nextSn) return toast.error("SN requerido");
    if (nextSn.length < MIN_SN_SCAN_LEN || /^\d{1,5}$/.test(nextSn)) {
      return toast.error(`Lectura SN invalida: ${nextSn}`);
    }
    if (ontSnRows.some((r, idx) => idx !== rowIndex && r.sn === nextSn)) {
      return toast.error(`SN duplicado en lote: ${nextSn}`);
    }
    startTransition(async () => {
      try {
        const r = await validarSerieAction({ sn: nextSn });
        setOntSnRows((prev) => {
          const cloned = [...prev];
          const current = cloned[rowIndex];
          if (!current) return prev;
          cloned[rowIndex] = {
            idx: current.idx,
            sn: nextSn,
            ok: !!r.exists && !!r.isOnt,
            status: !r.exists ? "not_found" : r.isOnt ? "ok" : "not_ont",
            equipo: r.equipo || "",
            proIdActual: r.proId || "",
            message: !r.exists ? "No existe en EQUIPOS" : r.isOnt ? "ONT valido" : `Equipo ${r.equipo} (no ONT)`,
          };
          ontSnSetRef.current = new Set(cloned.map((x) => x.sn));
          const validCount = cloned.filter((x) => x.ok).length;
          setOntProIds((prevProIds) => {
            const nextProIds = prevProIds.slice(0, validCount);
            ontProIdSetRef.current = new Set(nextProIds);
            return nextProIds;
          });
          return cloned;
        });
        toast.success(`Fila ${target.idx} corregida`);
      } catch (e: any) {
        toast.error(String(e?.message || "Error corrigiendo SN"));
      } finally {
        focusInput();
      }
    });
  };

  const corregirProIdFila = (rowIndex: number) => {
    const validPos = getValidPosByRowIndex(rowIndex);
    if (validPos < 0) return toast.error("La fila no es ONT valida");
    if (validPos >= ontProIds.length) return toast.error("Esa fila aun no tiene ProID escaneado");
    const current = ontProIds[validPos] || "";
    const typed = window.prompt(`Corregir ProID en fila ${rowIndex + 1}`, current);
    if (typed == null) return;
    const nextProId = normalizeProId(typed);
    if (!nextProId) return toast.error("ProID requerido");
    setOntProIds((prev) => {
      if (prev.some((v, idx) => idx !== validPos && v === nextProId)) {
        toast.error(`ProID duplicado en lote: ${nextProId}`);
        return prev;
      }
      const next = [...prev];
      next[validPos] = nextProId;
      ontProIdSetRef.current = new Set(next);
      return next;
    });
    focusInput();
  };

  const reiniciarProIdDesdeFila = (rowIndex: number) => {
    const validPos = getValidPosByRowIndex(rowIndex);
    if (validPos < 0) return toast.error("La fila no es ONT valida");
    setOntProIds((prev) => {
      const next = prev.slice(0, validPos);
      ontProIdSetRef.current = new Set(next);
      return next;
    });
    toast.success(`ProID reiniciado desde fila ${rowIndex + 1}`);
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

  const procesarBulkSnEqProId = async () => {
    if (!bulkSnPreview.length) {
      toast.error("Pega al menos una serie SN");
      return;
    }
    if (isBulkPending) return;
    setIsBulkPending(true);
    setBulkRows([]);
    setBulkProgressDone(0);
    setBulkProgressTotal(bulkSnPreview.length);
    let processed = 0;
    const allRows: OntSaveRow[] = [];
    try {
      for (let i = 0; i < bulkSnPreview.length; i += BULK_CHUNK_SIZE) {
        const chunk = bulkSnPreview.slice(i, i + BULK_CHUNK_SIZE);
        const res = await guardarProIdMasivoDesdeSnAction({
          sns: chunk,
          forceReplace,
          sessionLabel: sessionLabel.trim(),
        });
        const rows = (res.rows || []) as OntSaveRow[];
        allRows.push(...rows);
        setBulkRows([...allRows]);
        processed += chunk.length;
        setBulkProgressDone(processed);
      }
      const summary = allRows.reduce(
        (acc, r) => {
          acc.total += 1;
          if (r.status === "updated") acc.updated += 1;
          if (r.status === "already_same") acc.alreadySame += 1;
          if (r.status === "not_found") acc.notFound += 1;
          if (r.status === "not_ont") acc.notOnt += 1;
          if (r.status === "has_existing_proid") acc.hasExisting += 1;
          return acc;
        },
        { total: 0, updated: 0, alreadySame: 0, notFound: 0, notOnt: 0, hasExisting: 0 }
      );
      toast.success(
        `Masivo procesado. Total: ${summary.total}, actualizados: ${summary.updated}, iguales: ${summary.alreadySame}, no encontrados: ${summary.notFound}`
      );
    } catch (e: any) {
      toast.error(`Error en proceso masivo (${processed}/${bulkSnPreview.length}). ${String(e?.message || "")}`.trim());
    } finally {
      setIsBulkPending(false);
    }
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
        <button
          type="button"
          onClick={() => setMode("ont_bulk")}
          className={`rounded-lg px-3 py-2 text-sm ${mode === "ont_bulk" ? "bg-amber-600 text-white" : "border border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"}`}
        >
          Lote ONT masivo (Excel)
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
        <div className="mb-2 text-sm font-medium">
          {mode === "general"
            ? "Pistolea SN fisica para validar contra la coleccion EQUIPOS"
            : mode === "ont"
              ? "Pistolea lote ONT: primero SN (valida), luego ProID en el mismo orden"
              : "Modo masivo: pega la columna SN desde Excel. Se procesa como SN=ProID"}
        </div>
        {mode !== "ont_bulk" && (
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
        )}
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
            <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-amber-700 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-200">
              Fila actual: {ontActiveRowIndex === null ? "-" : ontActiveRowIndex + 1}
            </span>
            <span className="rounded-full border border-violet-300 bg-violet-50 px-3 py-1 text-violet-700 dark:border-violet-700/50 dark:bg-violet-900/20 dark:text-violet-200">
              Siguiente lectura: {ontNextReadHint}
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
                  <th className="p-2 text-left">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: Math.max(ontSnRows.length, ontLotSize) }).map((_, idx) => {
                  const item = ontRowsWithAlignedProId[idx];
                  const snRow = item?.row;
                  const proId = item?.proIdEscaneado || "";
                  return (
                    <tr
                      key={`ont_row_${idx}`}
                      ref={(el) => {
                        ontRowRefs.current[idx] = el;
                      }}
                      className={`border-t border-slate-200 dark:border-slate-700 ${ontActiveRowIndex === idx ? "bg-amber-50/80 dark:bg-amber-900/20" : ""}`}
                    >
                      <td className="p-2">{idx + 1}</td>
                      <td className="p-2 font-mono">{snRow?.sn || "-"}</td>
                      <td className="p-2">
                        {!snRow ? "-" : snRow.ok ? <span className="text-emerald-700 dark:text-emerald-300">OK</span> : <span className="text-rose-700 dark:text-rose-300">{snRow.status}</span>}
                      </td>
                      <td className="p-2">{snRow?.proIdActual || "-"}</td>
                      <td className="p-2 font-mono">{proId || "-"}</td>
                      <td className="p-2">{snRow?.message || "-"}</td>
                      <td className="p-2">
                        {!snRow ? (
                          "-"
                        ) : (
                          <div className="flex flex-wrap items-center gap-1">
                            <button
                              type="button"
                              onClick={() => corregirSnFila(idx)}
                              className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] dark:border-slate-700 dark:bg-slate-900"
                            >
                              Corregir SN
                            </button>
                            {snRow.ok && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => corregirProIdFila(idx)}
                                  className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] dark:border-slate-700 dark:bg-slate-900"
                                >
                                  Corregir ProID
                                </button>
                                <button
                                  type="button"
                                  onClick={() => reiniciarProIdDesdeFila(idx)}
                                  className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] dark:border-slate-700 dark:bg-slate-900"
                                >
                                  Reanudar desde fila
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
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

      {mode === "ont_bulk" && (
        <>
          <div className="relative space-y-3">
            {isBulkPending && (
              <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-slate-900/40 backdrop-blur-[1px]">
                <div className="w-full max-w-md rounded-lg bg-white p-3 text-slate-800 shadow dark:bg-slate-900 dark:text-slate-100">
                  <div className="mb-1 text-sm font-medium">Procesando lote masivo...</div>
                  <div className="mb-2 h-2 w-full overflow-hidden rounded bg-slate-200 dark:bg-slate-700">
                    <div className="h-full bg-amber-500 transition-all" style={{ width: `${bulkProgressPct}%` }} />
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    {bulkProgressDone}/{bulkProgressTotal} ({bulkProgressPct}%)
                  </div>
                </div>
              </div>
            )}
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <label className="text-xs font-medium">Sesion/Lote (opcional)</label>
              <input
                value={sessionLabel}
                onChange={(e) => setSessionLabel(e.target.value)}
                placeholder="Lote masivo marzo"
                disabled={isBulkPending}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={forceReplace} disabled={isBulkPending} onChange={(e) => setForceReplace(e.target.checked)} />
                Reemplazar ProID existente
              </label>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={procesarBulkSnEqProId}
                disabled={isBulkPending || isPending || bulkSnPreview.length === 0}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                Procesar masivo SN=ProID
              </button>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setBulkRawInput("");
                  setBulkRows([]);
                  setBulkProgressDone(0);
                  setBulkProgressTotal(0);
                }}
                disabled={isBulkPending}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
              >
                Limpiar masivo
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium">Pega columna SN desde Excel (una fila por SN)</label>
            <textarea
              value={bulkRawInput}
              onChange={(e) => setBulkRawInput(e.target.value)}
              rows={8}
              disabled={isBulkPending}
              placeholder={"SN001\nSN002\nSN003"}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <div className="text-xs text-slate-600 dark:text-slate-400">
              Filas detectadas: {bulkRawInput.trim() ? bulkRawInput.split(/\r?\n|\t|,|;/g).filter((x) => String(x).trim()).length : 0} | Unicas: {bulkSnPreview.length} | Se guardara como <span className="font-mono">SN=ProID</span>.
            </div>
          </div>

          {bulkRows.length > 0 && (
            <div className="max-h-[320px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
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
                  {bulkRows.map((r, idx) => (
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
          </div>
        </>
      )}
    </div>
  );
}
