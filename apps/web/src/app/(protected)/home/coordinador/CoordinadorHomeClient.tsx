"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

type DiaDetalle = {
  ymd: string;
  finalizadas: number;
  garantias: number;
  cat5e: number;
  cat6: number;
};

type CuadrillaResumen = {
  cuadrillaId: string;
  cuadrillaNombre: string;
  finalizadas: number;
  garantias: number;
  ventas: number;
  cat5e: number;
  cat6: number;
  dias: DiaDetalle[];
};

type ApiResp = {
  ok: true;
  ym: string;
  resumen: {
    cuadrillas: number;
    finalizadas: number;
    garantias: number;
    ventas: number;
    cat5e: number;
    cat6: number;
  };
  cuadrillas: CuadrillaResumen[];
};

function monthNow() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function ymLabel(ym: string) {
  const [y, m] = String(ym || "").split("-");
  const date = new Date(Date.UTC(Number(y || 0), Math.max(0, Number(m || 1) - 1), 1));
  return date.toLocaleDateString("es-PE", { month: "long", year: "numeric", timeZone: "UTC" });
}

function dayLabel(ymd: string) {
  const parts = String(ymd || "").split("-");
  if (parts.length !== 3) return ymd;
  return parts[2];
}

export default function CoordinadorHomeClient() {
  const [ym, setYm] = useState(monthNow());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResp | null>(null);
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<CuadrillaResumen | null>(null);

  const cargar = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/coordinador/inicio?ym=${encodeURIComponent(ym)}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      setData(body as ApiResp);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo cargar el resumen del coordinador");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, [ym]);

  const visibles = useMemo(() => {
    const list = data?.cuadrillas || [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((r) => {
      const name = String(r.cuadrillaNombre || "").toLowerCase();
      const id = String(r.cuadrillaId || "").toLowerCase();
      return name.includes(needle) || id.includes(needle);
    });
  }, [data, q]);

  const topCuadrillas = useMemo(() => {
    return [...visibles]
      .sort((a, b) => b.finalizadas - a.finalizadas)
      .slice(0, 10)
      .map((r) => ({ nombre: r.cuadrillaNombre || r.cuadrillaId, finalizadas: r.finalizadas }));
  }, [visibles]);

  const modalInstalacionesData = useMemo(() => {
    if (!modal) return [] as Array<{ dia: string; finalizadas: number; cat5e: number; cat6: number }>;
    return [...modal.dias]
      .sort((a, b) => a.ymd.localeCompare(b.ymd))
      .map((d) => ({ dia: dayLabel(d.ymd), finalizadas: d.finalizadas, cat5e: d.cat5e, cat6: d.cat6 }));
  }, [modal]);

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-r from-cyan-50 via-white to-teal-50 p-5 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-cyan-200/40 blur-2xl dark:bg-cyan-800/30" />
        <div className="absolute -bottom-10 left-10 h-28 w-28 rounded-full bg-emerald-200/40 blur-2xl dark:bg-emerald-800/20" />
        <div className="relative grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Tablero de Coordinador</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Seguimiento mensual de cuadrillas de instalaciones.</p>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Mes</label>
            <input
              type="month"
              value={ym}
              onChange={(e) => setYm(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <button
            type="button"
            onClick={cargar}
            disabled={loading}
            className="h-10 rounded-lg bg-slate-900 px-4 text-sm text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600"
          >
            {loading ? "Actualizando..." : "Actualizar"}
          </button>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-6">
        <KpiCard label="Cuadrillas" value={data?.resumen.cuadrillas ?? 0} tone="slate" />
        <KpiCard label="Finalizadas" value={data?.resumen.finalizadas ?? 0} tone="emerald" />
        <KpiCard label="Garantias" value={data?.resumen.garantias ?? 0} tone="amber" />
        <KpiCard label="Ventas" value={data?.resumen.ventas ?? 0} tone="rose" href="/home/ventas" />
        <KpiCard label="CAT5e" value={data?.resumen.cat5e ?? 0} tone="cyan" />
        <KpiCard label="CAT6" value={data?.resumen.cat6 ?? 0} tone="indigo" />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">Top cuadrillas por instalaciones</div>
          <span className="text-xs text-slate-500">{ymLabel(ym)}</span>
        </div>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topCuadrillas} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
              <XAxis dataKey="nombre" tick={{ fontSize: 11 }} angle={-18} textAnchor="end" height={52} interval={0} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="finalizadas" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <label className="mb-1 block text-xs text-slate-500">Buscar cuadrilla</label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nombre o ID de cuadrilla"
          className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        <div className="rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="p-2">
            {visibles.map((r) => (
              <button
                key={r.cuadrillaId}
                type="button"
                onClick={() => setModal(r)}
                className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-left hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{r.cuadrillaNombre || r.cuadrillaId}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
                    Finalizadas: {r.finalizadas}
                  </span>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
                    Garantias: {r.garantias}
                  </span>
                  <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
                    Ventas: {r.ventas}
                  </span>
                  <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-cyan-700 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-300">
                    CAT5e: {r.cat5e}
                  </span>
                  <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-indigo-700 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-300">
                    CAT6: {r.cat6}
                  </span>
                </div>
              </button>
            ))}
            {!loading && visibles.length === 0 && (
              <div className="px-2 py-6 text-center text-sm text-slate-500">No hay datos para este periodo.</div>
            )}
          </div>
        </div>
      </section>

      {modal && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/45" onClick={() => setModal(null)} />
          <div className="absolute inset-0 flex items-center justify-center p-4" onClick={() => setModal(null)}>
            <div
              className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{modal.cuadrillaNombre || modal.cuadrillaId}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Detalle diario de instalaciones - {ymLabel(ym)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded-lg border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  Cerrar
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <div className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">Instalaciones finalizadas por dia</div>
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={modalInstalacionesData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                      <XAxis dataKey="dia" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="finalizadas" fill="#16a34a" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/50 dark:bg-rose-950/20">
                  <div className="text-xs text-rose-700 dark:text-rose-300">Ventas</div>
                  <div className="mt-1 text-2xl font-semibold text-rose-900 dark:text-rose-100">{modal.ventas}</div>
                </div>
                <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 dark:border-cyan-900/50 dark:bg-cyan-950/20">
                  <div className="text-xs text-cyan-700 dark:text-cyan-300">CAT5e</div>
                  <div className="mt-1 text-2xl font-semibold text-cyan-900 dark:text-cyan-100">{modal.cat5e}</div>
                </div>
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20">
                  <div className="text-xs text-indigo-700 dark:text-indigo-300">CAT6</div>
                  <div className="mt-1 text-2xl font-semibold text-indigo-900 dark:text-indigo-100">{modal.cat6}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
  href,
}: {
  label: string;
  value: number;
  tone: "slate" | "emerald" | "amber" | "cyan" | "indigo" | "rose";
  href?: string;
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/25"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/25"
        : tone === "rose"
          ? "border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/25"
        : tone === "cyan"
          ? "border-cyan-200 bg-cyan-50 dark:border-cyan-900/60 dark:bg-cyan-950/25"
          : tone === "indigo"
            ? "border-indigo-200 bg-indigo-50 dark:border-indigo-900/60 dark:bg-indigo-950/25"
            : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60";

  const card = (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</div>
    </div>
  );

  if (!href) return card;
  return (
    <Link href={href} className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
      {card}
    </Link>
  );
}
