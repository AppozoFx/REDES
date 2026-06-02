"use client";
import { useEffect, useMemo, useState } from "react";
import { LiquidacionRowClient } from "./LiquidacionRowClient";
import { liquidarOrdenAction } from "./actions";
import { toast } from "sonner";

type Row = {
  id: string;
  ordenId: string;
  cliente: string;
  direccion: string;
  plan: string;
  codiSeguiClien: string;
  coordinador: string;
  cuadrillaId: string;
  cuadrillaNombre: string;
  fSoliYmd?: string;
  fechaFinVisiYmd: string;
  fechaFinVisiHm: string;
  tipo: string;
  estado: string;
  idenServi: string;
  cantMESHwin: string;
  cantFONOwin: string;
  cantBOXwin: string;
  liquidado?: boolean;
};

type AutoReviewItem = {
  ordenId: string;
  codigoCliente: string;
  cuadrilla: string;
  message: string;
  reason: string;
};

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function monthFromYmd(ymd: string) {
  const v = String(ymd || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.slice(0, 7) : todayLimaYmd().slice(0, 7);
}

function reasonToUserMessage(reasonRaw: string): string {
  const reason = String(reasonRaw || "").trim().toUpperCase();
  if (reason === "PRELIQ_NOT_FOUND") return "No se encontro preliquidacion de Telegram para la fecha.";
  if (reason === "PRELIQ_ERROR") return "Error consultando preliquidacion de Telegram.";
  if (reason === "SN_ONT_REQUIRED" || reason === "ONT_INVALID_COUNT") return "SN ONT faltante o invalido.";
  if (reason === "ROTULO_NAP_CTO_REQUIRED") return "Falta rotulo NAP/CTO.";
  if (reason === "SNS_REQUIRED") return "No se recibieron series SN para liquidar.";
  if (reason === "MESH_INSUFICIENTE") return "Faltan equipos MESH requeridos.";
  if (reason === "BOX_INSUFICIENTE") return "Faltan equipos BOX requeridos.";
  if (reason === "FONO_INSUFICIENTE") return "Falta equipo FONO requerido.";
  if (reason === "MESH_MAX_4" || reason === "BOX_MAX_4" || reason === "FONO_MAX_1") {
    return "Cantidad maxima excedida para series de equipos.";
  }
  if (reason === "ORDEN_YA_LIQUIDADA") return "La orden ya estaba liquidada.";
  if (reason === "ORDEN_NOT_FOUND") return "No se encontro la orden en base de datos.";
  if (reason === "ORDEN_SIN_CUADRILLA") return "La orden no tiene cuadrilla asignada.";
  if (reason === "INVALID_CUADRILLA") return "La cuadrilla asignada no es valida.";
  if (reason === "AUTO_LIQ_ERROR") return "Fallo inesperado durante auto-liquidacion.";
  return `Revision manual requerida (${reason || "ERROR_DESCONOCIDO"}).`;
}

export function LiquidacionClient({ initialYmd, initialMonth }: { initialYmd?: string; initialMonth?: string }) {
  const ymd = initialYmd || todayLimaYmd();
  const [month, setMonth] = useState(initialMonth || monthFromYmd(initialYmd || todayLimaYmd()));
  const [filterDate, setFilterDate] = useState("");
  const [q, setQ] = useState("");
  const [coordinador, setCoordinador] = useState("");
  const [showLiquidadas, setShowLiquidadas] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [kpi, setKpi] = useState({ finalizadas: 0, liquidadas: 0, pendientes: 0 });
  const [reloadTick, setReloadTick] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoSummary, setAutoSummary] = useState<{ processed: number; liquidated: number; review: number } | null>(null);
  const [autoReview, setAutoReview] = useState<AutoReviewItem[]>([]);
  const [autoRunKey, setAutoRunKey] = useState("");

  function norm(s: string) {
    return String(s || "").trim().toUpperCase();
  }

  function detectTipificaciones(idenServi: string) {
    const base = norm(idenServi);
    const compact = base.replace(/\s+/g, "");
    const gamer = compact.includes("INTERNETGAMER") || base.includes("GAMER");
    const kitWifiPro = compact.includes("KITWIFIPRO(ENVENTA)") || compact.includes("KITWIFIPRO") || base.includes("KIT WIFI PRO (EN VENTA)");
    const cableadoMesh = compact.includes("SERVICIOCABLEADODEMESH") || base.includes("CABLEADO DE MESH");
    return { gamer, kitWifiPro, cableadoMesh };
  }

  function uniq(values: string[]) {
    return Array.from(new Set(values.map((v) => String(v || "").trim()).filter(Boolean)));
  }

  useEffect(() => {
    try {
      const stored = localStorage.getItem("ordenes_liquidacion_auto_enabled");
      if (stored === "1") setAutoEnabled(true);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("ordenes_liquidacion_auto_enabled", autoEnabled ? "1" : "0");
    } catch {}
  }, [autoEnabled]);

  async function runAutoLiquidacion(trigger: "manual" | "auto") {
    if (autoRunning) return;
    const pendingRows = rows.filter((r) => !r.liquidado);
    if (!pendingRows.length) {
      if (trigger === "manual") toast.message("No hay ordenes pendientes para auto-liquidar");
      return;
    }

    setAutoRunning(true);
    setAutoReview([]);
    setAutoSummary(null);

    const reviewRows: AutoReviewItem[] = [];
    let liquidated = 0;
    let processed = 0;

    const buildReview = (row: Row, reasonRaw: string): AutoReviewItem => ({
      ordenId: row.id,
      codigoCliente: String(row.codiSeguiClien || row.ordenId || row.id).trim(),
      cuadrilla: String(row.cuadrillaNombre || row.cuadrillaId || "-").trim() || "-",
      reason: String(reasonRaw || "").trim() || "REVIEW_REQUIRED",
      message: reasonToUserMessage(reasonRaw),
    });

    try {
      for (const row of pendingRows) {
        processed += 1;
        const pedido = String(row.codiSeguiClien || "").trim() || String(row.ordenId || row.id);
        const preYmd = String(row.fSoliYmd || row.fechaFinVisiYmd || ymd).trim() || ymd;

        try {
          const preRes = await fetch(
            `/api/ordenes/liquidacion/preliquidacion?pedido=${encodeURIComponent(pedido)}&ymd=${encodeURIComponent(preYmd)}`,
            { cache: "no-store" }
          );
          const preData = await preRes.json().catch(() => ({}));
          if (!preRes.ok) {
            reviewRows.push(buildReview(row, String(preData?.error || "PRELIQ_ERROR")));
            continue;
          }
          if (!preData?.found || !preData?.item) {
            reviewRows.push(buildReview(row, "PRELIQ_NOT_FOUND"));
            continue;
          }

          const item = preData.item || {};
          const snOnt = String(item.snOnt || "").trim();
          const snFono = String(item.snFono || "").trim();
          const snMeshes = Array.isArray(item.snMeshes) ? item.snMeshes.map((v: any) => String(v || "").trim()).filter(Boolean) : [];
          const snBoxes = Array.isArray(item.snBoxes) ? item.snBoxes.map((v: any) => String(v || "").trim()).filter(Boolean) : [];
          const rotuloNapCto = String(item.rotuloNapCto || "").trim();

          if (!snOnt) {
            reviewRows.push(buildReview(row, "SN_ONT_REQUIRED"));
            continue;
          }
          if (!rotuloNapCto) {
            reviewRows.push(buildReview(row, "ROTULO_NAP_CTO_REQUIRED"));
            continue;
          }

          const sns = uniq([snOnt, ...snMeshes, ...snBoxes, snFono]);
          if (!sns.length) {
            reviewRows.push(buildReview(row, "SNS_REQUIRED"));
            continue;
          }

          const tips = detectTipificaciones(row.idenServi || "");
          const cat5e = tips.cableadoMesh ? 1 : 0;
          const cat6 = tips.gamer ? 1 : 0;
          const puntosUTP = cat5e + cat6;

          const fd = new FormData();
          fd.set("ordenId", row.id);
          fd.set("snsText", sns.join("\n"));
          fd.set("rotuloNapCto", rotuloNapCto);
          fd.set("planGamer", tips.gamer ? "GAMER" : "");
          fd.set("kitWifiPro", tips.kitWifiPro ? "KIT WIFI PRO (AL CONTADO)" : "");
          fd.set("servicioCableadoMesh", tips.cableadoMesh ? "SERVICIO CABLEADO DE MESH" : "");
          fd.set("cat5e", String(cat5e));
          fd.set("cat6", String(cat6));
          fd.set("puntosUTP", String(puntosUTP));
          fd.set("observacion", "");

          const result: any = await liquidarOrdenAction(null, fd);
          if (result?.ok) {
            liquidated += 1;
          } else {
            const reason = String(result?.error?.formErrors?.[0] || "REVIEW_REQUIRED");
            reviewRows.push(buildReview(row, reason));
          }
        } catch (e: any) {
          reviewRows.push(buildReview(row, String(e?.message || "AUTO_LIQ_ERROR")));
        }
      }

      setAutoReview(reviewRows);
      setAutoSummary({ processed, liquidated, review: reviewRows.length });

      if (liquidated > 0) setReloadTick((v) => v + 1);

      if (trigger === "manual") {
        toast.success(`Auto-liquidacion completada. Liquidadas: ${liquidated}. En revision: ${reviewRows.length}.`);
      }
    } finally {
      setAutoRunning(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    async function run() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/ordenes/liquidacion/list?month=${encodeURIComponent(month)}`, {
          cache: "no-store",
          signal: ctrl.signal,
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) {
          throw new Error(String(data?.error || "ERROR"));
        }
        if (!cancelled) {
          setRows(Array.isArray(data.items) ? data.items : []);
          setKpi({
            finalizadas: Number(data?.kpi?.finalizadas || 0),
            liquidadas: Number(data?.kpi?.liquidadas || 0),
            pendientes: Number(data?.kpi?.pendientes || 0),
          });
        }
      } catch (e: any) {
        if (cancelled) return;
        setRows([]);
        setKpi({ finalizadas: 0, liquidadas: 0, pendientes: 0 });
        setError(String(e?.message || "ERROR"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [month, reloadTick]);

  useEffect(() => {
    if (!autoEnabled || loading || !rows.length || autoRunning) return;
    const key = `${ymd}:${reloadTick}:${rows.length}`;
    if (autoRunKey === key) return;
    setAutoRunKey(key);
    runAutoLiquidacion("auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEnabled, loading, rows, ymd, reloadTick, autoRunning, autoRunKey]);

  useEffect(() => {
    if (!filterDate) return;
    const expectedMonth = monthFromYmd(filterDate);
    if (expectedMonth !== month) {
      setMonth(expectedMonth);
    }
  }, [filterDate, month]);

  const filteredBase = useMemo(() => {
    const text = q.trim().toLowerCase();
    return rows.filter((r) => {
      const byDate = !filterDate || String(r.fSoliYmd || r.fechaFinVisiYmd || "") === filterDate;
      if (!byDate) return false;
      const byCoord = !coordinador || String(r.coordinador || "") === coordinador;
      if (!byCoord) return false;
      if (!text) return true;
      const hay = `${r.ordenId} ${r.cliente} ${r.codiSeguiClien} ${r.cuadrillaNombre} ${r.cuadrillaId} ${r.coordinador}`.toLowerCase();
      return hay.includes(text);
    });
  }, [rows, q, coordinador, filterDate]);

  const filtered = useMemo(() => {
    if (showLiquidadas) return filteredBase;
    return filteredBase.filter((r) => !r.liquidado);
  }, [filteredBase, showLiquidadas]);

  const coordinadores = useMemo(() => {
    return Array.from(new Set(rows.map((r) => String(r.coordinador || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const kpiFiltrado = useMemo(() => {
    const finalizadas = filteredBase.length;
    const liquidadas = filteredBase.filter((r) => !!r.liquidado).length;
    const pendientes = finalizadas - liquidadas;
    return { finalizadas, liquidadas, pendientes };
  }, [filteredBase]);

  const inputCls = "h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-blue-900/40";
  const selectCls = inputCls + " appearance-none pr-8 cursor-pointer";

  return (
    <div className="w-full space-y-4">

      {/* ── Sticky controls ── */}
      <div className="sticky top-0 z-30 space-y-3">

        {/* ── Filtros ── */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-700">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Mes (Lima)</label>
                <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Filtrar por fecha</label>
                <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className={inputCls} />
              </div>
              <div className="min-w-52 space-y-1">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Buscar</label>
                <div className="relative">
                  <svg className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Orden, cliente, código, cuadrilla…" className={inputCls + " pl-8 w-full"} />
                </div>
              </div>
              <div className="min-w-44 space-y-1">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Coordinador</label>
                <div className="relative">
                  <select value={coordinador} onChange={(e) => setCoordinador(e.target.value)} className={selectCls + " w-full"}>
                    <option value="">Todos</option>
                    {coordinadores.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <svg className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="6 9 12 15 18 9" /></svg>
                </div>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                <input type="checkbox" checked={showLiquidadas} onChange={(e) => setShowLiquidadas(e.target.checked)} className="h-4 w-4 accent-[#30518c] cursor-pointer" />
                <span className="text-slate-700 dark:text-slate-200">Mostrar liquidadas</span>
              </label>
            </div>
          </div>

          {/* Info bar + Auto-liquidacion + KPIs */}
          <div className="p-4 space-y-4">
            {/* Filtro activo info */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                Mes: {month || "—"}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                Fecha: {filterDate || "sin filtro por día"}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {filteredBase.length} coincidencia{filteredBase.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Auto-liquidacion */}
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setAutoEnabled((v) => !v)}
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
                    autoEnabled
                      ? "bg-emerald-600 text-white shadow-[0_2px_8px_rgba(5,150,105,.25)] hover:bg-emerald-700"
                      : "bg-slate-700 text-white hover:bg-slate-800"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${autoEnabled ? "animate-pulse bg-white" : "bg-slate-400"}`} />
                  Auto-liquidación {autoEnabled ? "ON" : "OFF"}
                </button>
                <button
                  type="button"
                  onClick={() => runAutoLiquidacion("manual")}
                  disabled={autoRunning || loading}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {autoRunning ? (
                    <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />Procesando…</>
                  ) : (
                    <><svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>Ejecutar ahora</>
                  )}
                </button>
              </div>
              {autoSummary && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    Procesadas: {autoSummary.processed}
                  </span>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                    Liquidadas: {autoSummary.liquidated}
                  </span>
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                    Revisión: {autoSummary.review}
                  </span>
                </div>
              )}
            </div>

            {/* KPI cards */}
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric title="Finalizadas" value={kpiFiltrado.finalizadas} tone="slate" />
              <Metric title="Liquidadas" value={kpiFiltrado.liquidadas} tone="emerald" />
              <Metric title="Pendientes" value={kpiFiltrado.pendientes} tone="amber" />
            </div>
          </div>
        </section>
      </div>

      {/* ── Lista de órdenes ── */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">

        {/* Error */}
        {error && (
          <div className="m-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-800/60 dark:bg-rose-900/20 dark:text-rose-300">
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            {error}
          </div>
        )}

        {/* Auto-review alert */}
        {autoReview.length > 0 && (
          <div className="m-4 overflow-hidden rounded-2xl border border-amber-200 dark:border-amber-700/60">
            <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-4 py-3 dark:border-amber-700/40 dark:bg-amber-900/20">
              <svg className="h-4 w-4 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                {autoReview.length} orden{autoReview.length !== 1 ? "es" : ""} en revisión automática
              </p>
            </div>
            <div className="max-h-40 overflow-auto divide-y divide-amber-100 dark:divide-amber-800/40">
              {autoReview.map((x) => (
                <div key={`rev-${x.ordenId}-${x.reason}`} className="flex flex-wrap items-center gap-2 px-4 py-2 text-xs text-amber-900 dark:text-amber-300">
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono font-semibold dark:bg-amber-900/40">{x.codigoCliente}</span>
                  <span className="text-amber-600 dark:text-amber-400">{x.cuadrilla}</span>
                  <span>·</span>
                  <span>{x.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="m-4 flex flex-col items-center gap-3 py-8 text-slate-400 dark:text-slate-500">
            <svg className="h-7 w-7 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
              <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="3" />
            </svg>
            <p className="text-sm">Cargando órdenes…</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && filtered.length === 0 && (
          <div className="m-4 flex flex-col items-center gap-2 rounded-2xl border border-slate-100 py-10 text-slate-400 dark:border-slate-700 dark:text-slate-500">
            <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
              <rect x="9" y="3" width="6" height="4" rx="1" />
            </svg>
            <p className="text-sm">No hay órdenes pendientes para la fecha seleccionada.</p>
          </div>
        )}

        {/* Rows */}
        <div className="space-y-2 p-4">
          {filtered.map((r) => (
            <LiquidacionRowClient key={r.id} orden={r} onLiquidated={() => setReloadTick((v) => v + 1)} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ title, value, tone }: { title: string; value: number; tone: "slate" | "emerald" | "amber" }) {
  const icons = {
    slate: (
      <svg className="h-4 w-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
        <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    ),
    emerald: (
      <svg className="h-4 w-4 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
    amber: (
      <svg className="h-4 w-4 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  };
  const styles = {
    slate: "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900",
    emerald: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-800 dark:from-emerald-900/20 dark:to-slate-900",
    amber: "border-amber-200 bg-gradient-to-br from-amber-50 to-white dark:border-amber-800 dark:from-amber-900/20 dark:to-slate-900",
  };
  const numStyles = {
    slate: "text-slate-900 dark:text-slate-100",
    emerald: "text-emerald-700 dark:text-emerald-300",
    amber: "text-amber-700 dark:text-amber-300",
  };
  const labelStyles = {
    slate: "text-slate-400 dark:text-slate-500",
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
  };
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${styles[tone]}`}>
      <div className="flex items-start justify-between">
        <p className={`text-xs font-medium uppercase tracking-wide ${labelStyles[tone]}`}>{title}</p>
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${tone === "slate" ? "bg-slate-100 dark:bg-slate-800" : tone === "emerald" ? "bg-emerald-100 dark:bg-emerald-900/40" : "bg-amber-100 dark:bg-amber-900/40"}`}>
          {icons[tone]}
        </div>
      </div>
      <p className={`mt-2 text-3xl font-bold tracking-tight ${numStyles[tone]}`}>{value}</p>
    </div>
  );
}
