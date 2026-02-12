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
      if (!text) return true;
      const hay = `${r.ordenId} ${r.cliente} ${r.codiSeguiClien} ${r.cuadrillaNombre} ${r.cuadrillaId} ${r.coordinador}`.toLowerCase();
      return hay.includes(text);
    });
  }, [rows, q, coordinador]);

  const coordinadores = useMemo(() => {
    return Array.from(
      new Set(rows.map((r) => String(r.coordinador || "").trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-3 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-sm mb-1">Fecha (Lima)</label>
          <input
            type="date"
            value={ymd}
            onChange={(e) => setYmd(e.target.value)}
            className="rounded border px-3 py-2 text-sm"
          />
        </div>
        <div className="min-w-60">
          <label className="block text-sm mb-1">Buscar</label>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Orden, cliente, codigo, cuadrilla"
            className="w-full rounded border px-3 py-2 text-sm"
          />
        </div>
        <div className="min-w-60">
          <label className="block text-sm mb-1">Coordinador</label>
          <select
            value={coordinador}
            onChange={(e) => setCoordinador(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm"
          >
            <option value="">Todos</option>
            {coordinadores.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        {loading
          ? "Cargando..."
          : `Finalizadas: ${kpi.finalizadas} | Liquidadas: ${kpi.liquidadas} | Pendientes: ${kpi.pendientes}`}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {!loading && !error && filtered.length === 0 ? (
        <div className="rounded-lg border p-4 text-sm text-muted-foreground">
          No hay ordenes pendientes para la fecha seleccionada.
        </div>
      ) : null}

      <div className="space-y-3">
        {filtered.map((r) => (
          <LiquidacionRowClient
            key={r.id}
            orden={r}
            onLiquidated={() => setReloadTick((v) => v + 1)}
          />
        ))}
      </div>
    </div>
  );
}
