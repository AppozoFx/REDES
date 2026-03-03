"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { usePredespachoAiRecommendation } from "./usePredespachoAiRecommendation";

const EQUIPOS = ["ONT", "MESH", "FONO", "BOX"] as const;
const PRECONS = ["PRECON_50", "PRECON_100", "PRECON_150", "PRECON_200"] as const;
type Eq = (typeof EQUIPOS)[number];
type PreconId = (typeof PRECONS)[number];
type Counts = Record<Eq, number>;
type PreconCounts = Record<PreconId, number>;
type Scope = "all" | "coordinador" | "tecnico";
type EstadoFiltro = "todas" | "guardadas" | "pendientes" | "lote";
type ModeloFiltro = "all" | "huawei" | "zte";
type GrupoDespachoFiltro = "all" | "huawei" | "zte";
type PredespachoMode = "weekly" | "coordinator" | "squad" | "urgent";
type ModelGroup = "HUAWEI" | "ZTE" | "NEUTRO";
type ModelCounts = {
  ONT_HUAWEI: number;
  ONT_ZTE: number;
  MESH_HUAWEI: number;
  MESH_ZTE: number;
  FONO: number;
  BOX: number;
};

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
function emptyModelCounts(): ModelCounts {
  return { ONT_HUAWEI: 0, ONT_ZTE: 0, MESH_HUAWEI: 0, MESH_ZTE: 0, FONO: 0, BOX: 0 };
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
  const [modeloFiltro, setModeloFiltro] = useState<ModeloFiltro>("all");
  const [grupoDespacho, setGrupoDespacho] = useState<GrupoDespachoFiltro>("all");
  const [predespachoMode, setPredespachoMode] = useState<PredespachoMode>("weekly");
  const [modeConfirmed, setModeConfirmed] = useState(false);

  const [stockAlmacen, setStockAlmacen] = useState<Counts>(emptyCounts());
  const [stockAlmacenModel, setStockAlmacenModel] = useState<ModelCounts>(emptyModelCounts());
  const [stockPrecon, setStockPrecon] = useState<PreconCounts>(emptyPrecon());
  const [stockCuadrilla, setStockCuadrilla] = useState<Record<string, Counts>>({});
  const [stockCuadrillaModel, setStockCuadrillaModel] = useState<Record<string, ModelCounts>>({});
  const [cuadrillaModelGroup, setCuadrillaModelGroup] = useState<Record<string, ModelGroup>>({});
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
  const readOnly = scope !== "all";
  const aiRecommendation = usePredespachoAiRecommendation();

  const modeLabel = useMemo(() => {
    if (predespachoMode === "weekly") return "Semanal general";
    if (predespachoMode === "coordinator") return "Por coordinador";
    if (predespachoMode === "squad") return "Por cuadrilla";
    return "Reposicion por falta de stock";
  }, [predespachoMode]);

  const aiStatusLabel = useMemo(() => {
    if (aiRecommendation.status === "ok") return "IA ACTIVA";
    if (aiRecommendation.status === "fallback") return "IA FALLBACK";
    if (aiRecommendation.status === "loading") return "IA ANALIZANDO";
    if (aiRecommendation.status === "denied") return "IA SIN ACCESO";
    return "MODO MANUAL";
  }, [aiRecommendation.status]);

  async function loadData(nextAnchor = anchor, nextModelo = modeloFiltro) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("anchor", nextAnchor);
      params.set("modelo", nextModelo);
      const res = await fetch(`/api/instalaciones/predespacho/dashboard?${params.toString()}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));

      setScope(body.scope || "all");
      setCuadrillas(Array.isArray(body.cuadrillas) ? body.cuadrillas : []);
      setCoordinadores(Array.isArray(body.coordinadores) ? body.coordinadores : []);
      setStockAlmacen(body.stockAlmacen || emptyCounts());
      setStockAlmacenModel({ ...emptyModelCounts(), ...(body.stockAlmacenModel || {}) });
      setStockPrecon({ ...emptyPrecon(), ...(body.stockPrecon || {}) });
      setStockCuadrilla(body.stockCuadrilla || {});
      setStockCuadrillaModel(body.stockCuadrillaModel || {});
      setCuadrillaModelGroup(body.cuadrillaModelGroup || {});
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
    loadData(anchor, modeloFiltro);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, modeloFiltro]);

  useEffect(() => {
    if (predespachoMode === "weekly") {
      setSelCoords([]);
      setTextoCuadrilla("");
      setCoordOpen(false);
      setCuadOpen(false);
      return;
    }
    if (predespachoMode === "coordinator") {
      setTextoCuadrilla("");
      if (scope === "all") setCoordOpen(true);
      return;
    }
    if (predespachoMode === "squad") {
      setSelCoords([]);
      setCoordOpen(false);
      setCuadOpen(true);
      return;
    }
    if (predespachoMode === "urgent") {
      if (scope === "all") setCoordOpen(true);
    }
  }, [predespachoMode, scope]);

  const baseRows = useMemo(() => {
    const txt = textoCuadrilla.trim().toLowerCase();
    let rows = [...cuadrillas];
    if (scope === "all" && selCoords.length) {
      const set = new Set(selCoords);
      rows = rows.filter((c) => set.has(String(c.coordinadorUid || c.coordinadorNombre || "")));
    }
    if (txt) rows = rows.filter((c) => `${c.nombre} ${c.id}`.toLowerCase().includes(txt));
    if (predespachoMode === "coordinator" && scope === "all" && !selCoords.length) return [];
    if (predespachoMode === "squad" && !txt) return [];
    if (predespachoMode === "urgent" && scope === "all" && !selCoords.length && !txt) return [];
    rows.sort((a, b) => String(a.coordinadorNombre || "").localeCompare(String(b.coordinadorNombre || ""), "es", { sensitivity: "base" }));
    return rows;
  }, [cuadrillas, scope, selCoords, textoCuadrilla, predespachoMode]);

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
    const rowsByGrupo = baseRows.filter((r) => {
      if (grupoDespacho === "all") return true;
      const grp = (cuadrillaModelGroup[r.id] || "NEUTRO").toUpperCase();
      if (grupoDespacho === "huawei") return grp === "HUAWEI";
      return grp === "ZTE";
    });
    return rowsByGrupo.filter((r) => {
      const saved = !!savedInfo[r.id]?.updatedAt;
      const batchId = savedInfo[r.id]?.saveBatchId || "";
      if (estadoFiltro === "guardadas") return saved;
      if (estadoFiltro === "pendientes") return !saved;
      if (estadoFiltro === "lote") return !!selectedBatch && batchId === selectedBatch;
      return true;
    });
  }, [baseRows, cuadrillaModelGroup, grupoDespacho, savedInfo, estadoFiltro, selectedBatch]);

  const uiRows = useMemo(() => {
    if (verOmitidas) return rowsByEstado;
    return rowsByEstado.filter((r) => !omitidas[r.id]);
  }, [rowsByEstado, verOmitidas, omitidas]);
  const totalRows = baseRows.length;
  const guardadasCount = baseRows.filter((r) => !!savedInfo[r.id]?.updatedAt).length;
  const pendientesCount = Math.max(0, totalRows - guardadasCount);
  const visiblesCount = uiRows.length;

  function stockForCuadrilla(cuadrillaId: string): Counts {
    const base = stockCuadrilla[cuadrillaId] || emptyCounts();
    if (grupoDespacho === "all") return base;
    const byModel = stockCuadrillaModel[cuadrillaId] || emptyModelCounts();
    if (grupoDespacho === "huawei") {
      return {
        ONT: n(byModel.ONT_HUAWEI),
        MESH: n(byModel.MESH_HUAWEI),
        FONO: n(base.FONO),
        BOX: n(base.BOX),
      };
    }
    return {
      ONT: n(byModel.ONT_ZTE),
      MESH: n(byModel.MESH_ZTE),
      FONO: n(base.FONO),
      BOX: n(base.BOX),
    };
  }

  const stockAlmacenActivo = useMemo<Counts>(() => {
    if (grupoDespacho === "huawei") {
      return {
        ONT: n(stockAlmacenModel.ONT_HUAWEI),
        MESH: n(stockAlmacenModel.MESH_HUAWEI),
        FONO: n(stockAlmacen.FONO),
        BOX: n(stockAlmacen.BOX),
      };
    }
    if (grupoDespacho === "zte") {
      return {
        ONT: n(stockAlmacenModel.ONT_ZTE),
        MESH: n(stockAlmacenModel.MESH_ZTE),
        FONO: n(stockAlmacen.FONO),
        BOX: n(stockAlmacen.BOX),
      };
    }
    return stockAlmacen;
  }, [grupoDespacho, stockAlmacen, stockAlmacenModel]);

  const sugerido = useMemo(() => {
    const out: Record<string, Counts> = {};
    const rowsForPlan = baseRows.filter((r) => {
      if (grupoDespacho === "all") return true;
      const grp = (cuadrillaModelGroup[r.id] || "NEUTRO").toUpperCase();
      if (grupoDespacho === "huawei") return grp === "HUAWEI";
      return grp === "ZTE";
    });
    for (const c of rowsForPlan) {
      const stock = stockForCuadrilla(c.id);
      // Base recomendada: objetivo operativo y consumo promedio del periodo.
      const prom = promedioCuadrilla[c.id] || emptyCounts();
      out[c.id] = {
        ONT: Math.max(0, Math.ceil(Math.max(n(objetivo.ONT), n(prom.ONT)) - n(stock.ONT))),
        MESH: Math.max(0, Math.ceil(Math.max(n(objetivo.MESH), n(prom.MESH)) - n(stock.MESH))),
        FONO: Math.max(0, Math.ceil(Math.max(n(objetivo.FONO), n(prom.FONO)) - n(stock.FONO))),
        BOX: Math.max(0, Math.ceil(Math.max(n(objetivo.BOX), n(prom.BOX)) - n(stock.BOX))),
      };
    }

    const activas = rowsForPlan.filter((c) => !omitidas[c.id]);
    for (const k of EQUIPOS) {
      const need = activas.reduce((acc, c) => acc + n(out[c.id]?.[k]), 0);
      const disp = n(stockAlmacenActivo[k]);
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
        if (out[c.id][k] < Math.max(0, n(objetivo[k]) - n(stockForCuadrilla(c.id)[k]))) {
          out[c.id][k] += 1;
          rem -= 1;
        }
      }
    }
    return out;
  }, [baseRows, cuadrillaModelGroup, grupoDespacho, promedioCuadrilla, objetivo, stockAlmacenActivo, omitidas, stockCuadrilla, stockCuadrillaModel]);

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

  const aiSummary = useMemo(() => {
    const recommendationTotal = aiRecommendation.data?.recommendation?.total || emptyCounts();
    const recommendationRows = Object.keys(aiRecommendation.data?.recommendation?.byCuadrilla || {}).length;
    const recommendationSource = aiRecommendation.data?.meta?.source || "manual";
    const recommendationModel = aiRecommendation.data?.meta?.model || "-";
    return {
      recommendationTotal,
      recommendationRows,
      recommendationSource,
      recommendationModel,
    };
  }, [aiRecommendation.data]);

  const modelUsageSummary = useMemo(() => {
    if (grupoDespacho === "huawei") {
      return {
        ont: `Huawei (${stockAlmacenModel.ONT_HUAWEI})`,
        mesh: `Huawei (${stockAlmacenModel.MESH_HUAWEI})`,
      };
    }
    if (grupoDespacho === "zte") {
      return {
        ont: `ZTE (${stockAlmacenModel.ONT_ZTE})`,
        mesh: `ZTE (${stockAlmacenModel.MESH_ZTE})`,
      };
    }
    return {
      ont: `Mixto H:${stockAlmacenModel.ONT_HUAWEI} / Z:${stockAlmacenModel.ONT_ZTE}`,
      mesh: `Mixto H:${stockAlmacenModel.MESH_HUAWEI} / Z:${stockAlmacenModel.MESH_ZTE}`,
    };
  }, [grupoDespacho, stockAlmacenModel]);

  function buildRowsForPersist(source: Cuadrilla[]) {
    return source.map((c) => {
      const stock = stockForCuadrilla(c.id);
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

  async function getAiSuggestion() {
    try {
      const rows = uiRows.map((c) => ({
        cuadrillaId: c.id,
        nombre: c.nombre || c.id,
        coordinadorUid: c.coordinadorUid || "",
        coordinadorNombre: c.coordinadorNombre || "",
        stock: stockForCuadrilla(c.id),
        consumo: consumoCuadrilla[c.id] || emptyCounts(),
        promedio: promedioCuadrilla[c.id] || emptyCounts(),
        omitida: !!omitidas[c.id],
      }));
      if (!rows.length) {
        toast.error("No hay filas visibles para sugerencia IA");
        return;
      }

      const result = await aiRecommendation.requestRecommendation({
        anchor,
        modelFilter: modeloFiltro,
        objetivo,
        stockAlmacen: stockAlmacenActivo,
        rows,
      });

      if (!result) {
        if (aiRecommendation.status === "denied") {
          toast.error("Sin permiso para sugerencia IA");
        } else {
          toast.error(aiRecommendation.error || "No se pudo obtener sugerencia IA");
        }
        return;
      }

      if (result.status === "fallback") {
        toast.message("Sugerencia IA en fallback deterministico");
      } else {
        toast.success("Sugerencia IA generada");
      }
    } catch (e: any) {
      toast.error(e?.message || "No se pudo obtener sugerencia IA");
    }
  }

  function applyAiSuggestion() {
    const byCuadrilla = aiRecommendation.data?.recommendation?.byCuadrilla || {};
    const ids = Object.keys(byCuadrilla);
    if (!ids.length) {
      toast.error("No hay sugerencia IA para aplicar");
      return;
    }

    setManual((prev) => {
      const next = { ...prev };
      for (const c of uiRows) {
        if (omitidas[c.id]) continue;
        const ai = byCuadrilla[c.id];
        if (!ai) continue;
        next[c.id] = {
          ...(next[c.id] || {}),
          ONT: n(ai.ONT),
          MESH: n(ai.MESH),
          FONO: n(ai.FONO),
          BOX: n(ai.BOX),
        };
      }
      return next;
    });
    toast.success("Sugerencia IA aplicada a valores manuales");
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
    <div className="space-y-5">
      <section className="rounded-2xl border border-cyan-200 bg-gradient-to-r from-cyan-50 via-white to-blue-50 dark:border-cyan-800 dark:from-cyan-950/30 dark:via-slate-900 dark:to-blue-950/30 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold tracking-wide text-cyan-700 dark:text-cyan-300">PREDESPACHO ASISTIDO</div>
            <div className="text-sm text-slate-700 dark:text-slate-200">Modo: {modeLabel} · Ventana: {periodLabel || "sin datos"}</div>
          </div>
          <div className={`rounded-full px-3 py-1 text-xs font-semibold ${
            aiRecommendation.status === "ok"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
              : aiRecommendation.status === "fallback"
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200"
                : aiRecommendation.status === "loading"
                  ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-200"
                  : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
          }`}>
            {aiStatusLabel}
          </div>
        </div>
      </section>

      {!modeConfirmed ? (
        <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-sm">
          <div className="mb-3">
            <h2 className="text-lg font-semibold">Elegir tipo de predespacho</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">Selecciona el escenario. La IA analizara consumo y stock para sugerir cantidades.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {[
              { id: "weekly", title: "Semanal general", desc: "Cubre cuadrillas en alcance para despacho semanal." },
              { id: "coordinator", title: "Por coordinador", desc: "Despacho dirigido para uno o varios coordinadores." },
              { id: "squad", title: "Por cuadrilla", desc: "Despacho puntual para cuadrilla especifica." },
              { id: "urgent", title: "Reposicion urgente", desc: "Reposicion por falta de stock sin romper balance." },
            ].map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => {
                  setPredespachoMode(mode.id as PredespachoMode);
                  setModeConfirmed(true);
                }}
                className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-cyan-300 hover:bg-cyan-50/60 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-cyan-700 dark:hover:bg-cyan-950/20"
              >
                <div className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{mode.title}</div>
                <div className="text-xs text-slate-600 dark:text-slate-300">{mode.desc}</div>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <>
      <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-sm">
        <div className="grid gap-2 md:grid-cols-4">
          {[
            { id: 1, label: "Elegir tipo", done: modeConfirmed },
            { id: 2, label: "Filtrar alcance", done: !!uiRows.length || !!selCoords.length || !!textoCuadrilla.trim() },
            { id: 3, label: "Sugerencia IA", done: aiRecommendation.status === "ok" || aiRecommendation.status === "fallback" },
            { id: 4, label: "Guardar despacho", done: !!selectedBatch },
          ].map((step) => (
            <div
              key={`step-${step.id}`}
              className={`rounded-xl border px-3 py-2 text-sm ${
                step.done
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
                  : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300"
              }`}
            >
              <div className="text-[11px] uppercase tracking-wide">Paso {step.id}</div>
              <div className="font-medium">{step.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-sm">
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-9">
          <div className="lg:col-span-1">
            <label className="mb-1 block text-xs text-slate-600 dark:text-slate-300">Fecha base</label>
            <input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} className="ui-input-inline w-full rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 py-2 text-sm" />
          </div>
          <div className="lg:col-span-2">
            <label className="mb-1 block text-xs text-slate-600 dark:text-slate-300">Buscar cuadrilla {predespachoMode === "squad" ? "(obligatorio)" : ""}</label>
            <div className="relative">
              <input
                value={textoCuadrilla}
                onChange={(e) => {
                  setTextoCuadrilla(e.target.value);
                  setCuadOpen(true);
                }}
                onFocus={() => setCuadOpen(true)}
                placeholder={predespachoMode === "squad" ? "Escribe nombre o codigo de cuadrilla" : "Nombre o codigo"}
                className="w-full rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 py-2 text-sm"
              />
              {cuadOpen && cuadrillaSuggestions.length > 0 && (
                <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-1 shadow-xl">
                  {cuadrillaSuggestions.map((c) => (
                    <button
                      key={`sug-${c.id}`}
                      type="button"
                      onClick={() => {
                        setTextoCuadrilla(c.nombre || c.id);
                        setCuadOpen(false);
                      }}
                      className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      {c.nombre || c.id}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {scope === "all" && (predespachoMode === "coordinator" || predespachoMode === "urgent") && (
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs text-slate-600 dark:text-slate-300">Coordinadores</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setCoordOpen((v) => !v)}
                  className="w-full rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 py-2 text-left text-sm"
                >
                  {selCoords.length ? `${selCoords.length} coordinadores seleccionados` : "Elegir coordinadores"}
                </button>
                {coordOpen && (
                  <div className="absolute z-30 mt-1 w-full rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-2 shadow-xl">
                    <input
                      value={coordQuery}
                      onChange={(e) => setCoordQuery(e.target.value)}
                      placeholder="Buscar coordinador..."
                      className="mb-2 w-full rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-2 py-1 text-xs"
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
                      <button type="button" onClick={() => setSelCoords([])} className="rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-2 py-1 text-xs hover:bg-slate-50 dark:hover:bg-slate-800">
                        Limpiar
                      </button>
                      <button type="button" onClick={() => setCoordOpen(false)} className="rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-2 py-1 text-xs hover:bg-slate-50 dark:hover:bg-slate-800">
                        Cerrar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="lg:col-span-1">
            <label className="mb-1 block text-xs text-slate-600 dark:text-slate-300">Estado</label>
            <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value as EstadoFiltro)} className="ui-select-inline w-full rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 py-2 text-sm">
              <option value="todas">Todas</option>
              <option value="guardadas">Guardadas</option>
              <option value="pendientes">Pendientes</option>
              <option value="lote">Por lote</option>
            </select>
          </div>
          <div className="lg:col-span-1">
            <label className="mb-1 block text-xs text-slate-600 dark:text-slate-300">Modelo (ONT/MESH)</label>
            <select value={modeloFiltro} onChange={(e) => setModeloFiltro(e.target.value as ModeloFiltro)} className="ui-select-inline w-full rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 py-2 text-sm">
              <option value="all">Todos</option>
              <option value="huawei">Huawei</option>
              <option value="zte">ZTE</option>
            </select>
          </div>
          <div className="lg:col-span-1">
            <label className="mb-1 block text-xs text-slate-600 dark:text-slate-300">Grupo despacho</label>
            <select value={grupoDespacho} onChange={(e) => setGrupoDespacho(e.target.value as GrupoDespachoFiltro)} className="ui-select-inline w-full rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 py-2 text-sm">
              <option value="all">Todos</option>
              <option value="huawei">Huawei</option>
              <option value="zte">ZTE</option>
            </select>
          </div>
          <div className="lg:col-span-1">
            <label className="mb-1 block text-xs text-slate-600 dark:text-slate-300">Lote</label>
            <select value={selectedBatch} onChange={(e) => setSelectedBatch(e.target.value)} className="ui-select-inline w-full rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 py-2 text-sm" disabled={estadoFiltro !== "lote"}>
              <option value="">Seleccionar</option>
              {batchIds.map((b) => <option key={b} value={b}>{b.slice(0, 16).replace("T", " ")}</option>)}
            </select>
          </div>
          <div className="lg:col-span-1 flex items-end gap-2">
            <button type="button" onClick={() => loadData(anchor)} className="rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800" disabled={loading}>
              {loading ? "Cargando..." : "Actualizar"}
            </button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
          <span>Periodo consumo: {periodLabel}</span>
          <span>Scope: {scope}</span>
          <span>Modelo ONT/MESH: {modeloFiltro === "all" ? "Todos" : modeloFiltro === "huawei" ? "Huawei" : "ZTE"}</span>
          <span>Grupo despacho: {grupoDespacho === "all" ? "Todos" : grupoDespacho === "huawei" ? "Huawei" : "ZTE"}</span>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={verOmitidas} onChange={(e) => setVerOmitidas(e.target.checked)} />
            Ver omitidas
          </label>
          {aiRecommendation.status !== "idle" && (
            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5">
              IA: {aiRecommendation.status}
              {aiRecommendation.data?.meta?.model ? ` (${aiRecommendation.data.meta.model})` : ""}
            </span>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Resumen IA del escenario</div>
            <div className="text-xs text-slate-500">Fuente: {aiSummary.recommendationSource} · Modelo: {aiSummary.recommendationModel}</div>
          </div>
          <button
            type="button"
            onClick={() => setModeConfirmed(false)}
            className="rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Cambiar tipo de predespacho
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
            <div className="text-[11px] text-slate-500">Cuadrillas analizadas</div>
            <div className="text-lg font-semibold">{aiSummary.recommendationRows || visiblesCount}</div>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
            <div className="text-[11px] text-slate-500">Sugerido IA ONT/MESH</div>
            <div className="text-lg font-semibold">{aiSummary.recommendationTotal.ONT} / {aiSummary.recommendationTotal.MESH}</div>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
            <div className="text-[11px] text-slate-500">Pool ONT H/Z</div>
            <div className="text-lg font-semibold">{stockAlmacenModel.ONT_HUAWEI} / {stockAlmacenModel.ONT_ZTE}</div>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
            <div className="text-[11px] text-slate-500">Pool MESH H/Z</div>
            <div className="text-lg font-semibold">{stockAlmacenModel.MESH_HUAWEI} / {stockAlmacenModel.MESH_ZTE}</div>
          </div>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
            <div className="text-[11px] uppercase tracking-wide">Modelo ONT usado en analisis</div>
            <div className="font-semibold">{modelUsageSummary.ont}</div>
          </div>
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200">
            <div className="text-[11px] uppercase tracking-wide">Modelo MESH usado en analisis</div>
            <div className="font-semibold">{modelUsageSummary.mesh}</div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-sm">
          <div className="text-xs text-slate-500">Cuadrillas en alcance</div>
          <div className="text-2xl font-semibold">{totalRows}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-sm">
          <div className="text-xs text-slate-500">Guardadas</div>
          <div className="text-2xl font-semibold text-emerald-700">{guardadasCount}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-sm">
          <div className="text-xs text-slate-500">Pendientes</div>
          <div className="text-2xl font-semibold text-amber-700">{pendientesCount}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-sm">
          <div className="text-xs text-slate-500">Mostrando en tabla</div>
          <div className="text-2xl font-semibold">{visiblesCount}</div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {EQUIPOS.map((k) => (
          <div key={`alm-${k}`} className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-sm">
            <div className="text-xs uppercase text-slate-500">{k}</div>
            <div className="text-2xl font-semibold">{stockAlmacenActivo[k]}</div>
            <div className="text-xs text-slate-500">Stock almacen</div>
            {k === "ONT" && (
              <div className="text-[11px] text-slate-500">H:{stockAlmacenModel.ONT_HUAWEI} | Z:{stockAlmacenModel.ONT_ZTE}</div>
            )}
            {k === "MESH" && (
              <div className="text-[11px] text-slate-500">H:{stockAlmacenModel.MESH_HUAWEI} | Z:{stockAlmacenModel.MESH_ZTE}</div>
            )}
          </div>
        ))}
        {EQUIPOS.map((k) => (
          <div key={`con-${k}`} className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-sm">
            <div className="text-xs uppercase text-slate-500">{k}</div>
            <div className="text-xl font-semibold">{consumoTotal[k]}</div>
            <div className="text-xs text-slate-500">Total periodo</div>
            <div className="text-xs text-slate-400">Prom: {promedioTotal[k]}/dia</div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-sm">
        <div className="mb-2 text-sm font-semibold">Stock PRECON en almacen y asignacion</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {PRECONS.map((p) => (
            <div key={p} className="rounded-xl border border-slate-200 bg-slate-50 dark:bg-slate-800/60 p-3">
              <div className="text-xs text-slate-500">{p}</div>
              <div className="text-xl font-semibold">{stockPrecon[p]}</div>
              <div className="text-xs text-slate-500">Asignado: {totalPreconAsignado[p]}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-sm">
        <div className="mb-2 text-sm font-semibold">Objetivo operativo por cuadrilla</div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {EQUIPOS.map((k) => (
            <div key={`obj-${k}`}>
              <label className="mb-1 block text-xs text-slate-600 dark:text-slate-300">{k}</label>
              <input type="number" min={0} value={objetivo[k]} disabled={readOnly} onChange={(e) => setObjetivo((p) => ({ ...p, [k]: n(e.target.value) }))} className="ui-input-inline w-full rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 py-2 text-right text-sm" />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Predespacho por cuadrilla</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={getAiSuggestion}
              className="rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
              disabled={loading || aiRecommendation.loading || !uiRows.length}
            >
              {aiRecommendation.loading ? "Calculando IA..." : "Obtener sugerencia IA"}
            </button>
            {!readOnly && (
              <button
                type="button"
                onClick={applyAiSuggestion}
                className="rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                disabled={!aiRecommendation.data?.recommendation || aiRecommendation.loading || !uiRows.length}
              >
                Aplicar sugerencia IA
              </button>
            )}
            <button type="button" onClick={exportExcel} className="rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">Exportar Excel</button>
            <button type="button" onClick={exportPdf} className="rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">Exportar PDF</button>
            {!readOnly && (
              <button type="button" onClick={savePredespacho} className="rounded bg-[#30518c] px-3 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50" disabled={saving || loading || !uiRows.length}>
                {saving ? "Guardando..." : "Guardar filas visibles"}
              </button>
            )}
          </div>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
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
            <tbody className="text-slate-800 dark:text-slate-100">
              {!uiRows.length && <tr><td colSpan={12} className="p-4 text-center text-slate-500">Sin cuadrillas para mostrar.</td></tr>}
              {uiRows.map((c) => {
                const cons = consumoCuadrilla[c.id] || emptyCounts();
                const prom = promedioCuadrilla[c.id] || emptyCounts();
                const stock = stockForCuadrilla(c.id);
                const sug = sugerido[c.id] || emptyCounts();
                const aiSug = aiRecommendation.data?.recommendation?.byCuadrilla?.[c.id];
                const man = manual[c.id] || {};
                const hasManual = EQUIPOS.some((k) => Number.isFinite(Number(man[k])));
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
                      <div className="flex flex-wrap gap-1">
                        {EQUIPOS.map((k) => (
                          <span
                            key={`${c.id}-cons-${k}`}
                            className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-800 dark:bg-slate-700 dark:text-slate-100"
                          >
                            {k}: {cons[k]} | P:{prom[k]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-1">
                        {EQUIPOS.map((k) => (
                          <span
                            key={`${c.id}-stk-${k}`}
                            className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-800 dark:bg-slate-700 dark:text-slate-100"
                          >
                            {k}: {stock[k]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-1">
                        {EQUIPOS.map((k) => (
                          <div key={`${c.id}-sug-${k}`} className="flex gap-1">
                            <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
                              {k}: {sug[k]}
                            </span>
                            {aiSug ? (
                              <span className="rounded bg-violet-50 px-2 py-0.5 text-xs text-violet-700 dark:bg-violet-950/40 dark:text-violet-200">
                                IA: {n((aiSug as any)[k])}
                              </span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="p-2">
                      <div className="grid grid-cols-4 gap-1">
                        {EQUIPOS.map((k) => (
                          <input
                            key={`${c.id}-m-${k}`}
                            type="number"
                            min={0}
                            value={man[k] ?? ""}
                            placeholder={String(sug[k])}
                            disabled={readOnly}
                            onChange={(e) => setManual((p) => ({ ...p, [c.id]: { ...(p[c.id] || {}), [k]: e.target.value === "" ? undefined : n(e.target.value) } }))}
                            className="w-14 rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-1 py-1 text-right text-xs"
                          />
                        ))}
                      </div>
                    </td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-1">
                        {EQUIPOS.map((k) => (
                          <span
                            key={`${c.id}-fin-${k}`}
                            className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                          >
                            {k}: {final[k]}
                          </span>
                        ))}
                        {hasManual ? (
                          <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                            Ajuste manual
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="p-2">
                      <div className="grid grid-cols-2 gap-1">
                        {PRECONS.map((p) => (
                          <input
                            key={`${c.id}-${p}`}
                            type="number"
                            min={0}
                            value={preconAsignado[c.id]?.[p] ?? ""}
                            placeholder={p.replace("PRECON_", "")}
                            disabled={readOnly}
                            onChange={(e) => setPreconAsignado((prev) => ({ ...prev, [c.id]: { ...(prev[c.id] || {}), [p]: e.target.value === "" ? undefined : n(e.target.value) } }))}
                            className="w-16 rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-1 py-1 text-right text-xs"
                          />
                        ))}
                      </div>
                    </td>
                    <td className="p-2"><input type="checkbox" checked={!!omitidas[c.id]} disabled={readOnly} onChange={(e) => setOmitidas((p) => ({ ...p, [c.id]: e.target.checked }))} /></td>
                    <td className="p-2">
                      <input type="number" min={0} value={bobinaResi[c.id] ?? 0} disabled={readOnly} onChange={(e) => setBobinaResi((p) => ({ ...p, [c.id]: n(e.target.value) }))} className="ui-input-inline w-16 rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-2 py-1 text-right text-xs" />
                    </td>
                    <td className="p-2"><input type="checkbox" checked={!!rolloCondo[c.id]} disabled={readOnly} onChange={(e) => setRolloCondo((p) => ({ ...p, [c.id]: e.target.checked }))} /></td>
                    <td className="p-2 text-xs text-slate-600 dark:text-slate-300">
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

      <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Totales finales a despachar (filas activas)</div>
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          {EQUIPOS.map((k) => (
            <span
              key={`tot-${k}`}
              className="rounded-full bg-slate-100 px-3 py-1 text-slate-800 dark:bg-slate-800 dark:text-slate-100"
            >
              {k}: {totals.plan[k]}
            </span>
          ))}
        </div>
      </section>
      </>
      )}
    </div>
  );
}



