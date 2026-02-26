"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { collection, onSnapshot, getFirestore } from "firebase/firestore";
import { getFirebaseApp } from "@/lib/firebase/client";

type Cuadrilla = {
  id: string;
  nombre?: string;
  estado?: string;
};

type StockItem = {
  id: string;
  nombre?: string;
  cantidad?: number;
  metros?: number;
  tipo?: string;
  fecha?: string;
  guia?: string;
};

type HistRow = {
  guia: string;
  fecha: string;
  cantidad: number;
  metros: number;
  unidad: string;
};

type StockResponse = {
  materiales?: StockItem[];
};

type CuadrillaDetalle = {
  id: string;
  nombre?: string;
  coordinadorNombre?: string;
  tecnicosNombres?: string[];
};

function normalizeStr(v: any) {
  return String(v || "").trim().toLowerCase();
}

function rankMatch(q: string, text: string) {
  if (!q) return 9999;
  if (text === q) return 0;
  if (text.startsWith(q)) return 1;
  const idx = text.indexOf(q);
  return idx >= 0 ? 2 + idx : 9999;
}

function fmtNumber(v: number) {
  return Number.isFinite(v) ? String(v) : "0";
}

let cachedDb: ReturnType<typeof getFirestore> | null = null;
function getDb() {
  if (typeof window === "undefined") return null;
  if (cachedDb) return cachedDb;
  const app = getFirebaseApp();
  cachedDb = getFirestore(app);
  return cachedDb;
}

export default function StockCuadrillasMantClient() {
  const searchWrapRef = useRef<HTMLDivElement | null>(null);
  const [cuadrillas, setCuadrillas] = useState<Cuadrilla[]>([]);
  const [loadingCuadrillas, setLoadingCuadrillas] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");
  const [stock, setStock] = useState<StockItem[]>([]);
  const [detalle, setDetalle] = useState<CuadrillaDetalle | null>(null);
  const [loadingStock, setLoadingStock] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [soloConStock, setSoloConStock] = useState(true);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const refreshTimerRef = useRef<any>(null);
  const [histOpen, setHistOpen] = useState(false);
  const [histLoading, setHistLoading] = useState(false);
  const [histMaterial, setHistMaterial] = useState<StockItem | null>(null);
  const [histRows, setHistRows] = useState<HistRow[]>([]);

  useEffect(() => {
    (async () => {
      setLoadingCuadrillas(true);
      try {
        const res = await fetch("/api/cuadrillas/list?area=MANTENIMIENTO", { cache: "no-store" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
        const items = Array.isArray(body.items) ? body.items : [];
        setCuadrillas(items);
      } catch (e: any) {
        toast.error(e?.message || "No se pudo cargar cuadrillas");
      } finally {
        setLoadingCuadrillas(false);
      }
    })();
  }, []);

  async function cargarStock(id: string) {
    if (!id) return;
    setLoadingStock(true);
    try {
      const res = await fetch(`/api/mantenimiento/cuadrillas/stock-materiales?cuadrillaId=${encodeURIComponent(id)}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      const mats = (body?.materiales as StockResponse)?.materiales || body?.materiales || [];
      setStock(Array.isArray(mats) ? mats : []);
      setDetalle(body?.cuadrilla || null);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo cargar stock");
      setStock([]);
      setDetalle(null);
    } finally {
      setLoadingStock(false);
    }
  }

  useEffect(() => {
    if (!selectedId) return;
    const db = getDb();
    if (!db) return;
    const col = collection(db, "cuadrillas", selectedId, "stock");
    const unsub = onSnapshot(col, () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        cargarStock(selectedId);
      }, 350);
    });
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      unsub();
    };
  }, [selectedId]);

  async function cargarHistorial(material: StockItem) {
    if (!selectedId || !material?.id) return;
    setHistLoading(true);
    try {
      const res = await fetch(
        `/api/mantenimiento/cuadrillas/stock-materiales-history?cuadrillaId=${encodeURIComponent(selectedId)}&materialId=${encodeURIComponent(material.id)}`,
        { cache: "no-store" }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      const rows = Array.isArray(body.items) ? body.items : [];
      setHistRows(rows);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo cargar historial");
      setHistRows([]);
    } finally {
      setHistLoading(false);
    }
  }

  const selectedName = useMemo(() => {
    if (detalle?.nombre) return detalle.nombre;
    const c = cuadrillas.find((x) => x.id === selectedId);
    return c?.nombre || c?.id || "";
  }, [selectedId, cuadrillas, detalle]);

  const stockFiltrado = useMemo(() => {
    const q = normalizeStr(busqueda);
    let rows = stock.filter((it) => {
      if (!q) return true;
      return normalizeStr(it.nombre || it.id).includes(q) || normalizeStr(it.id).includes(q);
    });
    if (soloConStock) {
      rows = rows.filter((it) => {
        if ((it.tipo || "").toUpperCase() === "METROS") return Number(it.metros || 0) > 0;
        return Number(it.cantidad || 0) > 0;
      });
    }
    rows.sort((a, b) => String(a.nombre || a.id).localeCompare(String(b.nombre || b.id)));
    return rows;
  }, [stock, busqueda, soloConStock]);

  const sugerencias = useMemo(() => {
    const q = normalizeStr(busqueda);
    if (!q) return [];
    const scored = stock.map((it) => {
      const name = normalizeStr(it.nombre || it.id);
      const id = normalizeStr(it.id);
      const score = Math.min(rankMatch(q, name), rankMatch(q, id));
      return { it, score };
    }).filter((x) => x.score < 9999);
    scored.sort((a, b) => a.score - b.score || String(a.it.nombre || a.it.id).localeCompare(String(b.it.nombre || b.it.id)));
    return scored.slice(0, 8).map((x) => x.it);
  }, [stock, busqueda]);

  useEffect(() => {
    if (!showSuggestions) return;
    const onDown = (ev: MouseEvent) => {
      if (!searchWrapRef.current) return;
      if (!searchWrapRef.current.contains(ev.target as Node)) setShowSuggestions(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [showSuggestions]);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4">
        <div className="mb-2 text-sm font-semibold">Filtros</div>
        <div className="grid gap-2 md:grid-cols-3">
          <div ref={searchWrapRef} className="relative">
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (sugerencias.length === 1) {
                    setBusqueda(sugerencias[0]?.nombre || sugerencias[0]?.id || "");
                    setShowSuggestions(false);
                  }
                }
              }}
              placeholder="Buscar material"
              className="ui-input-inline w-full"
            />
            {showSuggestions && busqueda.trim() && sugerencias.length > 0 && (
              <div className="absolute z-20 mt-1 w-full max-h-44 overflow-auto rounded border border-slate-200 bg-white p-1 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900">
                {sugerencias.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => {
                      setBusqueda(it.nombre || it.id);
                      setShowSuggestions(false);
                    }}
                    className="w-full rounded px-2 py-1 text-left hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    {it.nombre || it.id}
                  </button>
                ))}
              </div>
            )}
          </div>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={soloConStock} onChange={(e) => setSoloConStock(e.target.checked)} />
            Solo con stock
          </label>
          <button
            type="button"
            onClick={() => {
              setBusqueda("");
              setSoloConStock(true);
            }}
            className="rounded border px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Limpiar filtros
          </button>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Cuadrillas</h2>
            {loadingCuadrillas && <span className="text-xs text-slate-500">Cargando...</span>}
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200">
                <tr className="text-left">
                  <th className="p-2">Nombre</th>
                  <th className="p-2">Estado</th>
                  <th className="p-2">Accion</th>
                </tr>
              </thead>
              <tbody>
                {cuadrillas.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="p-2 font-medium">{c.nombre || c.id}</td>
                    <td className="p-2">{c.estado || "-"}</td>
                    <td className="p-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(c.id);
                          cargarStock(c.id);
                        }}
                        className="rounded border px-2 py-1 text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        Ver stock
                      </button>
                    </td>
                  </tr>
                ))}
                {!loadingCuadrillas && cuadrillas.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-slate-500">
                      Sin cuadrillas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Stock</h2>
            {selectedName ? (
              <span className="text-xs text-slate-500">Cuadrilla: {selectedName}</span>
            ) : null}
          </div>
          {loadingStock && <div className="text-sm text-slate-500">Cargando stock...</div>}
          {!loadingStock && !selectedId && (
            <div className="text-sm text-slate-500">Selecciona una cuadrilla para ver su stock.</div>
          )}
          {!loadingStock && selectedId && (
            <div className="overflow-auto">
              <div className="mb-2 text-xs text-slate-500">
                Coordinador: {detalle?.coordinadorNombre || "-"} | Tecnicos: {(detalle?.tecnicosNombres || []).join(", ") || "-"}
              </div>
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200">
                  <tr className="text-left">
                    <th className="p-2">Material</th>
                    <th className="p-2">Unidad</th>
                    <th className="p-2 text-right">Cantidad</th>
                    <th className="p-2">Fecha despacho</th>
                    <th className="p-2">Guia</th>
                    <th className="p-2">Historial</th>
                  </tr>
                </thead>
                <tbody>
                  {stockFiltrado.map((it) => {
                    const unidad = String(it.tipo || "UND").toUpperCase();
                    const cantidad = unidad === "METROS" ? Number(it.metros || 0) : Number(it.cantidad || 0);
                    return (
                      <tr key={it.id} className="border-t">
                        <td className="p-2">{it.nombre || it.id}</td>
                        <td className="p-2">{unidad}</td>
                        <td className="p-2 text-right">{fmtNumber(cantidad)}</td>
                        <td className="p-2">{it.fecha || "-"}</td>
                        <td className="p-2">
                          {it.guia ? (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const res = await fetch(
                                    `/api/transferencias/mantenimiento/guia/url?guiaId=${encodeURIComponent(it.guia || "")}&tipo=despacho`,
                                    { cache: "no-store" }
                                  );
                                  const body = await res.json().catch(() => ({}));
                                  if (!res.ok || !body?.ok || !body?.url) throw new Error("NO_URL");
                                  const w = window.open(String(body.url), "_blank");
                                  if (w) w.opener = null;
                                } catch {
                                  toast.error("No se encontro PDF para esa guia");
                                }
                              }}
                              className="text-blue-700 hover:underline"
                            >
                              {it.guia}
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="p-2">
                          <button
                            type="button"
                            onClick={() => {
                              setHistMaterial(it);
                              setHistOpen(true);
                              cargarHistorial(it);
                            }}
                            className="text-blue-700 hover:underline"
                          >
                            Ver
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!stockFiltrado.length && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-slate-500">
                        Sin materiales para mostrar.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {histOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => {
            setHistOpen(false);
            setHistRows([]);
          }}
        >
          <div
            className="w-full max-w-2xl rounded-xl bg-white shadow-xl overflow-hidden dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between dark:border-slate-700">
              <div className="font-semibold">
                Historial - {histMaterial?.nombre || histMaterial?.id || ""}
              </div>
              <button
                type="button"
                onClick={() => {
                  setHistOpen(false);
                  setHistRows([]);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                X
              </button>
            </div>
            <div className="p-4">
              {histLoading && <div className="text-sm text-slate-500">Cargando historial...</div>}
              {!histLoading && (
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200">
                      <tr className="text-left">
                        <th className="p-2">Fecha</th>
                        <th className="p-2">Guia</th>
                        <th className="p-2 text-right">Cantidad</th>
                        <th className="p-2">Unidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {histRows.map((r, idx) => (
                        <tr key={`${r.guia}-${idx}`} className="border-t">
                          <td className="p-2">{r.fecha || "-"}</td>
                          <td className="p-2">
                            {r.guia ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    const res = await fetch(
                                      `/api/transferencias/mantenimiento/guia/url?guiaId=${encodeURIComponent(r.guia || "")}&tipo=despacho`,
                                      { cache: "no-store" }
                                    );
                                    const body = await res.json().catch(() => ({}));
                                    if (!res.ok || !body?.ok || !body?.url) throw new Error("NO_URL");
                                    const w = window.open(String(body.url), "_blank");
                                    if (w) w.opener = null;
                                  } catch {
                                    toast.error("No se encontro PDF para esa guia");
                                  }
                                }}
                                className="text-blue-700 hover:underline"
                              >
                                {r.guia}
                              </button>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="p-2 text-right">
                            {r.unidad === "METROS" ? fmtNumber(r.metros) : fmtNumber(r.cantidad)}
                          </td>
                          <td className="p-2">{r.unidad || "UND"}</td>
                        </tr>
                      ))}
                      {!histRows.length && (
                        <tr>
                          <td colSpan={4} className="p-4 text-center text-slate-500">
                            Sin historial.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-end dark:border-slate-700">
              <button
                type="button"
                onClick={() => {
                  setHistOpen(false);
                  setHistRows([]);
                }}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
