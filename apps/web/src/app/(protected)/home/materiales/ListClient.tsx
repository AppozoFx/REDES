"use client";

import React from "react";
import { useActionState, useEffect, useMemo, useState, startTransition } from "react";
import { toast } from "sonner";
import { listMaterialesActionWithPrev, updateMaterialStockAction } from "./actions";

export default function ListClient() {
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [unidadTipo, setUnidadTipo] = useState<string>("");
  const [area, setArea] = useState<string>("");
  const [vendible, setVendible] = useState<string>("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [stockDraft, setStockDraft] = useState("");
  const [savingStockId, setSavingStockId] = useState<string | null>(null);
  const [data, run, pending] = useActionState(listMaterialesActionWithPrev as any, { ok: true, items: [] } as any);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 220);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const params = {
      q: qDebounced,
      unidadTipo: unidadTipo || undefined,
      area: area || undefined,
      vendible: vendible || undefined,
    } as any;
    startTransition(() => (run as any)(params));
  }, [qDebounced, unidadTipo, area, vendible, refreshKey]);

  const items = (data as any)?.items ?? [];
  const stats = useMemo(() => {
    const total = items.length;
    const vendibles = items.filter((m: any) => !!m.vendible).length;
    const und = items.filter((m: any) => m.unidadTipo === "UND").length;
    const metros = items.filter((m: any) => m.unidadTipo === "METROS").length;
    return { total, vendibles, und, metros };
  }, [items]);

  const hasFilters = !!q || !!unidadTipo || !!area || !!vendible;
  const fieldClass =
    "h-10 w-full rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40";
  const statCardClass = "rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-3 shadow-sm";
  const stockFieldClass =
    "h-8 w-28 rounded-md border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-2 text-xs outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40";

  const metrosPorUnd = (m: any) => {
    const cm = Number(m?.metrosPorUndCm || 0);
    if (!Number.isFinite(cm) || cm <= 0) return 0;
    return cm / 100;
  };

  const stockUndEquivalente = (m: any) => {
    if (m.unidadTipo === "UND") return Math.floor(Number(m.stockUnd || 0));
    const mpo = metrosPorUnd(m);
    if (mpo <= 0) return 0;
    return Number((Number(m.stockMetros || 0) / mpo).toFixed(2));
  };

  const formatStock = (m: any) => {
    return `${stockUndEquivalente(m)} und`;
  };

  const formatUnidad = (m: any) => {
    if (m.unidadTipo !== "METROS") return "UND";
    const totalMetros = Number(m.stockMetros || 0);
    const pretty = Number(totalMetros.toFixed(2)).toLocaleString("en-US").replace(/,/g, " ");
    return `${pretty} m`;
  };

  const editStock = (m: any) => {
    setEditingStockId(String(m.id));
    const current = stockUndEquivalente(m);
    setStockDraft(String(current));
  };

  const saveStock = async (m: any) => {
    if (savingStockId) return;
    const id = String(m.id || "");
    const raw = String(stockDraft || "").trim().replace(",", ".");
    const n = Number(raw);
    if (!raw || !Number.isFinite(n) || n < 0) {
      toast.error("Stock invalido");
      return;
    }
    setSavingStockId(id);
    try {
      const stockToSend =
        m.unidadTipo === "METROS"
          ? (() => {
              const mpo = metrosPorUnd(m);
              return mpo > 0 ? n * mpo : 0;
            })()
          : n;
      const res = await updateMaterialStockAction({
        id,
        unidadTipo: String(m.unidadTipo || ""),
        stock: stockToSend,
      });
      if (!(res as any)?.ok) {
        toast.error(String((res as any)?.error || "No se pudo actualizar stock"));
        return;
      }
      toast.success("Stock actualizado");
      setEditingStockId(null);
      setStockDraft("");
      setRefreshKey((v) => v + 1);
    } catch (e: any) {
      toast.error(String(e?.message || "No se pudo actualizar stock"));
    } finally {
      setSavingStockId(null);
    }
  };

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className={statCardClass}>
          <div className="text-xs text-slate-500">Total</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{stats.total}</div>
        </div>
        <div className={statCardClass}>
          <div className="text-xs text-slate-500">Vendibles</div>
          <div className="mt-1 text-2xl font-semibold text-emerald-700">{stats.vendibles}</div>
        </div>
        <div className={statCardClass}>
          <div className="text-xs text-slate-500">UND</div>
          <div className="mt-1 text-2xl font-semibold text-blue-700">{stats.und}</div>
        </div>
        <div className={statCardClass}>
          <div className="text-xs text-slate-500">METROS</div>
          <div className="mt-1 text-2xl font-semibold text-indigo-700">{stats.metros}</div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Filtros</h2>
          <button
            type="button"
            onClick={() => {
              setQ("");
              setUnidadTipo("");
              setArea("");
              setVendible("");
            }}
            disabled={!hasFilters}
            className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 dark:text-slate-200 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Limpiar filtros
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código o nombre" className={fieldClass} />
          <select value={unidadTipo} onChange={(e) => setUnidadTipo(e.target.value)} className={fieldClass}>
            <option value="">Unidad: todas</option>
            <option value="UND">UND</option>
            <option value="METROS">METROS</option>
          </select>
          <select value={area} onChange={(e) => setArea(e.target.value)} className={fieldClass}>
            <option value="">Area: todas</option>
            <option value="INSTALACIONES">INSTALACIONES</option>
            <option value="MANTENIMIENTO">MANTENIMIENTO</option>
          </select>
          <select value={vendible} onChange={(e) => setVendible(e.target.value)} className={fieldClass}>
            <option value="">Vendible: todos</option>
            <option value="true">Si</option>
            <option value="false">No</option>
          </select>
        </div>
        {pending && <div className="mt-2 text-xs text-slate-500">Actualizando listado...</div>}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800">
              <tr className="text-slate-700 dark:text-slate-200">
                <th className="px-3 py-2 text-left font-semibold">Nombre</th>
                <th className="px-3 py-2 text-left font-semibold">Stock actual</th>
                <th className="px-3 py-2 text-left font-semibold">Unidad</th>
                <th className="px-3 py-2 text-left font-semibold">Vendible</th>
                <th className="px-3 py-2 text-left font-semibold">Areas</th>
                <th className="px-3 py-2 text-left font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m: any) => (
                <tr key={m.id} className="border-t border-slate-100 odd:bg-white even:bg-slate-50/50 dark:odd:bg-slate-900 dark:even:bg-slate-800/50">
                  <td className="px-3 py-2">{m.nombre}</td>
                  <td className="px-3 py-2">
                    {editingStockId === m.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          value={stockDraft}
                          onChange={(e) => setStockDraft(e.target.value)}
                          className={stockFieldClass}
                          inputMode="decimal"
                          placeholder="unidades"
                        />
                        <button
                          type="button"
                          onClick={() => saveStock(m)}
                          disabled={savingStockId === m.id}
                          className="inline-flex h-8 items-center rounded-md bg-emerald-600 px-2 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {savingStockId === m.id ? "Guardando..." : "Guardar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingStockId(null);
                            setStockDraft("");
                          }}
                          disabled={savingStockId === m.id}
                          className="inline-flex h-8 items-center rounded-md border border-slate-300 px-2 text-xs transition hover:bg-slate-100 disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <span className="font-medium">{formatStock(m)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{formatUnidad(m)}</td>
                  <td className="px-3 py-2">{m.vendible ? "Si" : "No"}</td>
                  <td className="px-3 py-2">{(m.areas || []).join(", ")}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {editingStockId !== m.id && (
                        <button
                          type="button"
                          onClick={() => editStock(m)}
                          className="inline-flex h-8 items-center rounded-lg border border-slate-300 px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Editar stock
                        </button>
                      )}
                      <a className="inline-flex h-8 items-center rounded-lg bg-blue-600 px-3 text-xs font-medium text-white transition hover:bg-blue-700" href={`/home/materiales/${m.id}`}>
                        Editar
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
              {!items.length && !pending && (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-500">
                    No hay materiales para los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}



