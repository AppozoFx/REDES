"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const EQUIPOS = ["ONT", "MESH", "FONO", "BOX"] as const;
const PRECONS = ["PRECON_50", "PRECON_100", "PRECON_150", "PRECON_200"] as const;
type Eq = (typeof EQUIPOS)[number];
type PreconId = (typeof PRECONS)[number];
type Counts = Record<Eq, number>;
type PreconCounts = Record<PreconId, number>;
type Scope = "all" | "coordinador" | "tecnico";
type EstadoFiltro = "todas" | "guardadas" | "pendientes" | "lote";

type Cuadrilla = {
  id: string;
  nombre: string;
  tipo?: string;
  coordinadorUid?: string;
  coordinadorNombre?: string;
};

function emptyCounts(): Counts {
  return { ONT: 0, MESH: 0, FONO: 0, BOX: 0 };
}
function emptyPrecon(): PreconCounts {
  return { PRECON_50: 0, PRECON_100: 0, PRECON_150: 0, PRECON_200: 0 };
}
function n(v: any) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
function sumCounts(a: Counts, b: Counts): Counts {
  return {
    ONT: n(a.ONT) + n(b.ONT),
    MESH: n(a.MESH) + n(b.MESH),
    FONO: n(a.FONO) + n(b.FONO),
    BOX: n(a.BOX) + n(b.BOX),
  };
}
function asDateInput() {
  return new Date().toISOString().slice(0, 10);
}

export default function PredespachoClient() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState<Scope>("all");
  const [anchor, setAnchor] = useState(asDateInput());
  const [periodLabel, setPeriodLabel] = useState("");

  const [cuadrillas, setCuadrillas] = useState<Cuadrilla[]>([]);
  const [coordinadores, setCoordinadores] = useState<Array<{ id: string; nombre: string }>>([]);
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [selectedBatch, setSelectedBatch] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>("todas");

  const [stockAlmacen, setStockAlmacen] = useState<Counts>(emptyCounts());
  const [stockPrecon, setStockPrecon] = useState<PreconCounts>(emptyPrecon());
  const [stockCuadrilla, setStockCuadrilla] = useState<Record<string, Counts>>({});
  const [consumoCuadrilla, setConsumoCuadrilla] = useState<Record<string, Counts>>({});
  const [promedioCuadrilla, setPromedioCuadrilla] = useState<Record<string, Counts>>({});
  const [consumoTotal, setConsumoTotal] = useState<Counts>(emptyCounts());
  const [promedioTotal, setPromedioTotal] = useState<Counts>(emptyCounts());

  const [objetivo, setObjetivo] = useState<Counts>({ ONT: 15, MESH: 5, FONO: 2, BOX: 1 });
  const [manual, setManual] = useState<Record<string, Partial<Counts>>>({});
  const [omitidas, setOmitidas] = useState<Record<string, boolean>>({});
  const [bobinaResi, setBobinaResi] = useState<Record<string, number>>({});
  const [rolloCondo, setRolloCondo] = useState<Record<string, boolean>>({});
  const [preconAsignado, setPreconAsignado] = useState<Record<string, Partial<PreconCounts>>>({});
  const [savedInfo, setSavedInfo] = useState<Record<string, { updatedByName?: string; updatedAt?: string; saveBatchId?: string }>>({});

  const [textoCuadrilla, setTextoCuadrilla] = useState("");
  const [selCoords, setSelCoords] = useState<string[]>([]);
  const [verOmitidas, setVerOmitidas] = useState(false);
  const [coordOpen, setCoordOpen] = useState(false);
  const [coordQuery, setCoordQuery] = useState("");
  const [cuadOpen, setCuadOpen] = useState(false);

  async function loadData(nextAnchor = anchor) {
    setLoading(true);
    try {
      const res = await fetch(`/api/instalaciones/predespacho/dashboard?anchor=${encodeURIComponent(nextAnchor)}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));

      setScope(body.scope || "all");
      setCuadrillas(Array.isArray(body.cuadrillas) ? body.cuadrillas : []);
      setCoordinadores(Array.isArray(body.coordinadores) ? body.coordinadores : []);
      setStockAlmacen(body.stockAlmacen || emptyCounts());
      setStockPrecon({ ...emptyPrecon(), ...(body.stockPrecon || {}) });
      setStockCuadrilla(body.stockCuadrilla || {});
      setConsumoCuadrilla(body.consumoPorCuadrilla || {});
      setPromedioCuadrilla(body.consumoPromedioPorCuadrilla || {});
      setConsumoTotal(body.consumoTotal || emptyCounts());
      setPromedioTotal(body.consumoPromedioTotal || emptyCounts());
      setPeriodLabel(`${body?.period?.startYmd || "-"} -> ${body?.period?.endYmd || "-"}`);
      setBatchIds(Array.isArray(body.batchIds) ? body.batchIds : []);

      const pre = body.predespacho || {};
      const nextManual: Record<string, Partial<Counts>> = {};
      const nextOmit: Record<string, boolean> = {};
      const nextBobina: Record<string, number> = {};
      const nextRollo: Record<string, boolean> = {};
      const nextPrecon: Record<string, Partial<PreconCounts>> = {};
      const nextSaved: Record<string, { updatedByName?: string; updatedAt?: string; saveBatchId?: string }> = {};
      for (const [cuId, row] of Object.entries<any>(pre)) {
        nextManual[cuId] = row?.manual || {};
        nextOmit[cuId] = !!row?.omitida;
        nextBobina[cuId] = n(row?.bobinaResi || 0);
        nextRollo[cuId] = !!row?.rolloCondo;
        nextPrecon[cuId] = row?.precon || {};
        nextSaved[cuId] = {
          updatedByName: row?.updatedByName || "",
          updatedAt: row?.updatedAt || "",
          saveBatchId: row?.saveBatchId || "",
        };
      }
      setManual(nextManual);
      setOmitidas(nextOmit);
      setBobinaResi(nextBobina);
      setRolloCondo(nextRollo);
      setPreconAsignado(nextPrecon);
      setSavedInfo(nextSaved);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo cargar predespacho");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData(anchor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const baseRows = useMemo(() => {
    const txt = textoCuadrilla.trim().toLowerCase();
    let rows = [...cuadrillas];
    if (scope === "all" && selCoords.length) {
      const set = new Set(selCoords);
      rows = rows.filter((c) => set.has(String(c.coordinadorUid || c.coordinadorNombre || "")));
    }
    if (txt) rows = rows.filter((c) => `${c.nombre} ${c.id}`.toLowerCase().includes(txt));
    rows.sort((a, b) => String(a.coordinadorNombre || "").localeCompare(String(b.coordinadorNombre || ""), "es", { sensitivity: "base" }));
    return rows;
  }, [cuadrillas, scope, selCoords, textoCuadrilla]);

  const filteredCoords = useMemo(() => {
    const q = coordQuery.trim().toLowerCase();
    if (!q) return coordinadores;
    return coordinadores.filter((c) => String(c.nombre || "").toLowerCase().includes(q));
  }, [coordinadores, coordQuery]);

  const cuadrillaSuggestions = useMemo(() => {
    const q = textoCuadrilla.trim().toLowerCase();
    if (!q) return [];
    return cuadrillas
      .filter((c) => `${c.nombre} ${c.id}`.toLowerCase().includes(q))
      .slice(0, 12);
  }, [textoCuadrilla, cuadrillas]);

  const rowsByEstado = useMemo(() => {
    return baseRows.filter((r) => {
      const saved = !!savedInfo[r.id]?.updatedAt;
      const batchId = savedInfo[r.id]?.saveBatchId || "";
      if (estadoFiltro === "guardadas") return saved;
      if (estadoFiltro === "pendientes") return !saved;
      if (estadoFiltro === "lote") return !!selectedBatch && batchId === selectedBatch;
      return true;
    });
  }, [baseRows, savedInfo, estadoFiltro, selectedBatch]);

  const uiRows = useMemo(() => {
    if (verOmitidas) return rowsByEstado;
    return rowsByEstado.filter((r) => !omitidas[r.id]);
  }, [rowsByEstado, verOmitidas, omitidas]);

  const sugerido = useMemo(() => {
    const out: Record<string, Counts> = {};
    for (const c of baseRows) {
      const stock = stockCuadrilla[c.id] || emptyCounts();
      // Base recomendada: objetivo operativo y consumo promedio del periodo.
      const prom = promedioCuadrilla[c.id] || emptyCounts();
      out[c.id] = {
        ONT: Math.max(0, Math.ceil(Math.max(n(objetivo.ONT), n(prom.ONT)) - n(stock.ONT))),
        MESH: Math.max(0, Math.ceil(Math.max(n(objetivo.MESH), n(prom.MESH)) - n(stock.MESH))),
        FONO: Math.max(0, Math.ceil(Math.max(n(objetivo.FONO), n(prom.FONO)) - n(stock.FONO))),
        BOX: Math.max(0, Math.ceil(Math.max(n(objetivo.BOX), n(prom.BOX)) - n(stock.BOX))),
      };
    }

    const activas = baseRows.filter((c) => !omitidas[c.id]);
    for (const k of EQUIPOS) {
      const need = activas.reduce((acc, c) => acc + n(out[c.id]?.[k]), 0);
      const disp = n(stockAlmacen[k]);
      if (!need || disp >= need) continue;
      let assigned = 0;
      for (const c of activas) {
        const ideal = n(out[c.id]?.[k]);
        const cuota = Math.floor((ideal / need) * disp);
        out[c.id][k] = cuota;
        assigned += cuota;
      }
      let rem = disp - assigned;
      for (const c of activas) {
        if (!rem) break;
        if (out[c.id][k] < Math.max(0, n(objetivo[k]) - n((stockCuadrilla[c.id] || emptyCounts())[k]))) {
          out[c.id][k] += 1;
          rem -= 1;
        }
      }
    }
    return out;
  }, [baseRows, stockCuadrilla, promedioCuadrilla, objetivo, stockAlmacen, omitidas]);

  const totalPreconAsignado = useMemo(() => {
    const t = emptyPrecon();
    for (const r of baseRows) {
      if (omitidas[r.id]) continue;
      for (const p of PRECONS) t[p] += n(preconAsignado[r.id]?.[p]);
    }
    return t;
  }, [baseRows, omitidas, preconAsignado]);

  const totals = useMemo(() => {
    let plan = emptyCounts();
    for (const c of baseRows) {
      if (omitidas[c.id]) continue;
      for (const k of EQUIPOS) {
        const mv = manual[c.id]?.[k];
        const final = Number.isFinite(Number(mv)) ? n(mv) : n(sugerido[c.id]?.[k]);
        plan[k] += final;
      }
    }
    return { plan };
  }, [baseRows, manual, sugerido, omitidas]);

  function buildRowsForPersist(source: Cuadrilla[]) {
    return source.map((c) => {
      const stock = stockCuadrilla[c.id] || emptyCounts();
      const consumo = consumoCuadrilla[c.id] || emptyCounts();
      const prom = promedioCuadrilla[c.id] || emptyCounts();
      const sug = sugerido[c.id] || emptyCounts();
      const man = manual[c.id] || {};
      const final: Counts = {
        ONT: Number.isFinite(Number(man.ONT)) ? n(man.ONT) : n(sug.ONT),
        MESH: Number.isFinite(Number(man.MESH)) ? n(man.MESH) : n(sug.MESH),
        FONO: Number.isFinite(Number(man.FONO)) ? n(man.FONO) : n(sug.FONO),
        BOX: Number.isFinite(Number(man.BOX)) ? n(man.BOX) : n(sug.BOX),
      };
      return {
        cuadrillaId: c.id,
        objetivo,
        stock,
        consumo,
        promedio: prom,
        sugerido: sug,
        manual: man,
        final,
        omitida: !!omitidas[c.id],
        bobinaResi: n(bobinaResi[c.id] || 0),
        rolloCondo: !!rolloCondo[c.id],
        precon: preconAsignado[c.id] || {},
      };
    });
  }

  async function savePredespacho() {
    setSaving(true);
    try {
      const batchId = new Date().toISOString();
      const rows = buildRowsForPersist(uiRows);
      if (!rows.length) throw new Error("NO_ROWS_TO_SAVE");
      const res = await fetch("/api/instalaciones/predespacho/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anchor, rows, batchId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      toast.success(`Predespacho guardado (${body.saved})`);
      setEstadoFiltro("lote");
      setSelectedBatch(String(body.batchId || batchId));
      await loadData(anchor);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo guardar predespacho");
    } finally {
      setSaving(false);
    }
  }

  function buildExportRows() {
    const rows = uiRows.filter((r) => !!savedInfo[r.id]?.updatedAt);
    return rows.map((c) => {
      const sug = sugerido[c.id] || emptyCounts();
      const man = manual[c.id] || {};
      const final: Counts = {
        ONT: Number.isFinite(Number(man.ONT)) ? n(man.ONT) : n(sug.ONT),
        MESH: Number.isFinite(Number(man.MESH)) ? n(man.MESH) : n(sug.MESH),
        FONO: Number.isFinite(Number(man.FONO)) ? n(man.FONO) : n(sug.FONO),
        BOX: Number.isFinite(Number(man.BOX)) ? n(man.BOX) : n(sug.BOX),
      };
      return {
        Coordinador: c.coordinadorNombre || "",
        Cuadrilla: c.nombre || c.id,
        Final_ONT: final.ONT,
        Final_MESH: final.MESH,
        Final_FONO: final.FONO,
        Final_BOX: final.BOX,
        PRECON_50: n(preconAsignado[c.id]?.PRECON_50),
        PRECON_100: n(preconAsignado[c.id]?.PRECON_100),
        PRECON_150: n(preconAsignado[c.id]?.PRECON_150),
        PRECON_200: n(preconAsignado[c.id]?.PRECON_200),
        Bobina_Resi: n(bobinaResi[c.id] || 0),
        Rollo_Condo: rolloCondo[c.id] ? "SI" : "NO",
        Guardado_por: savedInfo[c.id]?.updatedByName || "",
        Guardado_at: savedInfo[c.id]?.updatedAt || "",
        Lote: savedInfo[c.id]?.saveBatchId || "",
      };
    });
  }

  async function exportExcel() {
    const data = buildExportRows();
    if (!data.length) {
      toast.error("No hay filas guardadas para exportar con el filtro actual");
      return;
    }
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Predespacho");
    XLSX.writeFile(wb, `predespacho_${anchor}.xlsx`);
  }

  async function exportPdf() {
    const rows = uiRows.filter((r) => !!savedInfo[r.id]?.updatedAt);
    if (!rows.length) {
      toast.error("No hay filas guardadas para exportar con el filtro actual");
      return;
    }
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(11);
    doc.text(`Predespacho guardado - ${anchor}`, 10, 10);
    doc.setFontSize(8);
    let y = 18;
    const header = "Coordinador | Cuadrilla | ONT MESH FONO BOX | PRE50 PRE100 PRE150 PRE200 | Bobina | Rollo | Lote";
    doc.text(header, 10, y);
    y += 4;
    for (const c of rows) {
      const sug = sugerido[c.id] || emptyCounts();
      const man = manual[c.id] || {};
      const final: Counts = {
        ONT: Number.isFinite(Number(man.ONT)) ? n(man.ONT) : n(sug.ONT),
        MESH: Number.isFinite(Number(man.MESH)) ? n(man.MESH) : n(sug.MESH),
        FONO: Number.isFinite(Number(man.FONO)) ? n(man.FONO) : n(sug.FONO),
        BOX: Number.isFinite(Number(man.BOX)) ? n(man.BOX) : n(sug.BOX),
      };
      const line = [
        c.coordinadorNombre || "-",
        c.nombre || c.id,
        `${final.ONT}/${final.MESH}/${final.FONO}/${final.BOX}`,
        `${n(preconAsignado[c.id]?.PRECON_50)}/${n(preconAsignado[c.id]?.PRECON_100)}/${n(preconAsignado[c.id]?.PRECON_150)}/${n(preconAsignado[c.id]?.PRECON_200)}`,
        String(n(bobinaResi[c.id] || 0)),
        rolloCondo[c.id] ? "SI" : "NO",
        savedInfo[c.id]?.saveBatchId || "-",
      ].join(" | ");
      doc.text(line, 10, y);
      y += 4;
      if (y > 190) {
        doc.addPage();
        y = 12;
      }
    }
    doc.save(`predespacho_${anchor}.pdf`);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-white p-4">
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-8">
          <div className="lg:col-span-1">
            <label className="mb-1 block text-xs text-slate-600">Fecha base</label>
            <input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
          </div>
          <div className="lg:col-span-2">
            <label className="mb-1 block text-xs text-slate-600">Buscar cuadrilla</label>
            <div className="relative">
              <input
                value={textoCuadrilla}
                onChange={(e) => {
                  setTextoCuadrilla(e.target.value);
                  setCuadOpen(true);
                }}
                onFocus={() => setCuadOpen(true)}
                placeholder="Nombre o ID"
                className="w-full rounded border px-3 py-2 text-sm"
              />
              {cuadOpen && cuadrillaSuggestions.length > 0 && (
                <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded border bg-white p-1 shadow-xl">
                  {cuadrillaSuggestions.map((c) => (
                    <button
                      key={`sug-${c.id}`}
                      type="button"
                      onClick={() => {
                        setTextoCuadrilla(c.nombre || c.id);
                        setCuadOpen(false);
                      }}
                      className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-slate-50"
                    >
                      {c.nombre || c.id}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {scope === "all" && (
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs text-slate-600">Coordinadores</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setCoordOpen((v) => !v)}
                  className="w-full rounded border px-3 py-2 text-left text-sm"
                >
                  {selCoords.length ? `${selCoords.length} coordinadores seleccionados` : "Elegir coordinadores"}
                </button>
                {coordOpen && (
                  <div className="absolute z-30 mt-1 w-full rounded border bg-white p-2 shadow-xl">
                    <input
                      value={coordQuery}
                      onChange={(e) => setCoordQuery(e.target.value)}
                      placeholder="Buscar coordinador..."
                      className="mb-2 w-full rounded border px-2 py-1 text-xs"
                    />
                    <div className="max-h-56 overflow-auto">
                      {filteredCoords.map((c) => (
                        <label key={c.id} className="flex items-center gap-2 py-1 text-xs">
                          <input
                            type="checkbox"
                            checked={selCoords.includes(c.id)}
                            onChange={(e) => {
                              setSelCoords((prev) => {
                                if (e.target.checked) return Array.from(new Set([...prev, c.id]));
                                return prev.filter((x) => x !== c.id);
                              });
                            }}
                          />
                          <span>{c.nombre}</span>
                        </label>
                      ))}
                      {!filteredCoords.length && <div className="py-1 text-xs text-slate-500">Sin resultados</div>}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => setSelCoords([])} className="rounded border px-2 py-1 text-xs hover:bg-slate-50">
                        Limpiar
                      </button>
                      <button type="button" onClick={() => setCoordOpen(false)} className="rounded border px-2 py-1 text-xs hover:bg-slate-50">
                        Cerrar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="lg:col-span-1">
            <label className="mb-1 block text-xs text-slate-600">Estado</label>
            <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value as EstadoFiltro)} className="w-full rounded border px-3 py-2 text-sm">
              <option value="todas">Todas</option>
              <option value="guardadas">Guardadas</option>
              <option value="pendientes">Pendientes</option>
              <option value="lote">Por lote</option>
            </select>
          </div>
          <div className="lg:col-span-1">
            <label className="mb-1 block text-xs text-slate-600">Lote</label>
            <select value={selectedBatch} onChange={(e) => setSelectedBatch(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" disabled={estadoFiltro !== "lote"}>
              <option value="">Seleccionar</option>
              {batchIds.map((b) => <option key={b} value={b}>{b.slice(0, 16).replace("T", " ")}</option>)}
            </select>
          </div>
          <div className="lg:col-span-1 flex items-end gap-2">
            <button type="button" onClick={() => loadData(anchor)} className="rounded border px-3 py-2 text-sm hover:bg-slate-50" disabled={loading}>
              {loading ? "Cargando..." : "Actualizar"}
            </button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span>Periodo consumo: {periodLabel}</span>
          <span>Scope: {scope}</span>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={verOmitidas} onChange={(e) => setVerOmitidas(e.target.checked)} />
            Ver omitidas
          </label>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {EQUIPOS.map((k) => (
          <div key={`alm-${k}`} className="rounded-xl border bg-white p-4">
            <div className="text-xs uppercase text-slate-500">{k}</div>
            <div className="text-2xl font-semibold">{stockAlmacen[k]}</div>
            <div className="text-xs text-slate-500">Stock almacen</div>
          </div>
        ))}
        {EQUIPOS.map((k) => (
          <div key={`con-${k}`} className="rounded-xl border bg-white p-4">
            <div className="text-xs uppercase text-slate-500">{k}</div>
            <div className="text-xl font-semibold">{consumoTotal[k]}</div>
            <div className="text-xs text-slate-500">Total periodo</div>
            <div className="text-xs text-slate-400">Prom: {promedioTotal[k]}/dia</div>
          </div>
        ))}
      </section>

      <section className="rounded-xl border bg-white p-4">
        <div className="mb-2 text-sm font-semibold">Stock PRECON en almacen y asignacion</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {PRECONS.map((p) => (
            <div key={p} className="rounded border p-3">
              <div className="text-xs text-slate-500">{p}</div>
              <div className="text-xl font-semibold">{stockPrecon[p]}</div>
              <div className="text-xs text-slate-500">Asignado: {totalPreconAsignado[p]}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4">
        <div className="mb-2 text-sm font-semibold">Objetivo operativo por cuadrilla</div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {EQUIPOS.map((k) => (
            <div key={`obj-${k}`}>
              <label className="mb-1 block text-xs text-slate-600">{k}</label>
              <input type="number" min={0} value={objetivo[k]} onChange={(e) => setObjetivo((p) => ({ ...p, [k]: n(e.target.value) }))} className="w-full rounded border px-3 py-2 text-right text-sm" />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Predespacho por cuadrilla</h2>
          <div className="flex gap-2">
            <button type="button" onClick={exportExcel} className="rounded border px-3 py-2 text-sm hover:bg-slate-50">Exportar Excel</button>
            <button type="button" onClick={exportPdf} className="rounded border px-3 py-2 text-sm hover:bg-slate-50">Exportar PDF</button>
            <button type="button" onClick={savePredespacho} className="rounded bg-[#30518c] px-3 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50" disabled={saving || loading || !uiRows.length}>
              {saving ? "Guardando..." : "Guardar filas visibles"}
            </button>
          </div>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr className="text-left">
                <th className="p-2">Coordinador</th>
                <th className="p-2">Cuadrilla</th>
                <th className="p-2">Consumo / Promedio</th>
                <th className="p-2">Stock</th>
                <th className="p-2">Sugerido</th>
                <th className="p-2">Manual</th>
                <th className="p-2">Final</th>
                <th className="p-2">PRECON</th>
                <th className="p-2">Omitir</th>
                <th className="p-2">Resi</th>
                <th className="p-2">Condo</th>
                <th className="p-2">Guardado</th>
              </tr>
            </thead>
            <tbody>
              {!uiRows.length && <tr><td colSpan={12} className="p-4 text-center text-slate-500">Sin cuadrillas para mostrar.</td></tr>}
              {uiRows.map((c) => {
                const cons = consumoCuadrilla[c.id] || emptyCounts();
                const prom = promedioCuadrilla[c.id] || emptyCounts();
                const stock = stockCuadrilla[c.id] || emptyCounts();
                const sug = sugerido[c.id] || emptyCounts();
                const man = manual[c.id] || {};
                const final: Counts = {
                  ONT: Number.isFinite(Number(man.ONT)) ? n(man.ONT) : n(sug.ONT),
                  MESH: Number.isFinite(Number(man.MESH)) ? n(man.MESH) : n(sug.MESH),
                  FONO: Number.isFinite(Number(man.FONO)) ? n(man.FONO) : n(sug.FONO),
                  BOX: Number.isFinite(Number(man.BOX)) ? n(man.BOX) : n(sug.BOX),
                };
                return (
                  <tr key={c.id} className={`border-t ${omitidas[c.id] ? "opacity-60" : ""}`}>
                    <td className="p-2">{c.coordinadorNombre || "-"}</td>
                    <td className="p-2 font-medium">{c.nombre || c.id}</td>
                    <td className="p-2">
                      {EQUIPOS.map((k) => `${k}:${cons[k]} (P:${prom[k]})`).join(" | ")}
                    </td>
                    <td className="p-2">{EQUIPOS.map((k) => `${k}:${stock[k]}`).join(" | ")}</td>
                    <td className="p-2">{EQUIPOS.map((k) => `${k}:${sug[k]}`).join(" | ")}</td>
                    <td className="p-2">
                      <div className="grid grid-cols-4 gap-1">
                        {EQUIPOS.map((k) => (
                          <input
                            key={`${c.id}-m-${k}`}
                            type="number"
                            min={0}
                            value={man[k] ?? ""}
                            placeholder={String(sug[k])}
                            onChange={(e) => setManual((p) => ({ ...p, [c.id]: { ...(p[c.id] || {}), [k]: e.target.value === "" ? undefined : n(e.target.value) } }))}
                            className="w-14 rounded border px-1 py-1 text-right text-xs"
                          />
                        ))}
                      </div>
                    </td>
                    <td className="p-2">{EQUIPOS.map((k) => `${k}:${final[k]}`).join(" | ")}</td>
                    <td className="p-2">
                      <div className="grid grid-cols-2 gap-1">
                        {PRECONS.map((p) => (
                          <input
                            key={`${c.id}-${p}`}
                            type="number"
                            min={0}
                            value={preconAsignado[c.id]?.[p] ?? ""}
                            placeholder={p.replace("PRECON_", "")}
                            onChange={(e) => setPreconAsignado((prev) => ({ ...prev, [c.id]: { ...(prev[c.id] || {}), [p]: e.target.value === "" ? undefined : n(e.target.value) } }))}
                            className="w-16 rounded border px-1 py-1 text-right text-xs"
                          />
                        ))}
                      </div>
                    </td>
                    <td className="p-2"><input type="checkbox" checked={!!omitidas[c.id]} onChange={(e) => setOmitidas((p) => ({ ...p, [c.id]: e.target.checked }))} /></td>
                    <td className="p-2">
                      <input type="number" min={0} value={bobinaResi[c.id] ?? 0} onChange={(e) => setBobinaResi((p) => ({ ...p, [c.id]: n(e.target.value) }))} className="w-16 rounded border px-2 py-1 text-right text-xs" />
                    </td>
                    <td className="p-2"><input type="checkbox" checked={!!rolloCondo[c.id]} onChange={(e) => setRolloCondo((p) => ({ ...p, [c.id]: e.target.checked }))} /></td>
                    <td className="p-2 text-xs text-slate-600">
                      {savedInfo[c.id]?.updatedAt
                        ? `${savedInfo[c.id]?.updatedByName || "-"} | ${String(savedInfo[c.id]?.updatedAt).slice(0, 16).replace("T", " ")}`
                        : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4">
        <div className="text-sm font-semibold">Totales finales a despachar (filas activas)</div>
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          {EQUIPOS.map((k) => <span key={`tot-${k}`} className="rounded-full bg-slate-100 px-3 py-1">{k}: {totals.plan[k]}</span>)}
        </div>
      </section>
    </div>
  );
}
