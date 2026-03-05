"use client";

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

export default function HomeAlmacenStockClient() {
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

  const total = useMemo(() => {
    const a = data?.almacen;
    return (a?.ONT || 0) + (a?.MESH || 0) + (a?.FONO || 0) + (a?.BOX || 0);
  }, [data]);

  if (loading) return <div className="text-sm text-slate-600 dark:text-slate-400">Cargando stock de almacen...</div>;

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
          Error al cargar stock: {error}
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-3 shadow-sm dark:border-cyan-800 dark:bg-cyan-900/20">
          <div className="text-xs uppercase tracking-wide text-cyan-700 dark:text-cyan-300">Total almacen</div>
          <div className="mt-1 text-2xl font-semibold text-cyan-700 dark:text-cyan-300">{total}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="text-xs text-slate-500">ONT (H/Z)</div>
          <div className="mt-1 text-lg font-semibold">
            {data?.almacen.ONT_HUAWEI || 0} / {data?.almacen.ONT_ZTE || 0}
          </div>
          <div className="text-xs text-slate-500">Total: {data?.almacen.ONT || 0}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="text-xs text-slate-500">MESH (H/Z)</div>
          <div className="mt-1 text-lg font-semibold">
            {data?.almacen.MESH_HUAWEI || 0} / {data?.almacen.MESH_ZTE || 0}
          </div>
          <div className="text-xs text-slate-500">Total: {data?.almacen.MESH || 0}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="text-xs text-slate-500">FONO</div>
          <div className="mt-1 text-lg font-semibold">{data?.almacen.FONO || 0}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="text-xs text-slate-500">BOX</div>
          <div className="mt-1 text-lg font-semibold">{data?.almacen.BOX || 0}</div>
        </div>
      </section>

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
        Ultima actualizacion: {asLocalDateTime(data?.generatedAt)}
      </div>
    </div>
  );
}

