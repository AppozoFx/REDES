"use client";

import React from "react";
import { useActionState, useEffect, useMemo, useState, startTransition } from "react";
import { listMaterialesAction } from "./actions";

export default function ListClient() {
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [unidadTipo, setUnidadTipo] = useState<string>("");
  const [area, setArea] = useState<string>("");
  const [vendible, setVendible] = useState<string>("");
  const [data, run, pending] = useActionState(listMaterialesAction as any, { ok: true, items: [] } as any);

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
  }, [qDebounced, unidadTipo, area, vendible]);

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
    "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  const statCardClass = "rounded-xl border border-slate-200 bg-white p-3 shadow-sm";

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className={statCardClass}>
          <div className="text-xs text-slate-500">Total</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{stats.total}</div>
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

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Filtros</h2>
          <button
            type="button"
            onClick={() => {
              setQ("");
              setUnidadTipo("");
              setArea("");
              setVendible("");
            }}
            disabled={!hasFilters}
            className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
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
            <option value="AVERIAS">AVERIAS</option>
          </select>
          <select value={vendible} onChange={(e) => setVendible(e.target.value)} className={fieldClass}>
            <option value="">Vendible: todos</option>
            <option value="true">Si</option>
            <option value="false">No</option>
          </select>
        </div>
        {pending && <div className="mt-2 text-xs text-slate-500">Actualizando listado...</div>}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100">
              <tr className="text-slate-700">
                <th className="px-3 py-2 text-left font-semibold">Nombre</th>
                <th className="px-3 py-2 text-left font-semibold">Unidad</th>
                <th className="px-3 py-2 text-left font-semibold">Vendible</th>
                <th className="px-3 py-2 text-left font-semibold">Areas</th>
                <th className="px-3 py-2 text-left font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m: any) => (
                <tr key={m.id} className="border-t border-slate-100 odd:bg-white even:bg-slate-50/50">
                  <td className="px-3 py-2">{m.nombre}</td>
                  <td className="px-3 py-2">{m.unidadTipo}</td>
                  <td className="px-3 py-2">{m.vendible ? "Si" : "No"}</td>
                  <td className="px-3 py-2">{(m.areas || []).join(", ")}</td>
                  <td className="px-3 py-2">
                    <a className="inline-flex h-8 items-center rounded-lg bg-blue-600 px-3 text-xs font-medium text-white transition hover:bg-blue-700" href={`/home/materiales/${m.id}`}>
                      Editar
                    </a>
                  </td>
                </tr>
              ))}
              {!items.length && !pending && (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-sm text-slate-500">
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
