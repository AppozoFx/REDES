"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

type DayItem = {
  acta: string;
  codigoCliente: string;
  cliente: string;
  cuadrillaNombre: string;
  matches: MatchItem[];
};

type ValidationResponse = {
  ok: boolean;
  ymd: string;
  day: {
    totalInstalaciones: number;
    totalActasEsperadas: number;
    items: DayItem[];
  };
  error?: string;
};

type ScannedOkRow = {
  acta: string;
  status: "ok" | "sin_cliente";
  matches: MatchItem[];
};

type RejectedRow = {
  acta: string;
  status: "no_del_dia" | "error";
  reason: string;
};

function normalizeActa(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

function statusBadge(status: ScannedOkRow["status"]) {
  return status === "ok" ? "OK" : "SIN CLIENTE";
}

export default function ActasPorDiaClient() {
  const [ymd, setYmd] = useState(dayjs().format("YYYY-MM-DD"));
  const [actaCode, setActaCode] = useState("");
  const [loadingDay, setLoadingDay] = useState(false);
  const [dayError, setDayError] = useState<string | null>(null);
  const [totalInstalaciones, setTotalInstalaciones] = useState(0);
  const [expectedItems, setExpectedItems] = useState<DayItem[]>([]);
  const [scannedActas, setScannedActas] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, ScannedOkRow>>({});
  const [rejectedRows, setRejectedRows] = useState<RejectedRow[]>([]);
  const [ultimaAlerta, setUltimaAlerta] = useState<{ kind: "warn" | "error"; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const expectedMapRef = useRef<Map<string, DayItem>>(new Map());
  const scannedSetRef = useRef<Set<string>>(new Set());

  const playTone = (kind: "ok" | "warn" | "error") => {
    try {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
      if (!Ctx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") void ctx.resume();
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
      // noop
    }
  };

  const playDoubleErrorTone = () => {
    playTone("error");
    window.setTimeout(() => playTone("error"), 180);
  };

  const clearScanState = () => {
    scannedSetRef.current = new Set();
    setScannedActas([]);
    setRows({});
    setRejectedRows([]);
    setUltimaAlerta(null);
  };

  const loadDay = async (nextYmd: string) => {
    setLoadingDay(true);
    setDayError(null);
    clearScanState();
    try {
      const res = await fetch("/api/instalaciones/actas/validar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ymd: nextYmd, actas: [] }),
      });
      const data = (await res.json()) as ValidationResponse;
      if (!res.ok || !data?.ok) throw new Error(data?.error || "ERROR");
      const items = Array.isArray(data.day?.items) ? data.day.items : [];
      const nextMap = new Map<string, DayItem>();
      items.forEach((item) => {
        const key = normalizeActa(item.acta);
        if (!key) return;
        nextMap.set(key, {
          ...item,
          acta: key,
          matches: Array.isArray(item.matches) ? item.matches : [],
        });
      });
      expectedMapRef.current = nextMap;
      setExpectedItems(items.map((item) => ({ ...item, acta: normalizeActa(item.acta) || item.acta })));
      setTotalInstalaciones(Number(data.day?.totalInstalaciones || 0));
    } catch (e: any) {
      expectedMapRef.current = new Map();
      setExpectedItems([]);
      setTotalInstalaciones(0);
      const message = e?.message || "No se pudo cargar el bloque del dia";
      setDayError(message);
      setUltimaAlerta({ kind: "error", text: `No se pudo cargar el bloque del dia: ${message}` });
      toast.error(`No se pudo cargar el bloque del dia: ${message}`);
    } finally {
      setLoadingDay(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  useEffect(() => {
    void loadDay(ymd);
  }, [ymd]);

  const registrarRechazo = (row: RejectedRow) => {
    setRejectedRows((prev) => {
      const next = [row, ...prev.filter((item) => !(item.acta === row.acta && item.reason === row.reason))];
      return next.slice(0, 50);
    });
  };

  const procesarActa = (code: string, silent = false) => {
    const clean = normalizeActa(code);
    if (!clean) return false;

    if (loadingDay) {
      if (!silent) {
        playDoubleErrorTone();
        setUltimaAlerta({ kind: "error", text: "Espera a que cargue el bloque del dia" });
        toast.error("Espera a que cargue el bloque del dia");
      }
      return false;
    }

    if (scannedSetRef.current.has(clean)) {
      if (!silent) {
        playDoubleErrorTone();
        setUltimaAlerta({ kind: "error", text: `Acta ${clean}: ya fue escaneada` });
        toast.error(`Acta ${clean}: ya fue escaneada`);
      }
      setActaCode("");
      return false;
    }

    const item = expectedMapRef.current.get(clean);
    if (!item) {
      registrarRechazo({ acta: clean, status: "no_del_dia", reason: "No pertenece al bloque del dia" });
      if (!silent) {
        playDoubleErrorTone();
        setUltimaAlerta({ kind: "error", text: `Acta ${clean}: no pertenece al dia seleccionado` });
        toast.error(`Acta ${clean}: no pertenece al dia seleccionado`);
      }
      setActaCode("");
      return false;
    }

    scannedSetRef.current.add(clean);
    setScannedActas((prev) => [...prev, clean]);
    const matches = Array.isArray(item.matches) ? item.matches : [];
    const hasCliente = matches.some((match) => String(match.cliente || "").trim().length > 0);
    const status: ScannedOkRow["status"] = hasCliente ? "ok" : "sin_cliente";
    setRows((prev) => ({
      ...prev,
      [clean]: {
        acta: clean,
        status,
        matches,
      },
    }));
    setActaCode("");

    if (!silent) {
      if (status === "ok") {
        playTone("ok");
      } else {
        playTone("warn");
        setUltimaAlerta({ kind: "warn", text: `Acta ${clean}: sin cliente asociado` });
        toast.warning(`Acta ${clean}: sin cliente asociado`);
      }
    }

    return true;
  };

  const handleAgregar = () => {
    if (!actaCode.trim()) return;
    procesarActa(actaCode.trim());
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
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    let added = 0;
    lines.forEach((line) => {
      if (procesarActa(line, true)) added += 1;
    });
    setActaCode("");
    if (added > 0) toast.success(`${added} acta(s) validadas`);
  };

  const rowsList = useMemo(
    () => scannedActas.map((acta) => rows[acta]).filter(Boolean),
    [rows, scannedActas]
  );

  const summary = useMemo(() => {
    const ok = rowsList.filter((row) => row.status === "ok").length;
    const sinCliente = rowsList.filter((row) => row.status === "sin_cliente").length;
    const validadas = rowsList.length;
    const totalEsperadas = expectedItems.length;
    const faltantes = Math.max(totalEsperadas - validadas, 0);
    return {
      ok,
      sinCliente,
      validadas,
      totalEsperadas,
      faltantes,
      rechazadas: rejectedRows.length,
    };
  }, [expectedItems.length, rejectedRows.length, rowsList]);

  const missingItems = useMemo(() => {
    return expectedItems.filter((item) => !scannedSetRef.current.has(item.acta));
  }, [expectedItems, rowsList.length]);

  const allMatched = summary.totalEsperadas > 0 && summary.validadas === summary.totalEsperadas;

  return (
    <div className="space-y-4 text-slate-900 dark:text-slate-100">
      <div className="grid gap-3 md:grid-cols-[200px_1fr_auto]">
        <div>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Fecha</label>
          <input
            type="date"
            value={ymd}
            onChange={(e) => setYmd(e.target.value)}
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
            placeholder={loadingDay ? "Cargando bloque del dia..." : "Escanea y Enter"}
            disabled={loadingDay}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={handleAgregar}
            disabled={loadingDay}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Agregar
          </button>
          <button
            type="button"
            onClick={() => void loadDay(ymd)}
            disabled={loadingDay}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loadingDay ? "Cargando..." : "Recargar dia"}
          </button>
        </div>
      </div>

      <div
        className={`rounded-xl border p-3 ${
          allMatched
            ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-200"
            : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800/60 dark:bg-amber-900/30 dark:text-amber-200"
        }`}
      >
        <div className="font-semibold">
          {allMatched
            ? "Todas las actas esperadas del dia ya fueron validadas."
            : "Escanea las actas del bloque del dia hasta completar el total esperado."}
        </div>
        <div className="mt-1 text-sm">
          Instalaciones del dia: {totalInstalaciones} | Actas esperadas: {summary.totalEsperadas} | Validadas: {summary.validadas} | OK: {summary.ok} | Sin cliente: {summary.sinCliente} | Faltan: {summary.faltantes} | Rechazadas: {summary.rechazadas}
        </div>
      </div>

      {(dayError || ultimaAlerta || rejectedRows.length > 0) && (
        <div className="space-y-3">
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

          {rejectedRows.length > 0 && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 dark:border-rose-800/60 dark:bg-rose-900/25">
              <div className="mb-2 font-semibold text-rose-900 dark:text-rose-200">Actas con error</div>
              <div className="space-y-2">
                {rejectedRows.map((row) => (
                  <div
                    key={`${row.acta}_${row.reason}`}
                    className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-rose-900 dark:border-rose-800/60 dark:bg-slate-950 dark:text-rose-200"
                  >
                    <span className="font-semibold">{row.acta}</span> | {row.reason}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">Actas validadas</h3>
          <button
            type="button"
            onClick={() => {
              clearScanState();
              inputRef.current?.focus();
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-950 dark:hover:bg-slate-800"
          >
            Limpiar escaneo
          </button>
        </div>
        {scannedActas.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Aun no hay actas validadas.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {scannedActas.map((acta) => (
              <span
                key={acta}
                className="inline-flex items-center gap-2 rounded-full bg-slate-800 px-3 py-1 text-xs text-white dark:bg-slate-700"
              >
                {acta}
              </span>
            ))}
          </div>
        )}
      </div>

      {rowsList.length > 0 && (
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
              {rowsList.map((row) => {
                const clientes = row.matches.map((m) => m.cliente).filter(Boolean);
                const codigos = row.matches.map((m) => m.codigoCliente).filter(Boolean);
                const cuadrillas = row.matches.map((m) => m.cuadrillaNombre).filter(Boolean);
                return (
                  <tr
                    key={row.acta}
                    className={`border-t border-slate-200 dark:border-slate-700 ${
                      row.status === "sin_cliente" ? "bg-amber-50/70 dark:bg-amber-950/20" : ""
                    }`}
                  >
                    <td className="p-2 font-medium">{row.acta}</td>
                    <td className="p-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          row.status === "ok"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                        }`}
                      >
                        {statusBadge(row.status)}
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
      )}

      {summary.totalEsperadas > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold">Actas faltantes</h3>
            <span className="text-sm text-slate-500 dark:text-slate-400">{missingItems.length} pendiente(s)</span>
          </div>
          {missingItems.length === 0 ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-300">No faltan actas. El dia esta completo.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 dark:bg-slate-800/80">
                  <tr>
                    <th className="p-2 text-left">Acta</th>
                    <th className="p-2 text-left">Cliente</th>
                    <th className="p-2 text-left">Codigo</th>
                    <th className="p-2 text-left">Cuadrilla</th>
                  </tr>
                </thead>
                <tbody>
                  {missingItems.slice(0, 300).map((item) => (
                    <tr key={item.acta} className="border-t border-slate-200 dark:border-slate-700">
                      <td className="p-2 font-medium">{item.acta}</td>
                      <td className="p-2">{item.cliente || "-"}</td>
                      <td className="p-2">{item.codigoCliente || "-"}</td>
                      <td className="p-2">{item.cuadrillaNombre || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
