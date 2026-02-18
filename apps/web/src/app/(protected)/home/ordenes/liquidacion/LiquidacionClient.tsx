"use client";

import { useEffect, useMemo, useState } from "react";
import { LiquidacionRowClient } from "./LiquidacionRowClient";

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
};

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function LiquidacionClient({ initialYmd }: { initialYmd?: string }) {
  const [ymd, setYmd] = useState(initialYmd || todayLimaYmd());
  const [q, setQ] = useState("");
  const [coordinador, setCoordinador] = useState("");
  const [showLiquidadas, setShowLiquidadas] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [kpi, setKpi] = useState({ finalizadas: 0, liquidadas: 0, pendientes: 0 });
  const [reloadTick, setReloadTick] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    async function run() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/ordenes/liquidacion/list?ymd=${encodeURIComponent(ymd)}`, {
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
  }, [ymd, reloadTick]);

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    return rows.filter((r) => {
      const byCoord = !coordinador || String(r.coordinador || "") === coordinador;
      if (!byCoord) return false;
      if (!showLiquidadas && r.liquidado) return false;
      if (!text) return true;
      const hay = `${r.ordenId} ${r.cliente} ${r.codiSeguiClien} ${r.cuadrillaNombre} ${r.cuadrillaId} ${r.coordinador}`.toLowerCase();
      return hay.includes(text);
    });
  }, [rows, q, coordinador, showLiquidadas]);

  const coordinadores = useMemo(() => {
    return Array.from(new Set(rows.map((r) => String(r.coordinador || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  return (
    <div className="w-full space-y-4 p-3 md:p-4">
      <header className="sticky top-0 z-20 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Ordenes · Liquidacion</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Gestiona ordenes finalizadas, revisa pendientes y ejecuta liquidaciones por cuadrilla.
        </p>
      </header>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <div className="border-b border-slate-200 p-4 dark:border-slate-700">
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
            <div>
              <label className="mb-1 block text-sm">Fecha (Lima)</label>
              <input type="date" value={ymd} onChange={(e) => setYmd(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" />
            </div>
            <div className="min-w-60">
              <label className="mb-1 block text-sm">Buscar</label>
              <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Orden, cliente, codigo, cuadrilla" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" />
            </div>
            <div className="min-w-60">
              <label className="mb-1 block text-sm">Coordinador</label>
              <select value={coordinador} onChange={(e) => setCoordinador(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900">
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

        <div className="border-b border-slate-200 p-4 dark:border-slate-700">
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric title="Finalizadas" value={kpi.finalizadas} tone="slate" />
            <Metric title="Liquidadas" value={kpi.liquidadas} tone="emerald" />
            <Metric title="Pendientes" value={kpi.pendientes} tone="amber" />
          </div>
        </div>

        {error ? <div className="m-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

        {!loading && !error && filtered.length === 0 ? (
          <div className="m-4 rounded-lg border border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-300">
            No hay ordenes pendientes para la fecha seleccionada.
          </div>
        ) : null}

        <div className="m-4 space-y-3">
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
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : tone === "amber"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-slate-50 text-slate-700 border-slate-200";
  return (
    <div className={`rounded-xl border px-3 py-2 ${cls}`}>
      <p className="text-xs">{title}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}
