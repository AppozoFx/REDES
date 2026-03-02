"use client";

import { useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import { toast } from "sonner";

type MatchItem = {
  id: string;
  codigoCliente: string;
  cliente: string;
  cuadrillaNombre: string;
  acta: string;
  fechaOrdenYmd: string;
  fechaInstalacionYmd: string;
};

type ValidationResult = {
  acta: string;
  found: boolean;
  hasCliente: boolean;
  matches: MatchItem[];
};

type ValidationResponse = {
  ok: boolean;
  ymd: string;
  allMatched: boolean;
  summary: {
    totalEscaneadas: number;
    conCliente: number;
    sinCliente: number;
    sinRegistro: number;
  };
  results: ValidationResult[];
  error?: string;
};

type ScannedRow = {
  acta: string;
  status: "pending" | "ok" | "sin_cliente" | "no_encontrada" | "error";
  matches: MatchItem[];
};

function normalizeActa(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

function estadoBadge(row: ScannedRow) {
  if (row.status === "ok") return "OK";
  if (row.status === "sin_cliente") return "SIN CLIENTE";
  if (row.status === "no_encontrada") return "NO ENCONTRADA";
  if (row.status === "pending") return "VALIDANDO...";
  return "ERROR";
}

function statusPriority(status: ScannedRow["status"]) {
  if (status === "pending") return 0;
  if (status === "error") return 1;
  if (status === "no_encontrada") return 2;
  if (status === "sin_cliente") return 3;
  return 4;
}

export default function ActasPorDiaClient() {
  const [ymd, setYmd] = useState(dayjs().format("YYYY-MM-DD"));
  const [actaCode, setActaCode] = useState("");
  const [actas, setActas] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, ScannedRow>>({});
  const [cargandoMasivo, setCargandoMasivo] = useState(false);
  const [ultimaAlerta, setUltimaAlerta] = useState<{ kind: "warn" | "error"; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const validationRunRef = useRef(0);

  const bumpValidationRun = () => {
    validationRunRef.current += 1;
  };

  const playTone = (kind: "ok" | "warn" | "error") => {
    try {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
      if (!Ctx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") {
        void ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = kind === "ok" ? 740 : kind === "warn" ? 520 : 330;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      gain.gain.exponentialRampToValueAtTime(0.045, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.23);
    } catch {
      // noop: sonido opcional
    }
  };

  const playDoubleErrorTone = () => {
    playTone("error");
    window.setTimeout(() => playTone("error"), 180);
  };

  const validarActa = async (acta: string, playSound = true): Promise<ScannedRow["status"]> => {
    const runId = validationRunRef.current;
    const ymdSnapshot = ymd;
    setRows((prev) => ({
      ...prev,
      [acta]: {
        acta,
        status: "pending",
        matches: prev[acta]?.matches || [],
      },
    }));
    try {
      const res = await fetch("/api/instalaciones/actas/validar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ymd: ymdSnapshot, actas: [acta] }),
      });
      const data = (await res.json()) as ValidationResponse;
      if (!res.ok || !data?.ok) throw new Error(data?.error || "ERROR");
      const r: ValidationResult | undefined = data.results?.[0];
      if (!r) throw new Error("SIN_RESULTADO");
      if (runId !== validationRunRef.current) return "pending";
      const status: ScannedRow["status"] = r.hasCliente ? "ok" : r.found ? "sin_cliente" : "no_encontrada";
      setRows((prev) => ({
        ...prev,
        [acta]: {
          acta,
          status,
          matches: Array.isArray(r.matches) ? r.matches : [],
        },
      }));
      if (playSound) {
        if (status === "ok") {
          playTone("ok");
        } else if (status === "sin_cliente") {
          playTone("warn");
          setUltimaAlerta({ kind: "warn", text: `Acta ${acta}: sin cliente asociado` });
          toast.warning(`Acta ${acta}: sin cliente asociado`);
        } else {
          playDoubleErrorTone();
          setUltimaAlerta({ kind: "error", text: `Acta ${acta}: NO ENCONTRADA` });
          toast.error(`Acta ${acta}: NO ENCONTRADA`);
        }
      }
      return status;
    } catch {
      if (runId !== validationRunRef.current) return "pending";
      setRows((prev) => ({
        ...prev,
        [acta]: {
          acta,
          status: "error",
          matches: prev[acta]?.matches || [],
        },
      }));
      if (playSound) {
        playDoubleErrorTone();
        setUltimaAlerta({ kind: "error", text: `Acta ${acta}: error al validar` });
        toast.error(`Acta ${acta}: error al validar`);
      }
      return "error";
    }
  };

  const agregarActa = (code: string, silent = false) => {
    const clean = normalizeActa(code);
    if (!clean) return false;
    if (actas.includes(clean)) {
      if (!silent) toast.error(`El acta ${clean} ya fue agregada`);
      setActaCode("");
      return false;
    }
    setActas((prev) => [...prev, clean]);
    setActaCode("");
    void validarActa(clean, !silent);
    return true;
  };

  const handleAgregar = () => {
    if (!actaCode.trim()) return;
    if (agregarActa(actaCode.trim())) {
      toast.success("Acta agregada");
    }
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAgregar();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (!text || !text.includes("\n")) return;
    e.preventDefault();
    const rows = text
      .split(/\r?\n/)
      .map((r) => r.trim())
      .filter(Boolean);
    let added = 0;
    rows.forEach((row) => {
      if (agregarActa(row, true)) added += 1;
    });
    setActaCode("");
    toast.success(`${added} acta(s) agregadas`);
  };

  const revalidarTodas = async () => {
    if (!actas.length) return toast.error("Escanea al menos una acta");
    try {
      setCargandoMasivo(true);
      const statuses = await Promise.all(actas.map((a) => validarActa(a, false)));
      const hasError = statuses.some((s) => s === "error" || s === "no_encontrada");
      const hasWarn = statuses.some((s) => s === "sin_cliente");
      if (hasError) playTone("error");
      else if (hasWarn) playTone("warn");
      else playTone("ok");
      toast.success("Revalidacion completada");
    } catch (e: any) {
      toast.error(e?.message || "Error revalidando actas");
    } finally {
      setCargandoMasivo(false);
    }
  };

  const rowsList = useMemo(
    () =>
      actas.map((acta) => rows[acta] || { acta, status: "pending" as const, matches: [] }),
    [actas, rows]
  );
  const rowsSorted = useMemo(() => {
    return [...rowsList].sort((a, b) => {
      const pa = statusPriority(a.status);
      const pb = statusPriority(b.status);
      if (pa !== pb) return pa - pb;
      return a.acta.localeCompare(b.acta, "es", { sensitivity: "base" });
    });
  }, [rowsList]);
  const summary = useMemo(() => {
    const base = { totalEscaneadas: rowsList.length, conCliente: 0, sinCliente: 0, sinRegistro: 0, pendientes: 0, error: 0 };
    rowsList.forEach((r) => {
      if (r.status === "ok") base.conCliente += 1;
      else if (r.status === "sin_cliente") base.sinCliente += 1;
      else if (r.status === "no_encontrada") base.sinRegistro += 1;
      else if (r.status === "pending") base.pendientes += 1;
      else if (r.status === "error") base.error += 1;
    });
    return base;
  }, [rowsList]);
  const allMatched = summary.totalEscaneadas > 0 && summary.conCliente === summary.totalEscaneadas;

  return (
    <div className="space-y-4 text-slate-900 dark:text-slate-100">
      <div className="grid gap-3 md:grid-cols-[200px_1fr_auto]">
        <div>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Fecha</label>
          <input
            type="date"
            value={ymd}
            onChange={(e) => {
              bumpValidationRun();
              setYmd(e.target.value);
              setRows({});
              setActas([]);
              setUltimaAlerta(null);
            }}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Escanear acta</label>
          <input
            ref={inputRef}
            value={actaCode}
            onChange={(e) => setActaCode(normalizeActa(e.target.value))}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Escanea y Enter (o pega varias lineas)"
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={handleAgregar}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Agregar
          </button>
          <button
            type="button"
            onClick={revalidarTodas}
            disabled={cargandoMasivo || !actas.length}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cargandoMasivo ? "Revalidando..." : "Revalidar todo"}
          </button>
        </div>
      </div>

      {ultimaAlerta && (
        <div
          className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
            ultimaAlerta.kind === "error"
              ? "animate-pulse border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800/60 dark:bg-rose-900/30 dark:text-rose-200"
              : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800/60 dark:bg-amber-900/30 dark:text-amber-200"
          }`}
        >
          {ultimaAlerta.text}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">Actas escaneadas</h3>
          <button
            type="button"
            onClick={() => {
              bumpValidationRun();
              setActas([]);
              setRows({});
              setUltimaAlerta(null);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-950 dark:hover:bg-slate-800"
          >
            Limpiar
          </button>
        </div>
        {actas.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No hay actas agregadas.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {actas.map((acta) => (
              <span
                key={acta}
                className="inline-flex items-center gap-2 rounded-full bg-slate-800 px-3 py-1 text-xs text-white dark:bg-slate-700"
              >
                {acta}
                <button
                  type="button"
                  onClick={() => setActas((prev) => prev.filter((x) => x !== acta))}
                  className="text-white/80 hover:text-white"
                >
                  x
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {rowsList.length > 0 && (
        <div className="space-y-3">
          <div
            className={`rounded-xl border p-3 ${
              allMatched
                ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-200"
                : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800/60 dark:bg-amber-900/30 dark:text-amber-200"
            }`}
          >
            <div className="font-semibold">
              {allMatched
                ? "Todas las actas escaneadas tienen cliente asociado."
                : "Hay actas sin cliente, sin registro o aun validandose."}
            </div>
            <div className="mt-1 text-sm">
              Total: {summary.totalEscaneadas} | Con cliente: {summary.conCliente} | Sin cliente: {summary.sinCliente} | Sin registro: {summary.sinRegistro} | Pendientes: {summary.pendientes} | Error: {summary.error}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 dark:bg-slate-800/80">
                <tr>
                  <th className="p-2 text-left">Acta</th>
                  <th className="p-2 text-left">Estado</th>
                  <th className="p-2 text-left">Cliente(s)</th>
                  <th className="p-2 text-left">Codigo(s)</th>
                  <th className="p-2 text-left">Cuadrilla(s)</th>
                </tr>
              </thead>
              <tbody>
                {rowsSorted.map((row) => {
                  const clientes = row.matches.map((m) => m.cliente).filter(Boolean);
                  const codigos = row.matches.map((m) => m.codigoCliente).filter(Boolean);
                  const cuadrillas = row.matches.map((m) => m.cuadrillaNombre).filter(Boolean);
                  return (
                    <tr
                      key={row.acta}
                      className={`border-t border-slate-200 dark:border-slate-700 ${
                        row.status === "pending"
                          ? "bg-sky-50/70 dark:bg-sky-950/20"
                          : row.status === "no_encontrada" || row.status === "error"
                            ? "bg-rose-50/80 ring-2 ring-rose-300 dark:bg-rose-950/25 dark:ring-rose-700/60"
                            : row.status === "sin_cliente"
                              ? "bg-amber-50/70 dark:bg-amber-950/20"
                              : ""
                      }`}
                    >
                      <td className="p-2 font-medium">{row.acta}</td>
                      <td className="p-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            row.status === "ok"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                              : row.status === "sin_cliente"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                              : row.status === "pending"
                                  ? "animate-pulse bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
                                  : "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200"
                          }`}
                        >
                          {estadoBadge(row)}
                        </span>
                      </td>
                      <td className="p-2">{clientes.length ? clientes.join(" | ") : "-"}</td>
                      <td className="p-2">{codigos.length ? codigos.join(" | ") : "-"}</td>
                      <td className="p-2">{cuadrillas.length ? cuadrillas.join(" | ") : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
