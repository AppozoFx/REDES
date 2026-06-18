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
function emptyAvailability() {
  return { available: 0, planned: 0, remaining: 0, exceeded: false };
}
function emptyModelCounts(): ModelCounts {
  return { ONT_HUAWEI: 0, ONT_ZTE: 0, MESH_HUAWEI: 0, MESH_ZTE: 0, FONO: 0, BOX: 0 };
}
function n(v: any) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
function suggestedNeed(objetivoVal: number, consumoVal: number, promedioVal: number, stockVal: number) {
  const objetivo = n(objetivoVal);
  const consumo = n(consumoVal);
  const promedio = n(promedioVal);
  const stock = n(stockVal);
  const recentNeed = Math.max(consumo, promedio);
  // El objetivo es el piso de seguridad: si el consumo real supera el objetivo, despachar más.
  const targetLevel = Math.max(objetivo, recentNeed);
  return Math.max(0, Math.ceil(targetLevel - stock));
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

function critColorClass(crit: string) {
  if (crit === "critico") return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  if (crit === "bajo") return "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300";
  if (crit === "medio") return "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300";
  if (crit === "ok") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
  return "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400";
}

function critRowClass(crit?: string) {
  if (crit === "critico") return "bg-red-50/60 dark:bg-red-950/10";
  if (crit === "bajo") return "bg-orange-50/60 dark:bg-orange-950/10";
  return "";
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
  const [sortByCrit, setSortByCrit] = useState(true);
  const [showResources, setShowResources] = useState(false);
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

  async function loadData(nextAnchor = anchor, nextModelo = modeloFiltro, nextGrupo = grupoDespacho) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("anchor", nextAnchor);
      params.set("modelo", nextModelo);
      params.set("grupo", nextGrupo);
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
      const nextBatchIds = Array.isArray(body.batchIds) ? body.batchIds : [];
      setBatchIds(nextBatchIds);
      if (selectedBatch && !nextBatchIds.includes(selectedBatch)) {
        setSelectedBatch("");
        if (estadoFiltro === "lote") setEstadoFiltro("todas");
      }

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
    loadData(anchor, modeloFiltro, grupoDespacho);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, modeloFiltro, grupoDespacho]);

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

  useEffect(() => {
    if (scope === "coordinador") setModeConfirmed(true);
  }, [scope]);

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
    if (scope === "coordinador") rows = rows.filter((c) => !!savedInfo[c.id]?.updatedAt);
    rows.sort((a, b) => String(a.coordinadorNombre || "").localeCompare(String(b.coordinadorNombre || ""), "es", { sensitivity: "base" }));
    return rows;
  }, [cuadrillas, scope, selCoords, textoCuadrilla, predespachoMode, savedInfo]);

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
      // NEUTRO siempre incluida: cuadrillas sin modelo clasificado igual necesitan equipos
      if (grupoDespacho === "huawei") return grp === "HUAWEI" || grp === "NEUTRO";
      return grp === "ZTE" || grp === "NEUTRO";
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

  // Días de autonomía ONT por cuadrilla (stock actual / promedio diario ONT)
  const diasAutonomiaMap = useMemo(() => {
    const out: Record<string, { dias: number | null; criticidad: "critico" | "bajo" | "medio" | "ok" | "sin_datos" }> = {};
    for (const c of cuadrillas) {
      const base = stockCuadrilla[c.id] || emptyCounts();
      const byModel = stockCuadrillaModel[c.id] || emptyModelCounts();
      let stockONT: number;
      if (grupoDespacho === "huawei") stockONT = n(byModel.ONT_HUAWEI);
      else if (grupoDespacho === "zte") stockONT = n(byModel.ONT_ZTE);
      else stockONT = n(base.ONT);
      const promONT = (promedioCuadrilla[c.id] || emptyCounts()).ONT;
      const diasONT = promONT > 0 ? Math.floor(stockONT / promONT) : null;
      const criticidad =
        diasONT === null ? "sin_datos" :
        diasONT <= 0 ? "critico" :
        diasONT <= 2 ? "bajo" :
        diasONT <= 5 ? "medio" : "ok";
      out[c.id] = { dias: diasONT, criticidad };
    }
    return out;
  }, [cuadrillas, promedioCuadrilla, stockCuadrilla, stockCuadrillaModel, grupoDespacho]);

  // Filas ordenadas por criticidad para la tabla (critico → bajo → medio → ok → sin_datos)
  const sortedRows = useMemo(() => {
    if (!sortByCrit) return uiRows;
    const order: Record<string, number> = { critico: 0, bajo: 1, medio: 2, ok: 3, sin_datos: 4 };
    return [...uiRows].sort((a, b) => {
      const ca = order[diasAutonomiaMap[a.id]?.criticidad ?? "sin_datos"] ?? 4;
      const cb = order[diasAutonomiaMap[b.id]?.criticidad ?? "sin_datos"] ?? 4;
      if (ca !== cb) return ca - cb;
      return String(a.coordinadorNombre || "").localeCompare(String(b.coordinadorNombre || ""), "es", { sensitivity: "base" });
    });
  }, [uiRows, diasAutonomiaMap, sortByCrit]);

  // Estadísticas de cobertura global (sobre baseRows activas, no solo las visibles)
  const coverageStats = useMemo(() => {
    const stats = { critico: 0, bajo: 0, medio: 0, ok: 0, sin_datos: 0 };
    for (const c of baseRows) {
      if (omitidas[c.id]) continue;
      const crit = diasAutonomiaMap[c.id]?.criticidad ?? "sin_datos";
      stats[crit as keyof typeof stats]++;
    }
    return stats;
  }, [baseRows, omitidas, diasAutonomiaMap]);

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
      if (grupoDespacho === "huawei") return grp === "HUAWEI" || grp === "NEUTRO";
      return grp === "ZTE" || grp === "NEUTRO";
    });
    for (const c of rowsForPlan) {
      const stock = stockForCuadrilla(c.id);
      // Base recomendada: objetivo operativo y consumo promedio del periodo.
      const consumo = consumoCuadrilla[c.id] || emptyCounts();
      const prom = promedioCuadrilla[c.id] || emptyCounts();
      out[c.id] = {
        ONT: suggestedNeed(objetivo.ONT, consumo.ONT, prom.ONT, stock.ONT),
        MESH: suggestedNeed(objetivo.MESH, consumo.MESH, prom.MESH, stock.MESH),
        FONO: suggestedNeed(objetivo.FONO, consumo.FONO, prom.FONO, stock.FONO),
        BOX: suggestedNeed(objetivo.BOX, consumo.BOX, prom.BOX, stock.BOX),
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
      // Prioridad: cuadrillas con stock más bajo reciben primero las unidades restantes
      const activasPriority = [...activas].sort((a, b) => n(stockForCuadrilla(a.id)[k]) - n(stockForCuadrilla(b.id)[k]));
      for (const c of activasPriority) {
        if (!rem) break;
        const consumo = consumoCuadrilla[c.id] || emptyCounts();
        const prom = promedioCuadrilla[c.id] || emptyCounts();
        const stock = stockForCuadrilla(c.id);
        const desired = suggestedNeed(objetivo[k], consumo[k], prom[k], stock[k]);
        if (out[c.id][k] < desired) {
          out[c.id][k] += 1;
          rem -= 1;
        }
      }
    }
    return out;
  }, [baseRows, cuadrillaModelGroup, grupoDespacho, consumoCuadrilla, promedioCuadrilla, objetivo, stockAlmacenActivo, omitidas, stockCuadrilla, stockCuadrillaModel]);

  const totalPreconAsignado = useMemo(() => {
    const t = emptyPrecon();
    for (const r of uiRows) {
      if (omitidas[r.id]) continue;
      for (const p of PRECONS) t[p] += n(preconAsignado[r.id]?.[p]);
    }
    return t;
  }, [uiRows, omitidas, preconAsignado]);

  const totals = useMemo(() => {
    let plan = emptyCounts();
    for (const c of uiRows) {
      if (omitidas[c.id]) continue;
      for (const k of EQUIPOS) {
        const mv = manual[c.id]?.[k];
        const final = Number.isFinite(Number(mv)) ? n(mv) : n(sugerido[c.id]?.[k]);
        plan[k] += final;
      }
    }
    return { plan };
  }, [uiRows, manual, sugerido, omitidas]);

  const availability = useMemo(() => {
    const out: Record<Eq, { available: number; planned: number; remaining: number; exceeded: boolean }> = {
      ONT: emptyAvailability(),
      MESH: emptyAvailability(),
      FONO: emptyAvailability(),
      BOX: emptyAvailability(),
    };
    for (const k of EQUIPOS) {
      const available = n(stockAlmacenActivo[k]);
      const planned = n(totals.plan[k]);
      out[k] = {
        available,
        planned,
        remaining: available - planned,
        exceeded: planned > available,
      };
    }
    return out;
  }, [stockAlmacenActivo, totals.plan]);

  const preconAvailability = useMemo(() => {
    const out: Record<PreconId, { available: number; planned: number; remaining: number; exceeded: boolean }> = {
      PRECON_50: emptyAvailability(),
      PRECON_100: emptyAvailability(),
      PRECON_150: emptyAvailability(),
      PRECON_200: emptyAvailability(),
    };
    for (const p of PRECONS) {
      const available = n(stockPrecon[p]);
      const planned = n(totalPreconAsignado[p]);
      out[p] = {
        available,
        planned,
        remaining: available - planned,
        exceeded: planned > available,
      };
    }
    return out;
  }, [stockPrecon, totalPreconAsignado]);

  const exceededEquipos = useMemo(() => EQUIPOS.filter((k) => availability[k].exceeded), [availability]);
  const exceededPrecons = useMemo(() => PRECONS.filter((p) => preconAvailability[p].exceeded), [preconAvailability]);
  const hasAvailabilityIssues = exceededEquipos.length > 0 || exceededPrecons.length > 0;

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
        diasAutonomia: diasAutonomiaMap[c.id]?.dias ?? null,
        criticidad: diasAutonomiaMap[c.id]?.criticidad ?? "sin_datos",
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

  function applyAllSuggestions() {
    const activas = uiRows.filter((c) => !omitidas[c.id]);
    if (!activas.length) {
      toast.error("No hay filas activas para aplicar sugerencias");
      return;
    }
    setManual((prev) => {
      const next = { ...prev };
      for (const c of activas) {
        const sug = sugerido[c.id];
        if (!sug) continue;
        next[c.id] = { ONT: n(sug.ONT), MESH: n(sug.MESH), FONO: n(sug.FONO), BOX: n(sug.BOX) };
      }
      return next;
    });
    toast.success(`Sugerencias aplicadas a ${activas.length} cuadrillas`);
  }

  async function savePredespacho() {
    setSaving(true);
    try {
      const batchId = new Date().toISOString();
      const rows = buildRowsForPersist(uiRows);
      if (!rows.length) throw new Error("NO_ROWS_TO_SAVE");
      if (hasAvailabilityIssues) throw new Error("STOCK_INSUFFICIENT");
      const res = await fetch("/api/instalaciones/predespacho/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anchor,
          rows,
          batchId,
          dispatchGroup: grupoDespacho,
          availableStock: stockAlmacenActivo,
          availablePrecon: stockPrecon,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      toast.success(`Predespacho guardado (${body.saved})`);
      setEstadoFiltro("lote");
      setSelectedBatch(String(body.batchId || batchId));
      await loadData(anchor, modeloFiltro, grupoDespacho);
    } catch (e: any) {
      if (String(e?.message || "") === "STOCK_INSUFFICIENT") {
        toast.error("No puedes guardar un predespacho que excede el stock disponible");
      } else {
        toast.error(e?.message || "No se pudo guardar predespacho");
      }
    } finally {
      setSaving(false);
    }
  }

  function modelDispatchForRow(cuadrillaId: string) {
    if (grupoDespacho === "huawei") return "HUAWEI";
    if (grupoDespacho === "zte") return "ZTE";
    return (cuadrillaModelGroup[cuadrillaId] || "NEUTRO").toUpperCase();
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
      const modelDispatch = modelDispatchForRow(c.id);
      const finalOntHuawei = modelDispatch === "HUAWEI" ? final.ONT : 0;
      const finalOntZte = modelDispatch === "ZTE" ? final.ONT : 0;
      const finalMeshHuawei = modelDispatch === "HUAWEI" ? final.MESH : 0;
      const finalMeshZte = modelDispatch === "ZTE" ? final.MESH : 0;
      return {
        Modelo_Despacho: modelDispatch,
        Coordinador: c.coordinadorNombre || "",
        Cuadrilla: c.nombre || c.id,
        Final_ONT_Total: final.ONT,
        Final_ONT_Huawei: finalOntHuawei,
        Final_ONT_ZTE: finalOntZte,
        Final_MESH_Total: final.MESH,
        Final_MESH_Huawei: finalMeshHuawei,
        Final_MESH_ZTE: finalMeshZte,
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
      };
    });
  }

  function buildExportSummary(rows: ReturnType<typeof buildExportRows>) {
    return rows.reduce(
      (acc, row) => {
        acc.ontTotal += n(row.Final_ONT_Total);
        acc.ontHuawei += n(row.Final_ONT_Huawei);
        acc.ontZte += n(row.Final_ONT_ZTE);
        acc.meshTotal += n(row.Final_MESH_Total);
        acc.meshHuawei += n(row.Final_MESH_Huawei);
        acc.meshZte += n(row.Final_MESH_ZTE);
        acc.fono += n(row.Final_FONO);
        acc.box += n(row.Final_BOX);
        acc.pre50 += n(row.PRECON_50);
        acc.pre100 += n(row.PRECON_100);
        acc.pre150 += n(row.PRECON_150);
        acc.pre200 += n(row.PRECON_200);
        acc.bobina += n(row.Bobina_Resi);
        return acc;
      },
      {
        ontTotal: 0,
        ontHuawei: 0,
        ontZte: 0,
        meshTotal: 0,
        meshHuawei: 0,
        meshZte: 0,
        fono: 0,
        box: 0,
        pre50: 0,
        pre100: 0,
        pre150: 0,
        pre200: 0,
        bobina: 0,
      }
    );
  }

  async function exportExcel() {
    const data = buildExportRows();
    if (!data.length) {
      toast.error("No hay filas guardadas para exportar con el filtro actual");
      return;
    }
    const summary = buildExportSummary(data);
    const XLSX = await import("xlsx-js-style");
    const aoa: any[][] = [
      ["PREDESPACHO INSTALACIONES"],
      [`Fecha base: ${anchor}`, `Ventana: ${periodLabel || "-"}`, `Modo: ${modeLabel}`, `Grupo despacho: ${grupoDespacho.toUpperCase()}`],
      [`Cuadrillas exportadas: ${data.length}`, `ONT H/Z: ${summary.ontHuawei}/${summary.ontZte}`, `MESH H/Z: ${summary.meshHuawei}/${summary.meshZte}`, `FONO/BOX: ${summary.fono}/${summary.box}`],
      [],
      [
        "Modelo",
        "Coordinador",
        "Cuadrilla",
        "ONT Total",
        "ONT Huawei",
        "ONT ZTE",
        "MESH Total",
        "MESH Huawei",
        "MESH ZTE",
        "FONO",
        "BOX",
        "PRE 50",
        "PRE 100",
        "PRE 150",
        "PRE 200",
        "Bobina Resi",
        "Rollo Condo",
      ],
      ...data.map((row) => [
        row.Modelo_Despacho,
        row.Coordinador,
        row.Cuadrilla,
        row.Final_ONT_Total,
        row.Final_ONT_Huawei,
        row.Final_ONT_ZTE,
        row.Final_MESH_Total,
        row.Final_MESH_Huawei,
        row.Final_MESH_ZTE,
        row.Final_FONO,
        row.Final_BOX,
        row.PRECON_50,
        row.PRECON_100,
        row.PRECON_150,
        row.PRECON_200,
        row.Bobina_Resi,
        row.Rollo_Condo,
      ]),
      [
        "TOTALES",
        "",
        "",
        summary.ontTotal,
        summary.ontHuawei,
        summary.ontZte,
        summary.meshTotal,
        summary.meshHuawei,
        summary.meshZte,
        summary.fono,
        summary.box,
        summary.pre50,
        summary.pre100,
        summary.pre150,
        summary.pre200,
        summary.bobina,
        "",
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [
      { wch: 12 }, { wch: 20 }, { wch: 28 }, { wch: 10 }, { wch: 11 }, { wch: 9 },
      { wch: 11 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
      { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 11 }, { wch: 12 },
    ];
    ws["!freeze"] = { xSplit: 3, ySplit: 5 } as any;
    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
    const titleStyle = {
      font: { bold: true, sz: 15, color: { rgb: "0F172A" } },
      fill: { fgColor: { rgb: "DBEAFE" } },
      alignment: { horizontal: "center", vertical: "center" },
    };
    const metaStyle = {
      font: { sz: 10, color: { rgb: "334155" } },
      fill: { fgColor: { rgb: "F8FAFC" } },
    };
    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "30518C" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "CBD5E1" } },
        bottom: { style: "thin", color: { rgb: "CBD5E1" } },
        left: { style: "thin", color: { rgb: "CBD5E1" } },
        right: { style: "thin", color: { rgb: "CBD5E1" } },
      },
    };
    const bodyStyle = {
      border: {
        top: { style: "thin", color: { rgb: "E2E8F0" } },
        bottom: { style: "thin", color: { rgb: "E2E8F0" } },
        left: { style: "thin", color: { rgb: "E2E8F0" } },
        right: { style: "thin", color: { rgb: "E2E8F0" } },
      },
      alignment: { vertical: "center" },
    };
    const totalStyle = {
      font: { bold: true, color: { rgb: "0F172A" } },
      fill: { fgColor: { rgb: "DCFCE7" } },
      border: {
        top: { style: "thin", color: { rgb: "86EFAC" } },
        bottom: { style: "thin", color: { rgb: "86EFAC" } },
        left: { style: "thin", color: { rgb: "86EFAC" } },
        right: { style: "thin", color: { rgb: "86EFAC" } },
      },
    };
    ws["A1"].s = titleStyle as any;
    for (let c = 0; c <= range.e.c; c += 1) {
      const meta1 = XLSX.utils.encode_cell({ r: 1, c });
      const meta2 = XLSX.utils.encode_cell({ r: 2, c });
      const header = XLSX.utils.encode_cell({ r: 4, c });
      if (ws[meta1]) ws[meta1].s = metaStyle as any;
      if (ws[meta2]) ws[meta2].s = metaStyle as any;
      if (ws[header]) ws[header].s = headerStyle as any;
    }
    for (let r = 5; r <= range.e.r; r += 1) {
      for (let c = 0; c <= range.e.c; c += 1) {
        const cell = XLSX.utils.encode_cell({ r, c });
        if (!ws[cell]) continue;
        ws[cell].s = (r === range.e.r ? totalStyle : bodyStyle) as any;
      }
    }
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 19 } }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Predespacho");
    XLSX.writeFile(wb, `predespacho_${anchor}.xlsx`);
  }

  async function exportPdf() {
    const exportRows = buildExportRows();
    if (!exportRows.length) {
      toast.error("No hay filas guardadas para exportar con el filtro actual");
      return;
    }
    const summary = buildExportSummary(exportRows);
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = 297;
    const pageHeight = 210;
    const margin = 10;
    const columns = [
      { key: "Modelo_Despacho", label: "Modelo", width: 18 },
      { key: "Coordinador", label: "Coordinador", width: 35 },
      { key: "Cuadrilla", label: "Cuadrilla", width: 34 },
      { key: "Final_ONT_Huawei", label: "ONT H", width: 12 },
      { key: "Final_ONT_ZTE", label: "ONT Z", width: 12 },
      { key: "Final_MESH_Huawei", label: "MESH H", width: 14 },
      { key: "Final_MESH_ZTE", label: "MESH Z", width: 14 },
      { key: "Final_FONO", label: "FONO", width: 12 },
      { key: "Final_BOX", label: "BOX", width: 10 },
      { key: "PRECON_50", label: "P50", width: 12 },
      { key: "PRECON_100", label: "P100", width: 14 },
      { key: "PRECON_150", label: "P150", width: 14 },
      { key: "PRECON_200", label: "P200", width: 14 },
      { key: "Bobina_Resi", label: "Bobina", width: 12 },
      { key: "Rollo_Condo", label: "Condo", width: 12 },
    ] as const;
    const drawHeader = () => {
      doc.setFillColor(48, 81, 140);
      doc.rect(margin, 10, pageWidth - margin * 2, 10, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.text("PREDESPACHO INSTALACIONES", margin + 3, 16.5);
      doc.setTextColor(51, 65, 85);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text(`Fecha base: ${anchor}`, margin, 25);
      doc.text(`Ventana: ${periodLabel || "-"}`, margin + 45, 25);
      doc.text(`Modo: ${modeLabel}`, margin + 105, 25);
      doc.text(`Grupo despacho: ${grupoDespacho.toUpperCase()}`, margin + 165, 25);
      doc.text(`Filas: ${exportRows.length}`, margin + 245, 25);
      doc.setFillColor(239, 246, 255);
      doc.roundedRect(margin, 29, 62, 12, 2, 2, "F");
      doc.roundedRect(margin + 66, 29, 62, 12, 2, 2, "F");
      doc.roundedRect(margin + 132, 29, 62, 12, 2, 2, "F");
      doc.roundedRect(margin + 198, 29, 89, 12, 2, 2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(`ONT H/Z: ${summary.ontHuawei}/${summary.ontZte}`, margin + 3, 34);
      doc.text(`MESH H/Z: ${summary.meshHuawei}/${summary.meshZte}`, margin + 69, 34);
      doc.text(`FONO/BOX: ${summary.fono}/${summary.box}`, margin + 135, 34);
      doc.text(`PRE50/100/150/200: ${summary.pre50}/${summary.pre100}/${summary.pre150}/${summary.pre200}`, margin + 201, 34);
    };
    const drawTableHeader = (y: number) => {
      doc.setFillColor(241, 245, 249);
      doc.rect(margin, y, pageWidth - margin * 2, 8, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      let x = margin;
      for (const col of columns) {
        doc.rect(x, y, col.width, 8);
        doc.text(col.label, x + 1.5, y + 5.2);
        x += col.width;
      }
    };
    const drawRow = (row: any, y: number) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.2);
      doc.setTextColor(30, 41, 59);
      let x = margin;
      for (const col of columns) {
        doc.rect(x, y, col.width, 7);
        const raw = String(row[col.key] ?? "");
        const text = doc.splitTextToSize(raw, col.width - 2).slice(0, 1);
        doc.text(text, x + 1, y + 4.6);
        x += col.width;
      }
    };
    drawHeader();
    let y = 45;
    drawTableHeader(y);
    y += 8;
    for (const row of exportRows) {
      if (y > pageHeight - 18) {
        doc.addPage();
        drawHeader();
        y = 45;
        drawTableHeader(y);
        y += 8;
      }
      drawRow(row, y);
      y += 7;
    }
    if (y > pageHeight - 20) {
      doc.addPage();
      drawHeader();
      y = 45;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(
      `Totales -> ONT: ${summary.ontTotal} | MESH: ${summary.meshTotal} | FONO: ${summary.fono} | BOX: ${summary.box} | PRE50/100/150/200: ${summary.pre50}/${summary.pre100}/${summary.pre150}/${summary.pre200}`,
      margin,
      y + 6
    );
    doc.save(`predespacho_${anchor}.pdf`);
  }

  return (
    <div className="space-y-4">

      {/* ── HEADER PRINCIPAL ── */}
      <section className="overflow-hidden rounded-2xl shadow-md">
        <div className="bg-gradient-to-r from-[#1e3a5f] via-[#30518c] to-[#1a4a70] px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight text-white">Predespacho Instalaciones</span>
                {readOnly && (
                  <span className="rounded-full border border-amber-400/30 bg-amber-400/20 px-2 py-0.5 text-xs font-medium text-amber-200">
                    Solo lectura
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-blue-200">
                <span>📅 {anchor}</span>
                {periodLabel && <span>· {periodLabel}</span>}
                <span>· Alcance: <strong className="text-white">{scope}</strong></span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                aiRecommendation.status === "ok"
                  ? "border-emerald-500/30 bg-emerald-500/20 text-emerald-200"
                  : aiRecommendation.status === "fallback"
                    ? "border-amber-500/30 bg-amber-500/20 text-amber-200"
                    : aiRecommendation.status === "loading"
                      ? "border-cyan-500/30 bg-cyan-500/20 text-cyan-200"
                      : "border-white/20 bg-white/10 text-blue-200"
              }`}>
                {aiStatusLabel}
              </span>
              {modeConfirmed && (
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-blue-100">
                  {modeLabel}
                </span>
              )}
            </div>
          </div>
          {loading && (
            <div className="mt-3 flex items-center gap-2 text-sm text-blue-200">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-300/30 border-t-blue-200" />
              Cargando datos...
            </div>
          )}
        </div>
      </section>

      {/* ── SELECCIÓN DE MODO ── */}
      {!modeConfirmed ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Seleccionar tipo de predespacho</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              La IA analizará consumo y stock disponible para sugerir cantidades óptimas.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {[
              { id: "weekly",      icon: "📦", title: "Semanal general",   desc: "Despacho completo para todas las cuadrillas del alcance." },
              { id: "coordinator", icon: "👥", title: "Por coordinador",   desc: "Despacho dirigido a uno o varios coordinadores específicos." },
              { id: "squad",       icon: "🔧", title: "Por cuadrilla",     desc: "Despacho puntual para una cuadrilla específica." },
              { id: "urgent",      icon: "⚡", title: "Reposición urgente", desc: "Reposición por falta de stock sin romper el balance general." },
            ].map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => { setPredespachoMode(mode.id as PredespachoMode); setModeConfirmed(true); }}
                className="group flex flex-col gap-2 rounded-2xl border-2 border-slate-200 bg-white p-4 text-left transition-all hover:border-[#30518c] hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-500"
              >
                <span className="text-2xl">{mode.icon}</span>
                <div>
                  <div className="text-sm font-semibold text-slate-900 group-hover:text-[#30518c] dark:text-slate-100 dark:group-hover:text-blue-400">
                    {mode.title}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{mode.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <>
          {/* ── BARRA DE PROGRESO ── */}
          <div className="flex items-center overflow-x-auto rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            {[
              { id: 1, label: "Tipo elegido",       done: modeConfirmed },
              { id: 2, label: "Alcance filtrado",   done: !!uiRows.length || !!selCoords.length || !!textoCuadrilla.trim() },
              { id: 3, label: "Sugerencia IA",      done: aiRecommendation.status === "ok" || aiRecommendation.status === "fallback" },
              { id: 4, label: "Despacho guardado",  done: !!selectedBatch },
            ].map((step, i) => (
              <div key={step.id} className="flex min-w-0 flex-1 items-center">
                <div className={`flex min-w-0 flex-1 flex-col items-center gap-1 px-2 py-1 text-center ${step.done ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500"}`}>
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${step.done ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}>
                    {step.done ? "✓" : step.id}
                  </div>
                  <span className="text-[11px] font-medium leading-tight">{step.label}</span>
                </div>
                {i < 3 && <div className={`h-px w-4 flex-shrink-0 ${step.done ? "bg-emerald-300 dark:bg-emerald-700" : "bg-slate-200 dark:bg-slate-700"}`} />}
              </div>
            ))}
          </div>

          {/* ── FILTROS ── */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-9">
              <div className="lg:col-span-1">
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Fecha base</label>
                <input
                  type="date"
                  value={anchor}
                  onChange={(e) => setAnchor(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <div className="lg:col-span-2">
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Cuadrilla {predespachoMode === "squad" && <span className="ml-1 text-rose-500">*</span>}
                </label>
                <div className="relative">
                  <input
                    value={textoCuadrilla}
                    onChange={(e) => { setTextoCuadrilla(e.target.value); setCuadOpen(true); }}
                    onFocus={() => setCuadOpen(true)}
                    placeholder="Nombre o código..."
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  />
                  {cuadOpen && cuadrillaSuggestions.length > 0 && (
                    <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                      {cuadrillaSuggestions.map((c) => (
                        <button
                          key={`sug-${c.id}`}
                          type="button"
                          onClick={() => { setTextoCuadrilla(c.nombre || c.id); setCuadOpen(false); }}
                          className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
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
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Coordinadores</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setCoordOpen((v) => !v)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-left text-sm dark:border-slate-700 dark:bg-slate-900"
                    >
                      {selCoords.length ? `${selCoords.length} seleccionados` : "Elegir coordinadores"}
                    </button>
                    {coordOpen && (
                      <div className="absolute z-30 mt-1 w-full rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                        <input
                          value={coordQuery}
                          onChange={(e) => setCoordQuery(e.target.value)}
                          placeholder="Buscar..."
                          className="mb-2 w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                        />
                        <div className="max-h-56 overflow-auto">
                          {filteredCoords.map((c) => (
                            <label key={c.id} className="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-slate-50 dark:hover:bg-slate-800">
                              <input
                                type="checkbox"
                                checked={selCoords.includes(c.id)}
                                onChange={(e) => setSelCoords((prev) => e.target.checked ? Array.from(new Set([...prev, c.id])) : prev.filter((x) => x !== c.id))}
                              />
                              <span>{c.nombre}</span>
                            </label>
                          ))}
                          {!filteredCoords.length && <div className="py-1 text-xs text-slate-500">Sin resultados</div>}
                        </div>
                        <div className="mt-2 flex gap-2">
                          <button type="button" onClick={() => setSelCoords([])} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900">Limpiar</button>
                          <button type="button" onClick={() => setCoordOpen(false)} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900">Cerrar</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {scope !== "coordinador" && (
                <div className="lg:col-span-1">
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Estado</label>
                  <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value as EstadoFiltro)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
                    <option value="todas">Todas</option>
                    <option value="guardadas">Guardadas</option>
                    <option value="pendientes">Pendientes</option>
                    <option value="lote">Por lote</option>
                  </select>
                </div>
              )}
              {scope !== "coordinador" && (
                <div className="lg:col-span-1">
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Modelo</label>
                  <select value={modeloFiltro} onChange={(e) => setModeloFiltro(e.target.value as ModeloFiltro)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
                    <option value="all">Todos</option>
                    <option value="huawei">Huawei</option>
                    <option value="zte">ZTE</option>
                  </select>
                </div>
              )}
              {scope !== "coordinador" && (
                <div className="lg:col-span-1">
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Despacho</label>
                  <select value={grupoDespacho} onChange={(e) => setGrupoDespacho(e.target.value as GrupoDespachoFiltro)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
                    <option value="all">Todos</option>
                    <option value="huawei">Huawei</option>
                    <option value="zte">ZTE</option>
                  </select>
                </div>
              )}
              {scope !== "coordinador" && (
                <div className="lg:col-span-1">
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Lote</label>
                  <select value={selectedBatch} onChange={(e) => setSelectedBatch(e.target.value)} disabled={estadoFiltro !== "lote"} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 disabled:opacity-50">
                    <option value="">Seleccionar</option>
                    {batchIds.map((b) => <option key={b} value={b}>{b.slice(0, 16).replace("T", " ")}</option>)}
                  </select>
                </div>
              )}
              <div className="flex items-end lg:col-span-1">
                <button
                  type="button"
                  onClick={() => loadData(anchor)}
                  disabled={loading}
                  className="w-full rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium transition hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:hover:bg-slate-700"
                >
                  {loading ? "..." : "↻ Actualizar"}
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                Periodo: {periodLabel || "-"}
              </span>
              {scope !== "coordinador" && (
                <label className="flex cursor-pointer items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
                  <input type="checkbox" checked={verOmitidas} onChange={(e) => setVerOmitidas(e.target.checked)} className="h-3 w-3" />
                  Ver omitidas
                </label>
              )}
              <label className="flex cursor-pointer items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
                <input type="checkbox" checked={sortByCrit} onChange={(e) => setSortByCrit(e.target.checked)} className="h-3 w-3" />
                Ordenar por criticidad
              </label>
              {scope !== "coordinador" && (
                <button
                  type="button"
                  onClick={() => setModeConfirmed(false)}
                  className="rounded-full border border-slate-300 px-2.5 py-1 text-[11px] text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  ← Cambiar modo
                </button>
              )}
              {scope !== "coordinador" && aiRecommendation.status !== "idle" && (
                <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[11px] text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                  IA: {aiRecommendation.status}{aiRecommendation.data?.meta?.model ? ` · ${aiRecommendation.data.meta.model}` : ""}
                </span>
              )}
            </div>
          </section>

          {/* ── PANEL DE RECURSOS (colapsable) ── */}
          {scope !== "coordinador" && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setShowResources((v) => !v)}
              className="flex w-full items-center justify-between px-5 py-3.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Panel de recursos</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{totalRows} cuadrillas</span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">{guardadasCount} guardadas</span>
                {pendientesCount > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">{pendientesCount} pendientes</span>}
                {coverageStats.critico > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] text-red-700 dark:bg-red-900/30 dark:text-red-300">{coverageStats.critico} críticas</span>}
              </div>
              <span className="text-sm text-slate-400 dark:text-slate-500">{showResources ? "▲" : "▼"}</span>
            </button>

            {showResources && (
              <div className="space-y-4 border-t border-slate-200 p-4 dark:border-slate-700">

                {/* Stock almacén + consumo */}
                <div>
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Stock en almacén y consumo del periodo</div>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8">
                    {EQUIPOS.map((k) => (
                      <div key={`alm2-${k}`} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-800/60">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Almacén {k}</div>
                        <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{stockAlmacenActivo[k]}</div>
                        {k === "ONT" && <div className="text-[10px] text-slate-400">H:{stockAlmacenModel.ONT_HUAWEI} / Z:{stockAlmacenModel.ONT_ZTE}</div>}
                        {k === "MESH" && <div className="text-[10px] text-slate-400">H:{stockAlmacenModel.MESH_HUAWEI} / Z:{stockAlmacenModel.MESH_ZTE}</div>}
                      </div>
                    ))}
                    {EQUIPOS.map((k) => (
                      <div key={`con2-${k}`} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-800/60">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Consumo {k}</div>
                        <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{consumoTotal[k]}</div>
                        <div className="text-[10px] text-slate-400">Prom: {promedioTotal[k]}/d</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* PRECON */}
                <div>
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Stock PRECON en almacén</div>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    {PRECONS.map((p) => (
                      <div key={`prc2-${p}`} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-800/60">
                        <div className="text-[10px] text-slate-500">{p}</div>
                        <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{stockPrecon[p]}</div>
                        <div className="text-[10px] text-slate-400">Asignado: {totalPreconAsignado[p]}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Cobertura ONT */}
                <div>
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Cobertura de stock ONT · {baseRows.filter((r) => !omitidas[r.id]).length} cuadrillas activas
                  </div>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                    {([
                      { key: "critico",   label: "Crítico",    sub: "0 días",       color: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300" },
                      { key: "bajo",      label: "Bajo",       sub: "1-2 días",     color: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/20 dark:text-orange-300" },
                      { key: "medio",     label: "Medio",      sub: "3-5 días",     color: "border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-900 dark:bg-yellow-950/20 dark:text-yellow-300" },
                      { key: "ok",        label: "OK",         sub: "6+ días",      color: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300" },
                      { key: "sin_datos", label: "Sin prom.",  sub: "sin historial", color: "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400" },
                    ] as const).map(({ key, label, sub, color }) => (
                      <div key={key} className={`rounded-xl border p-3 ${color}`}>
                        <div className="text-[11px] font-medium">{label}</div>
                        <div className="text-[10px]">{sub}</div>
                        <div className="text-2xl font-bold">{coverageStats[key]}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Resumen IA */}
                <div>
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Resumen IA · {aiSummary.recommendationSource}</div>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                      <div className="text-[11px] text-slate-500">Cuadrillas analizadas</div>
                      <div className="text-lg font-semibold">{aiSummary.recommendationRows || visiblesCount}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                      <div className="text-[11px] text-slate-500">IA ONT / MESH</div>
                      <div className="text-lg font-semibold">{aiSummary.recommendationTotal.ONT} / {aiSummary.recommendationTotal.MESH}</div>
                    </div>
                    <div className="rounded-xl bg-blue-50 p-3 dark:bg-blue-950/20">
                      <div className="text-[11px] text-slate-500">ONT: {modelUsageSummary.ont}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">MESH: {modelUsageSummary.mesh}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                      <div className="text-[11px] text-slate-500">Modelo IA</div>
                      <div className="text-sm font-semibold capitalize">{aiSummary.recommendationSource}</div>
                      <div className="text-[10px] text-slate-400">{aiSummary.recommendationModel}</div>
                    </div>
                  </div>
                </div>

                {/* Objetivo operativo */}
                <div>
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Objetivo operativo por cuadrilla (piso mínimo)</div>
                  <div className="flex flex-wrap gap-4">
                    {EQUIPOS.map((k) => (
                      <div key={`obj2-${k}`} className="flex items-center gap-2">
                        <label className="w-10 text-xs font-medium text-slate-600 dark:text-slate-300">{k}</label>
                        <input
                          type="number"
                          min={0}
                          value={objetivo[k]}
                          disabled={readOnly}
                          onChange={(e) => setObjetivo((p) => ({ ...p, [k]: n(e.target.value) }))}
                          className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1 text-right text-sm dark:border-slate-700 dark:bg-slate-900"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
          )}

          {/* ── CONTROL DE DISPONIBILIDAD ── */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Control de stock</div>
                <div className="text-xs text-slate-500">Plan vs. disponible. El guardado se bloquea si el plan excede el stock.</div>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${hasAvailabilityIssues ? "bg-rose-100 text-rose-700 dark:bg-rose-950/30 dark:text-rose-200" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200"}`}>
                {hasAvailabilityIssues ? "⚠ Excede stock" : "✓ Stock OK"}
              </span>
            </div>
            <div className="grid gap-2 md:grid-cols-4">
              {EQUIPOS.map((k) => (
                <div key={`avail2-${k}`} className={`rounded-xl border p-3 ${availability[k].exceeded ? "border-rose-300 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/20" : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60"}`}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">{k}</span>
                    {availability[k].exceeded && <span className="text-xs text-rose-600 dark:text-rose-400">⚠</span>}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-bold text-slate-900 dark:text-slate-100">{availability[k].planned}</span>
                    <span className="text-xs text-slate-400">/ {availability[k].available}</span>
                  </div>
                  <div className="mt-1.5">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <div
                        className={`h-1.5 rounded-full transition-all ${availability[k].exceeded ? "bg-rose-500" : "bg-emerald-500"}`}
                        style={{ width: `${Math.min(100, availability[k].available ? (availability[k].planned / availability[k].available) * 100 : 0)}%` }}
                      />
                    </div>
                    <div className={`mt-1 text-[11px] ${availability[k].remaining < 0 ? "font-medium text-rose-600 dark:text-rose-400" : "text-slate-500"}`}>
                      Saldo: {availability[k].remaining}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-4">
              {PRECONS.map((p) => (
                <div key={`pa2-${p}`} className={`rounded-xl border px-3 py-2 ${preconAvailability[p].exceeded ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20" : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60"}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">{p}</span>
                    {preconAvailability[p].exceeded && <span className="text-[11px] text-amber-600 dark:text-amber-400">⚠</span>}
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-base font-bold">{preconAvailability[p].planned}</span>
                    <span className="text-[11px] text-slate-400">/ {preconAvailability[p].available}</span>
                  </div>
                </div>
              ))}
            </div>
            {hasAvailabilityIssues ? (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-200">
                ⚠ Ajusta cantidades manuales o filas omitidas antes de guardar. Excedidos: <strong>{[...exceededEquipos, ...exceededPrecons].join(", ")}</strong>
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200">
                ✓ El plan actual está dentro del stock disponible para despacho.
              </div>
            )}
          </section>

          {/* ── TABLA DE DESPACHO ── */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/60">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Predespacho por cuadrilla</h2>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-700 dark:text-slate-300">{visiblesCount} visibles</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={getAiSuggestion}
                  disabled={loading || aiRecommendation.loading || !uiRows.length}
                  className="flex items-center gap-1.5 rounded-xl border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 transition hover:bg-violet-100 disabled:opacity-50 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300 dark:hover:bg-violet-950/50"
                >
                  {aiRecommendation.loading ? "⌛ Calculando..." : "✦ Sugerencia IA"}
                </button>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={applyAiSuggestion}
                    disabled={!aiRecommendation.data?.recommendation || aiRecommendation.loading || !uiRows.length}
                    className="rounded-xl border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 transition hover:bg-violet-100 disabled:opacity-50 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300 dark:hover:bg-violet-950/50"
                  >
                    Aplicar IA
                  </button>
                )}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={applyAllSuggestions}
                    disabled={!uiRows.length || loading}
                    title="Aplica las cantidades sugeridas (determinístico) a todas las cuadrillas activas"
                    className="rounded-xl border border-cyan-300 bg-cyan-50 px-3 py-1.5 text-xs font-medium text-cyan-700 transition hover:bg-cyan-100 disabled:opacity-50 dark:border-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-300 dark:hover:bg-cyan-950/50"
                  >
                    Aplicar sugeridas
                  </button>
                )}
                <button type="button" onClick={exportExcel} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">
                  ⬇ Excel
                </button>
                <button type="button" onClick={exportPdf} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">
                  ⬇ PDF
                </button>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={savePredespacho}
                    disabled={saving || loading || !uiRows.length || hasAvailabilityIssues}
                    className="rounded-xl bg-[#30518c] px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#1e3a5f] disabled:opacity-50"
                  >
                    {saving ? "Guardando..." : "💾 Guardar despacho"}
                  </button>
                )}
              </div>
            </div>

            {/* Tabla */}
            <div className="overflow-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <th className="whitespace-nowrap px-3 py-2.5">Coordinador</th>
                    <th className="whitespace-nowrap px-3 py-2.5">Cuadrilla</th>
                    <th className="whitespace-nowrap px-3 py-2.5">Consumo / Prom.</th>
                    <th className="whitespace-nowrap px-3 py-2.5">Stock</th>
                    <th className="whitespace-nowrap px-3 py-2.5">Sugerido</th>
                    <th className="whitespace-nowrap px-3 py-2.5">Manual</th>
                    <th className="whitespace-nowrap bg-blue-50 px-3 py-2.5 text-blue-700 dark:bg-blue-950/20 dark:text-blue-300">Final</th>
                    <th className="whitespace-nowrap px-3 py-2.5">PRECON</th>
                    <th className="whitespace-nowrap px-3 py-2.5">Omitir</th>
                    <th className="whitespace-nowrap px-3 py-2.5">Resi</th>
                    <th className="whitespace-nowrap px-3 py-2.5">Condo</th>
                    <th className="whitespace-nowrap px-3 py-2.5">Guardado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800 dark:divide-slate-800 dark:text-slate-100">
                  {!uiRows.length && (
                    <tr>
                      <td colSpan={12} className="px-4 py-8 text-center text-slate-400">
                        {loading ? "Cargando cuadrillas..." : "Sin cuadrillas con los filtros actuales."}
                      </td>
                    </tr>
                  )}
                  {sortedRows.map((c) => {
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
                    const autonomia = diasAutonomiaMap[c.id];
                    const modelGrp = (cuadrillaModelGroup[c.id] || "NEUTRO").toUpperCase();
                    const showNeutro = grupoDespacho !== "all" && modelGrp === "NEUTRO";
                    const isSaved = !!savedInfo[c.id]?.updatedAt;
                    return (
                      <tr
                        key={c.id}
                        className={`transition ${omitidas[c.id] ? "opacity-40" : ""} ${sortByCrit ? critRowClass(autonomia?.criticidad) : ""} ${isSaved ? "bg-emerald-50/30 dark:bg-emerald-950/10" : ""}`}
                      >
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{c.coordinadorNombre || "-"}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-900 dark:text-slate-100">{c.nombre || c.id}</div>
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {showNeutro && (
                              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-700 dark:text-slate-300">NEUTRO</span>
                            )}
                            {autonomia && (
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${critColorClass(autonomia.criticidad)}`}>
                                {autonomia.dias !== null ? `${autonomia.dias}d` : "sin prom"}
                              </span>
                            )}
                            {isSaved && (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">✓</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                            {EQUIPOS.map((k) => (
                              <div key={`${c.id}-cons-${k}`} className="flex items-baseline gap-1">
                                <span className="w-8 text-[10px] font-medium text-slate-400">{k}</span>
                                <span className="font-medium">{cons[k]}</span>
                                <span className="text-[10px] text-slate-400">/{prom[k]}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                            {EQUIPOS.map((k) => (
                              <div key={`${c.id}-stk-${k}`} className="flex items-baseline gap-1">
                                <span className="w-8 text-[10px] font-medium text-slate-400">{k}</span>
                                <span className="font-medium">{stock[k]}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                            {EQUIPOS.map((k) => (
                              <div key={`${c.id}-sug-${k}`} className="flex items-baseline gap-1">
                                <span className="w-8 text-[10px] font-medium text-slate-400">{k}</span>
                                <span className="font-medium text-blue-700 dark:text-blue-300">{sug[k]}</span>
                                {aiSug && <span className="text-[10px] text-violet-500 dark:text-violet-400">/{n((aiSug as any)[k])}</span>}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="grid grid-cols-2 gap-1">
                            {EQUIPOS.map((k) => (
                              <input
                                key={`${c.id}-m-${k}`}
                                type="number"
                                min={0}
                                value={man[k] ?? ""}
                                placeholder={String(sug[k])}
                                disabled={readOnly}
                                title={k}
                                onChange={(e) => setManual((p) => ({ ...p, [c.id]: { ...(p[c.id] || {}), [k]: e.target.value === "" ? undefined : n(e.target.value) } }))}
                                className="w-12 rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-1 text-right text-xs focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900"
                              />
                            ))}
                          </div>
                        </td>
                        <td className="bg-blue-50/50 px-3 py-2 dark:bg-blue-950/10">
                          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                            {EQUIPOS.map((k) => (
                              <div key={`${c.id}-fin-${k}`} className="flex items-baseline gap-1">
                                <span className="w-8 text-[10px] font-medium text-slate-400">{k}</span>
                                <span className="font-semibold text-blue-800 dark:text-blue-200">{final[k]}</span>
                              </div>
                            ))}
                          </div>
                          {hasManual && (
                            <span className="mt-1 inline-block rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">manual</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="grid grid-cols-2 gap-1">
                            {PRECONS.map((p) => (
                              <input
                                key={`${c.id}-${p}`}
                                type="number"
                                min={0}
                                value={preconAsignado[c.id]?.[p] ?? ""}
                                placeholder={p.replace("PRECON_", "")}
                                disabled={readOnly}
                                title={p}
                                onChange={(e) => setPreconAsignado((prev) => ({ ...prev, [c.id]: { ...(prev[c.id] || {}), [p]: e.target.value === "" ? undefined : n(e.target.value) } }))}
                                className="w-14 rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-1 text-right text-xs focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900"
                              />
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input type="checkbox" checked={!!omitidas[c.id]} disabled={readOnly} onChange={(e) => setOmitidas((p) => ({ ...p, [c.id]: e.target.checked }))} className="h-4 w-4 rounded" />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            value={bobinaResi[c.id] ?? 0}
                            disabled={readOnly}
                            onChange={(e) => setBobinaResi((p) => ({ ...p, [c.id]: n(e.target.value) }))}
                            className="w-14 rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-1 text-right text-xs dark:border-slate-700 dark:bg-slate-900"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input type="checkbox" checked={!!rolloCondo[c.id]} disabled={readOnly} onChange={(e) => setRolloCondo((p) => ({ ...p, [c.id]: e.target.checked }))} className="h-4 w-4 rounded" />
                        </td>
                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                          {savedInfo[c.id]?.updatedAt ? (
                            <div>
                              <div className="font-medium text-emerald-700 dark:text-emerald-400">{savedInfo[c.id]?.updatedByName || "-"}</div>
                              <div className="text-[10px]">{String(savedInfo[c.id]?.updatedAt).slice(0, 16).replace("T", " ")}</div>
                            </div>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-600">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totales al pie de la tabla */}
            <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/60">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Totales a despachar:</span>
                {EQUIPOS.map((k) => (
                  <span
                    key={`tot2-${k}`}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${availability[k].exceeded ? "bg-rose-100 text-rose-700 dark:bg-rose-950/30 dark:text-rose-200" : "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-100"}`}
                  >
                    {k}: {totals.plan[k]}
                  </span>
                ))}
                <span className="ml-auto text-[11px] text-slate-400">{visiblesCount} cuadrillas activas</span>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
