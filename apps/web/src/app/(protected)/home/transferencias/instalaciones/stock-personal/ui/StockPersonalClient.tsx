"use client";
import React, { useEffect, useState } from "react";

type ResumenPersona = {
  uid: string;
  nombre: string;
  conteoEquipos: Record<string, number>;
  totalEquipos: number;
  stockMateriales: { id: string; stockUnd?: number; stockCm?: number; unidadTipo?: string }[];
  series: { SN?: string; equipo?: string; guia_despacho?: string; f_despachoYmd?: string }[];
};

const TIPOS_EQUIPO = ["ONT", "MESH", "FONO", "BOX"] as const;

export default function StockPersonalClient() {
  const [data, setData] = useState<ResumenPersona[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/personal-stock/dashboard")
      .then(r => r.json())
      .then(d => {
        if (d.ok) setData(d.resumen || []);
        else setError(d.error || "Error");
      })
      .catch(() => setError("Error de red"))
      .finally(() => setLoading(false));
  }, []);

  const filtrado = data.filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()));

  const totalEquipos = data.reduce((a, p) => a + p.totalEquipos, 0);
  const totalPorTipo = TIPOS_EQUIPO.reduce<Record<string, number>>((acc, t) => {
    acc[t] = data.reduce((a, p) => a + (p.conteoEquipos[t] || 0), 0);
    return acc;
  }, {});

  if (loading) return <p className="text-sm text-slate-500 py-8 text-center">Cargando stock personal...</p>;
  if (error) return <p className="text-sm text-red-500 py-8 text-center">{error}</p>;
  if (!data.length) return <p className="text-sm text-slate-500 py-8 text-center">Sin stock personal registrado.</p>;

  return (
    <div className="space-y-4">
      {/* Resumen general */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center dark:border-slate-700 dark:bg-slate-800">
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{totalEquipos}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Total equipos</p>
        </div>
        {TIPOS_EQUIPO.map(t => (
          <div key={t} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center dark:border-slate-700 dark:bg-slate-800">
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{totalPorTipo[t] || 0}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t}</p>
          </div>
        ))}
      </div>

      <input
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        placeholder="Filtrar por nombre..."
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
      />

      <div className="space-y-2">
        {filtrado.map(persona => (
          <div key={persona.uid} className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <button
              className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors rounded-lg"
              onClick={() => setExpanded(expanded === persona.uid ? null : persona.uid)}
            >
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-slate-900 dark:text-slate-100">{persona.nombre}</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {TIPOS_EQUIPO.map(t => persona.conteoEquipos[t] ? (
                  <span key={t} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full dark:bg-blue-900 dark:text-blue-300">
                    {t}: {persona.conteoEquipos[t]}
                  </span>
                ) : null)}
                {persona.stockMateriales.some(m => (m.stockUnd || 0) > 0 || (m.stockCm || 0) > 0) && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full dark:bg-amber-900 dark:text-amber-300">MAT</span>
                )}
              </div>
              <span className="text-slate-400 text-xs">{expanded === persona.uid ? "▲" : "▼"}</span>
            </button>

            {expanded === persona.uid && (
              <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-3 space-y-3">
                {persona.series.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">EQUIPOS ({persona.series.length})</p>
                    <div className="max-h-48 overflow-y-auto rounded border border-slate-100 dark:border-slate-800">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                          <tr>
                            <th className="px-2 py-1.5 text-left text-slate-600 dark:text-slate-400">Tipo</th>
                            <th className="px-2 py-1.5 text-left text-slate-600 dark:text-slate-400">SN</th>
                            <th className="px-2 py-1.5 text-left text-slate-600 dark:text-slate-400">Guía</th>
                            <th className="px-2 py-1.5 text-left text-slate-600 dark:text-slate-400">Fecha</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                          {persona.series.map((s, i) => (
                            <tr key={i}>
                              <td className="px-2 py-1 font-semibold text-blue-600 dark:text-blue-400">{s.equipo || "—"}</td>
                              <td className="px-2 py-1 font-mono">{s.SN || "—"}</td>
                              <td className="px-2 py-1 text-slate-500">{s.guia_despacho || "—"}</td>
                              <td className="px-2 py-1 text-slate-500">{s.f_despachoYmd || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {persona.stockMateriales.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">MATERIALES</p>
                    <div className="flex flex-wrap gap-2">
                      {persona.stockMateriales
                        .filter(m => (m.stockUnd || 0) > 0 || (m.stockCm || 0) > 0)
                        .map(m => (
                          <span key={m.id} className="text-xs bg-amber-50 text-amber-800 border border-amber-200 px-2 py-1 rounded-lg dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800">
                            {m.id.replaceAll("_", " ")}: {m.unidadTipo === "METROS" ? `${((m.stockCm || 0) / 100).toFixed(1)}m` : `${m.stockUnd || 0}`}
                          </span>
                        ))}
                    </div>
                  </div>
                )}

                {persona.series.length === 0 && !persona.stockMateriales.some(m => (m.stockUnd || 0) > 0 || (m.stockCm || 0) > 0) && (
                  <p className="text-xs text-slate-400">Sin stock activo.</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
