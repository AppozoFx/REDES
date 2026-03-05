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
  const [autoReview, setAutoReview] = useState<Array<{ ordenId: string; pedido: string; reason: string }>>([]);
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

    const reviewRows: Array<{ ordenId: string; pedido: string; reason: string }> = [];
    let liquidated = 0;
    let processed = 0;

    try {
      for (const row of pendingRows) {
        processed += 1;
        const pedido = String(row.codiSeguiClien || "").trim() || String(row.ordenId || row.id);
        const preYmd = String(row.fechaFinVisiYmd || ymd).trim() || ymd;

        try {
          const preRes = await fetch(
            `/api/ordenes/liquidacion/preliquidacion?pedido=${encodeURIComponent(pedido)}&ymd=${encodeURIComponent(preYmd)}`,
            { cache: "no-store" }
          );
          const preData = await preRes.json().catch(() => ({}));
          if (!preRes.ok) {
            reviewRows.push({ ordenId: row.id, pedido, reason: String(preData?.error || "PRELIQ_ERROR") });
            continue;
          }
          if (!preData?.found || !preData?.item) {
            reviewRows.push({ ordenId: row.id, pedido, reason: "PRELIQ_NOT_FOUND" });
            continue;
          }

          const item = preData.item || {};
          const snOnt = String(item.snOnt || "").trim();
          const snFono = String(item.snFono || "").trim();
          const snMeshes = Array.isArray(item.snMeshes) ? item.snMeshes.map((v: any) => String(v || "").trim()).filter(Boolean) : [];
          const snBoxes = Array.isArray(item.snBoxes) ? item.snBoxes.map((v: any) => String(v || "").trim()).filter(Boolean) : [];
          const rotuloNapCto = String(item.rotuloNapCto || "").trim();

          if (!snOnt) {
            reviewRows.push({ ordenId: row.id, pedido, reason: "SN_ONT_REQUIRED" });
            continue;
          }
          if (!rotuloNapCto) {
            reviewRows.push({ ordenId: row.id, pedido, reason: "ROTULO_NAP_CTO_REQUIRED" });
            continue;
          }

          const sns = uniq([snOnt, ...snMeshes, ...snBoxes, snFono]);
          if (!sns.length) {
            reviewRows.push({ ordenId: row.id, pedido, reason: "SNS_REQUIRED" });
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
            reviewRows.push({ ordenId: row.id, pedido, reason });
          }
        } catch (e: any) {
          reviewRows.push({ ordenId: row.id, pedido, reason: String(e?.message || "AUTO_LIQ_ERROR") });
        }
      }

      setAutoReview(reviewRows);
      setAutoSummary({ processed, liquidated, review: reviewRows.length });

      if (liquidated > 0) setReloadTick((v) => v + 1);

      if (trigger === "manual") {
        toast.success(`Auto-liquidacion procesada: ${liquidated} liquidadas, ${reviewRows.length} en revision`);
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

  const filteredBase = useMemo(() => {
    const text = q.trim().toLowerCase();
    return rows.filter((r) => {
      const byDate = !filterDate || String(r.fechaFinVisiYmd || "") === filterDate;
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

  return (
    <div className="w-full space-y-4 p-3 md:p-4">
      <div className="sticky top-0 z-30 space-y-3">
        <header className="rounded-xl border border-slate-200 bg-white/90 px-3 py-2 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Ordenes - Liquidacion</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Gestiona ordenes finalizadas, revisa pendientes y ejecuta liquidaciones por cuadrilla.
          </p>
        </header>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-200 p-4 dark:border-slate-700">
            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
              <div>
                <label className="mb-1 block text-sm">Mes (Lima)</label>
                <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="ui-input-inline rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" />
              </div>
              <div>
                <label className="mb-1 block text-sm">Filtrar por fecha</label>
                <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="ui-input-inline rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" />
              </div>
              <div className="min-w-60">
                <label className="mb-1 block text-sm">Buscar</label>
                <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Orden, cliente, codigo, cuadrilla" className="ui-input-inline w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" />
              </div>
              <div className="min-w-60">
                <label className="mb-1 block text-sm">Coordinador</label>
                <select value={coordinador} onChange={(e) => setCoordinador(e.target.value)} className="ui-select-inline w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900">
                  <option value="">Todos</option>
                  {coordinadores.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input type="checkbox" checked={showLiquidadas} onChange={(e) => setShowLiquidadas(e.target.checked)} />
                Mostrar liquidadas
              </label>
            </div>
          </div>

          <div className="p-4">
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
              <button
                type="button"
                onClick={() => setAutoEnabled((v) => !v)}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  autoEnabled
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : "bg-slate-700 text-white hover:bg-slate-800"
                }`}
              >
                Auto-liquidacion {autoEnabled ? "ON" : "OFF"}
              </button>
              <button
                type="button"
                onClick={() => runAutoLiquidacion("manual")}
                disabled={autoRunning || loading}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
              >
                {autoRunning ? "Procesando..." : "Ejecutar auto-liquidacion ahora"}
              </button>
              {autoSummary ? (
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  Procesadas: {autoSummary.processed} | Liquidadas: {autoSummary.liquidated} | Revision: {autoSummary.review}
                </div>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric title="Finalizadas" value={kpiFiltrado.finalizadas} tone="slate" />
              <Metric title="Liquidadas" value={kpiFiltrado.liquidadas} tone="emerald" />
              <Metric title="Pendientes" value={kpiFiltrado.pendientes} tone="amber" />
            </div>
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
        {error ? <div className="m-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

        {!loading && !error && filtered.length === 0 ? (
          <div className="m-4 rounded-lg border border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-300">
            No hay ordenes pendientes para la fecha seleccionada.
          </div>
        ) : null}

        <div className="m-4 space-y-3">
          {autoReview.length > 0 ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
              <div className="mb-1 font-semibold">Ordenes en revision automatica</div>
              <div className="max-h-28 overflow-auto space-y-1">
                {autoReview.map((x) => (
                  <div key={`rev-${x.ordenId}-${x.reason}`}>
                    {x.pedido}: {x.reason}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {loading ? <div className="rounded-lg border border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-300">Cargando...</div> : null}
          {filtered.map((r) => (
            <LiquidacionRowClient key={r.id} orden={r} onLiquidated={() => setReloadTick((v) => v + 1)} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({
  title,
  value,
  tone,
}: {
  title: string;
  value: number;
  tone: "slate" | "emerald" | "amber";
}) {
  const cls =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700"
      : tone === "amber"
      ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700"
      : "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700";
  return (
    <div className={`rounded-xl border px-3 py-2 ${cls}`}>
      <p className="text-xs">{title}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}
