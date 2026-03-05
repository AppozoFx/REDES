"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ApiData = {
  ok: boolean;
  generatedAt: string;
  almacen: {
    ONT: number;
    MESH: number;
    FONO: number;
    BOX: number;
    ONT_HUAWEI: number;
    ONT_ZTE: number;
    MESH_HUAWEI: number;
    MESH_ZTE: number;
  };
  rows: Array<{
    id: string;
    criticos: string[];
    materiales: { materialCount: number; totalUnd: number; totalMetros: number };
  }>;
};

function asLocalDateTime(iso?: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "-";
  return d.toLocaleString("es-PE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HomeAlmacenClient() {
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setError("");
        const res = await fetch("/api/admin/instalaciones/stock-overview?includeInactive=1", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as ApiData | null;
        if (!res.ok || !json?.ok) throw new Error((json as any)?.error || "ERROR");
        if (alive) setData(json);
      } catch (e: any) {
        if (alive) setError(String(e?.message || "ERROR"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const summary = useMemo(() => {
    const rows = data?.rows || [];
    const almacen = data?.almacen;
    const totalAlmacen =
      (almacen?.ONT || 0) + (almacen?.MESH || 0) + (almacen?.FONO || 0) + (almacen?.BOX || 0);
    const criticas = rows.filter((r) => (r.criticos || []).length > 0).length;
    const materialesItems = rows.reduce((acc, r) => acc + (r.materiales?.materialCount || 0), 0);
    const totalUnd = rows.reduce((acc, r) => acc + (r.materiales?.totalUnd || 0), 0);
    const totalMetros = rows.reduce((acc, r) => acc + (r.materiales?.totalMetros || 0), 0);
    const criticos = rows.flatMap((r) => r.criticos || []);
    const sinOnt = criticos.filter((c) => c === "SIN_ONT").length;
    const sinMesh = criticos.filter((c) => c === "SIN_MESH").length;
    const sinFono = criticos.filter((c) => c === "SIN_FONO").length;
    const sinBox = criticos.filter((c) => c === "SIN_BOX").length;
    const sinMateriales = criticos.filter((c) => c === "SIN_MATERIALES").length;
    const cuadrillasConMateriales = rows.filter((r) => (r.materiales?.materialCount || 0) > 0).length;
    return {
      totalAlmacen,
      ont: almacen?.ONT || 0,
      mesh: almacen?.MESH || 0,
      fono: almacen?.FONO || 0,
      box: almacen?.BOX || 0,
      ontHuawei: almacen?.ONT_HUAWEI || 0,
      ontZte: almacen?.ONT_ZTE || 0,
      meshHuawei: almacen?.MESH_HUAWEI || 0,
      meshZte: almacen?.MESH_ZTE || 0,
      cuadrillas: rows.length,
      criticas,
      sinOnt,
      sinMesh,
      sinFono,
      sinBox,
      sinMateriales,
      materialesItems,
      totalUnd,
      totalMetros: Number(totalMetros.toFixed(2)),
      cuadrillasConMateriales,
    };
  }, [data]);

  if (loading) return <div className="text-sm text-slate-600 dark:text-slate-400">Cargando inicio de almacen...</div>;

  return (
    <div className="space-y-5">
      {error ? (
        <div className="rounded-2xl border border-rose-300/80 bg-rose-50/90 px-4 py-3 text-sm text-rose-700 shadow-sm dark:border-rose-800/80 dark:bg-rose-900/20 dark:text-rose-300">
          Error al cargar resumen: {error}
        </div>
      ) : null}

      <div className="space-y-4">
        <Link
          href="/home/almacen/stock"
          className="group relative block overflow-hidden rounded-3xl border border-slate-200/90 bg-white/95 p-6 shadow-sm ring-1 ring-black/[0.02] transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/80 hover:shadow-lg dark:border-slate-700/80 dark:bg-slate-900/90 dark:ring-white/[0.03] dark:hover:border-cyan-700"
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-cyan-100/60 to-transparent opacity-80 dark:from-cyan-900/20" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/80 bg-cyan-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-300">
                Resumen
              </div>
              <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Stock de almacen</h3>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">Equipos disponibles para despacho inmediato.</p>
              <div className="mt-4 inline-flex items-center text-xs font-medium text-cyan-700 transition group-hover:translate-x-0.5 dark:text-cyan-300">
                Ver detalle de stock en almacen <span className="ml-1">→</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div className="rounded-xl border border-cyan-200/80 bg-cyan-50/90 px-3 py-2.5 dark:border-cyan-900 dark:bg-cyan-950/30">
                <div className="text-[11px] uppercase text-cyan-700 dark:text-cyan-300">Total</div>
                <div className="text-2xl font-semibold text-cyan-700 dark:text-cyan-300">{summary.totalAlmacen}</div>
              </div>
              <div className="rounded-xl border border-slate-200/90 bg-white/70 px-3 py-2.5 dark:border-slate-700/80 dark:bg-slate-950/40">
                <div className="text-[11px] uppercase text-slate-500">ONT</div>
                <div className="font-semibold">{summary.ont}</div>
                <div className="text-[11px] text-slate-500">H/Z: {summary.ontHuawei}/{summary.ontZte}</div>
              </div>
              <div className="rounded-xl border border-slate-200/90 bg-white/70 px-3 py-2.5 dark:border-slate-700/80 dark:bg-slate-950/40">
                <div className="text-[11px] uppercase text-slate-500">MESH</div>
                <div className="font-semibold">{summary.mesh}</div>
                <div className="text-[11px] text-slate-500">H/Z: {summary.meshHuawei}/{summary.meshZte}</div>
              </div>
              <div className="rounded-xl border border-slate-200/90 bg-white/70 px-3 py-2.5 dark:border-slate-700/80 dark:bg-slate-950/40">
                <div className="text-[11px] uppercase text-slate-500">FONO / BOX</div>
                <div className="font-semibold">{summary.fono} / {summary.box}</div>
                <div className="text-[11px] text-slate-500">Tipos auxiliares</div>
              </div>
            </div>
          </div>
        </Link>

        <Link
          href="/home/almacen/cuadrillas"
          className="group relative block overflow-hidden rounded-3xl border border-slate-200/90 bg-white/95 p-6 shadow-sm ring-1 ring-black/[0.02] transition duration-200 hover:-translate-y-0.5 hover:border-amber-300/80 hover:shadow-lg dark:border-slate-700/80 dark:bg-slate-900/90 dark:ring-white/[0.03] dark:hover:border-amber-700"
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-amber-100/60 to-transparent opacity-80 dark:from-amber-900/20" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-amber-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                Resumen
              </div>
              <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Stock de cuadrillas</h3>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">Criticidad y faltantes de equipos por cuadrilla.</p>
              <div className="mt-4 inline-flex items-center text-xs font-medium text-amber-700 transition group-hover:translate-x-0.5 dark:text-amber-300">
                Ver detalle por cuadrilla <span className="ml-1">→</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200/90 bg-white/70 px-3 py-2.5 dark:border-slate-700/80 dark:bg-slate-950/40">
                <div className="text-[11px] uppercase text-slate-500">Cuadrillas</div>
                <div className="text-2xl font-semibold">{summary.cuadrillas}</div>
              </div>
              <div className="rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-2.5 dark:border-amber-900 dark:bg-amber-950/30">
                <div className="text-[11px] uppercase text-amber-700 dark:text-amber-300">Criticas</div>
                <div className="text-2xl font-semibold text-amber-700 dark:text-amber-300">{summary.criticas}</div>
              </div>
              <div className="rounded-xl border border-rose-200/80 bg-rose-50/90 px-3 py-2.5 dark:border-rose-900 dark:bg-rose-950/30">
                <div className="text-[11px] uppercase text-rose-700 dark:text-rose-300">Sin ONT/MESH</div>
                <div className="font-semibold text-rose-700 dark:text-rose-300">{summary.sinOnt} / {summary.sinMesh}</div>
              </div>
              <div className="rounded-xl border border-rose-200/80 bg-rose-50/90 px-3 py-2.5 dark:border-rose-900 dark:bg-rose-950/30">
                <div className="text-[11px] uppercase text-rose-700 dark:text-rose-300">Sin FONO/BOX</div>
                <div className="font-semibold text-rose-700 dark:text-rose-300">{summary.sinFono} / {summary.sinBox}</div>
              </div>
            </div>
          </div>
        </Link>

        <Link
          href="/home/almacen/materiales"
          className="group relative block overflow-hidden rounded-3xl border border-slate-200/90 bg-white/95 p-6 shadow-sm ring-1 ring-black/[0.02] transition duration-200 hover:-translate-y-0.5 hover:border-emerald-300/80 hover:shadow-lg dark:border-slate-700/80 dark:bg-slate-900/90 dark:ring-white/[0.03] dark:hover:border-emerald-700"
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-emerald-100/60 to-transparent opacity-80 dark:from-emerald-900/20" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                Resumen
              </div>
              <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Stock de materiales</h3>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">Materiales en stock y alertas de minimo.</p>
              <div className="mt-4 inline-flex items-center text-xs font-medium text-emerald-700 transition group-hover:translate-x-0.5 dark:text-emerald-300">
                Ver detalle de materiales <span className="ml-1">→</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200/90 bg-white/70 px-3 py-2.5 dark:border-slate-700/80 dark:bg-slate-950/40">
                <div className="text-[11px] uppercase text-slate-500">Items</div>
                <div className="text-2xl font-semibold">{summary.materialesItems}</div>
              </div>
              <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-3 py-2.5 dark:border-emerald-900 dark:bg-emerald-950/30">
                <div className="text-[11px] uppercase text-emerald-700 dark:text-emerald-300">UND</div>
                <div className="font-semibold text-emerald-700 dark:text-emerald-300">{summary.totalUnd}</div>
              </div>
              <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-3 py-2.5 dark:border-emerald-900 dark:bg-emerald-950/30">
                <div className="text-[11px] uppercase text-emerald-700 dark:text-emerald-300">Metros</div>
                <div className="font-semibold text-emerald-700 dark:text-emerald-300">{summary.totalMetros}</div>
              </div>
              <div className="rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-2.5 dark:border-amber-900 dark:bg-amber-950/30">
                <div className="text-[11px] uppercase text-amber-700 dark:text-amber-300">Sin Material</div>
                <div className="font-semibold text-amber-700 dark:text-amber-300">
                  {summary.sinMateriales} / {summary.cuadrillas}
                </div>
              </div>
            </div>
          </div>
        </Link>
      </div>

      <div className="rounded-2xl border border-slate-200/90 bg-slate-50/95 px-4 py-2.5 text-xs text-slate-500 shadow-sm dark:border-slate-700/80 dark:bg-slate-800/60 dark:text-slate-400">
        Ultima actualizacion: {asLocalDateTime(data?.generatedAt)}
      </div>
    </div>
  );
}
