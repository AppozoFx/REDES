"use client";
import React, { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  bulkSetEquiposCampoByFiltrosAction,
  getCuadrillaPreconStockAction,
  marcarAuditoriaAction,
  moverEquipoManualAction,
  quitarAuditoriaAction,
} from "../server-actions";
import * as XLSX from "xlsx";

type EquipoRow = {
  id: string;
  SN?: string;
  equipo?: string;
  descripcion?: string;
  ubicacion?: string;
  estado?: string;
  pri_tec?: string;
  tec_liq?: string;
  inv?: string;
  auditoria?: {
    requiere?: boolean;
    estado?: string;
    fotoPath?: string;
    fotoURL?: string;
    marcadoPor?: string;
    actualizadoEn?: any;
  };
};

type CuadrillaRow = { id: string; nombre?: string };

type ListResponse = {
  ok: boolean;
  items: EquipoRow[];
  nextCursor?: string | null;
  hasMore?: boolean;
  totalFiltered?: number;
  cuadrillas?: CuadrillaRow[];
};

type EquiposFiltersSnapshot = {
  sn: string;
  exact: boolean;
  estados: string[];
  ubicacion: string;
  equipo: string;
  pri_tec: string;
  tec_liq: string;
  inv: string;
  descripcionList: string[];
};

const FILTERS_STORAGE_KEY = "equipos_instalaciones_filters_v1";

const ONT_MATERIAL_KIT: Record<string, number> = {
  ACOPLADOR: 1,
  CINTILLO_30: 4,
  ACTA: 1,
  CINTILLO_BANDERA: 1,
  CONECTOR: 1,
  PACHCORD: 1,
  ROSETA: 1,
};

const PRECON_OPTIONS = ["PRECON_50", "PRECON_100", "PRECON_150", "PRECON_200"] as const;

function normalizeList(base: string[]) {
  return Array.from(new Set(base.map((v) => String(v || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function formatYmdToDmy(ymd?: string | null): string {
  const s = String(ymd || "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return s;
}

function hasAnyUserFilter(filters: EquiposFiltersSnapshot): boolean {
  return !!(
    filters.sn ||
    filters.estados.length > 0 ||
    filters.ubicacion ||
    filters.equipo ||
    filters.pri_tec ||
    filters.tec_liq ||
    filters.inv ||
    filters.descripcionList.length > 0
  );
}

export default function EquiposClient({ canEdit }: { canEdit: boolean }) {
  const [equipos, setEquipos] = useState<EquipoRow[]>([]);
  const [cuadrillas, setCuadrillas] = useState<CuadrillaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalFiltered, setTotalFiltered] = useState<number>(0);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [nextUbicacion, setNextUbicacion] = useState<string>("");
  const [editCaso, setEditCaso] = useState<string>("");
  const [editObs, setEditObs] = useState<string>("");
  const [ontModalOpen, setOntModalOpen] = useState(false);
  const [ontModalRow, setOntModalRow] = useState<EquipoRow | null>(null);
  const [ontModalFromCuadrillaId, setOntModalFromCuadrillaId] = useState("");
  const [ontModalToCuadrillaId, setOntModalToCuadrillaId] = useState("");
  const [ontModalFromUb, setOntModalFromUb] = useState("");
  const [ontModalToUb, setOntModalToUb] = useState("");
  const [ontModalLoading, setOntModalLoading] = useState(false);
  const [ontModalWithPrecon, setOntModalWithPrecon] = useState(false);
  const [ontModalPreconId, setOntModalPreconId] = useState<string>("");
  const [ontModalPreconStock, setOntModalPreconStock] = useState<Record<string, number>>({
    PRECON_50: 0,
    PRECON_100: 0,
    PRECON_150: 0,
    PRECON_200: 0,
  });

  const [snQuery, setSnQuery] = useState("");
  const [snFilter, setSnFilter] = useState("");
  const [filtroEstados, setFiltroEstados] = useState<Set<string>>(new Set());
  const [filtroUbicacion, setFiltroUbicacion] = useState("");
  const [filtroEquipo, setFiltroEquipo] = useState("");
  const [filtroPriTec, setFiltroPriTec] = useState("");
  const [filtroTecLiq, setFiltroTecLiq] = useState("");
  const [filtroInv, setFiltroInv] = useState("");
  const [selectedDescs, setSelectedDescs] = useState<Set<string>>(new Set());
  const [exactSearch, setExactSearch] = useState(false);
  const [descOptions, setDescOptions] = useState<string[]>([]);
  const [estadoOpen, setEstadoOpen] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState(false);
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);
  const snInputRef = useRef<HTMLInputElement | null>(null);
  const scanStatsRef = useRef<{ startedAt: number; lastAt: number; keyCount: number }>({
    startedAt: 0,
    lastAt: 0,
    keyCount: 0,
  });

  useEffect(() => {
    if (!estadoOpen && !descOpen) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-dd='estado']")) return;
      if (t.closest("[data-dd='desc']")) return;
      setEstadoOpen(false);
      setDescOpen(false);
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [estadoOpen, descOpen]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<EquiposFiltersSnapshot>;
        const sn = String(parsed.sn || "").trim().toUpperCase();
        setSnQuery(sn);
        setSnFilter(sn);
        setExactSearch(!!parsed.exact);
        setFiltroEstados(new Set((parsed.estados || []).map((x) => String(x || "").trim().toUpperCase()).filter(Boolean)));
        setFiltroUbicacion(String(parsed.ubicacion || "").trim().toUpperCase());
        setFiltroEquipo(String(parsed.equipo || "").trim().toUpperCase());
        setFiltroPriTec(String(parsed.pri_tec || "").trim().toUpperCase());
        setFiltroTecLiq(String(parsed.tec_liq || "").trim().toUpperCase());
        setFiltroInv(String(parsed.inv || "").trim().toUpperCase());
        setSelectedDescs(new Set((parsed.descripcionList || []).map((x) => String(x || "").trim()).filter(Boolean)));
      }
    } catch {
      // ignorar filtros corruptos
    } finally {
      setFiltersHydrated(true);
    }
  }, []);

  const [isPending, startTransition] = useTransition();

  const filtroEstadosKey = useMemo(
    () => Array.from(filtroEstados).sort().join("|"),
    [filtroEstados]
  );

  const selectedDescsKey = useMemo(
    () => Array.from(selectedDescs).sort().join("|"),
    [selectedDescs]
  );

  const getFiltersSnapshot = (): EquiposFiltersSnapshot => ({
    sn: snFilter.trim().toUpperCase(),
    exact: !!exactSearch,
    estados: Array.from(filtroEstados).map((v) => String(v || "").trim().toUpperCase()).filter(Boolean),
    ubicacion: String(filtroUbicacion || "").trim().toUpperCase(),
    equipo: String(filtroEquipo || "").trim().toUpperCase(),
    pri_tec: String(filtroPriTec || "").trim().toUpperCase(),
    tec_liq: String(filtroTecLiq || "").trim().toUpperCase(),
    inv: String(filtroInv || "").trim().toUpperCase(),
    descripcionList: Array.from(selectedDescs).map((v) => String(v || "").trim()).filter(Boolean),
  });

  const confirmNoFiltersMassive = (operationLabel: string, filters: EquiposFiltersSnapshot): boolean => {
    if (hasAnyUserFilter(filters)) return true;
    const ok = window.confirm(
      `No hay filtros activos. Esta accion aplicara sobre TODO el universo por defecto (estado ALMACEN/CAMPO). ¿Deseas continuar con ${operationLabel}?`
    );
    if (!ok) return false;
    const typed = window.prompt("Para confirmar, escribe TODOS");
    return String(typed || "").trim().toUpperCase() === "TODOS";
  };

  const confirmExportUpdateCount = (sheet: "PRI-TEC" | "TEC-LIQ" | "INV", count: number): boolean => {
    const msg =
      `Se exportaran ${count} documentos filtrados y se actualizara ${sheet} en BD.\n` +
      "¿Deseas continuar?";
    return window.confirm(msg);
  };

  const resetScanStats = () => {
    scanStatsRef.current = { startedAt: 0, lastAt: 0, keyCount: 0 };
  };

  const trackScanKey = () => {
    const now = Date.now();
    const st = scanStatsRef.current;
    if (!st.lastAt || now - st.lastAt > 180) {
      st.startedAt = now;
      st.keyCount = 0;
    }
    if (!st.startedAt) st.startedAt = now;
    st.keyCount += 1;
    st.lastAt = now;
  };

  const isLikelyScannerInput = () => {
    const now = Date.now();
    const st = scanStatsRef.current;
    if (!st.keyCount || !st.startedAt) return false;
    const elapsed = now - st.startedAt;
    const avgMs = elapsed / Math.max(1, st.keyCount);
    return st.keyCount >= 6 && elapsed <= 1500 && avgMs <= 70;
  };

  const exportFilename = (suffix: string, includeFilters = true) => {
    const d = new Date();
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    let name = `EQUIPOS-${ds}-${suffix}`;
    if (includeFilters) {
      if (selectedDescs.size > 0) {
        name += `-${Array.from(selectedDescs).join("_")}`;
      }
      if (filtroEquipo) {
        name += `-${filtroEquipo}`;
      }
    }
    return `${name}.xlsx`;
  };

  const mapExportRow = (e: any) => ({
    SN: e.SN || e.id,
    "F. Despacho": formatYmdToDmy(e.f_despachoYmd) || "",
    Tecnicos: Array.isArray(e.tecnicos) ? e.tecnicos.join(", ") : e.tecnicos || "",
    "F. Instalacion": formatYmdToDmy(e.f_instaladoYmd) || "",
    Codigo: e.codigoCliente || "",
    Cliente: e.cliente || "",
    "F. Ingreso": formatYmdToDmy(e.f_ingresoYmd) || "",
    Estado: e.estado || "",
    Ubicacion: e.ubicacion || "",
    Equipo: e.equipo || "",
    Caso: e.caso || "",
    Observacion: e.observacion || "",
    "Pri-Tec": e.pri_tec || "",
    "Tec-Liq": e.tec_liq || "",
    Inv: e.inv || "",
  });

  const resumenPaginaByEquipo = useMemo(() => {
    const map = new Map<string, number>();
    equipos.forEach((e: any) => {
      const k = String(e.equipo || "OTROS").toUpperCase();
      map.set(k, (map.get(k) || 0) + 1);
    });
    const parts: string[] = [];
    Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([k, v]) => parts.push(`${v} ${k}`));
    return { total: equipos.length, parts };
  }, [equipos]);

  const exportarEquipos = async () => {
    if (bulkRunning) return;
    const toastId = toast(
      () => (
        <div>
          <div className="text-sm font-medium">Se exportara LISTA con todos los equipos filtrados.</div>
          <div className="mt-2 flex justify-end gap-2">
            <button
              className="rounded bg-blue-600 px-3 py-1 text-white"
              onClick={async () => {
                toast.dismiss(toastId);
                setBulkRunning(true);
                try {
                  const filters = getFiltersSnapshot();
                  if (!confirmNoFiltersMassive("EXPORTAR LISTA", filters)) {
                    toast.message("Operacion cancelada");
                    return;
                  }
                  const rows = await fetchAllFilteredRowsForExport();
                  if (!rows.length) {
                    toast.error("No hay equipos para exportar");
                    return;
                  }
                  const data = rows.map(mapExportRow);
                  const ws = XLSX.utils.json_to_sheet(data);
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, ws, "Equipos");
                  XLSX.writeFile(wb, exportFilename("LISTA"));
                  toast.success(`Equipos exportados: ${rows.length}`);
                } catch (e: any) {
                  toast.error(String(e?.message || "No se pudo exportar"));
                } finally {
                  setBulkRunning(false);
                }
              }}
              disabled={bulkRunning}
            >
              Confirmar
            </button>
            <button
              className="rounded border px-3 py-1"
              onClick={() => toast.dismiss(toastId)}
            >
              Cancelar
            </button>
          </div>
        </div>
      ),
      { duration: 10000 }
    );
  };

  const exportarPriTec = async () => {
    if (bulkRunning) return;
    const toastId = toast(
      () => (
        <div>
          <div className="text-sm font-medium">Se exportara PRI-TEC y se marcara en BD segun filtros.</div>
          <div className="mt-2 flex justify-end gap-2">
            <button
              className="rounded bg-purple-600 px-3 py-1 text-white"
              onClick={async () => {
                toast.dismiss(toastId);
                await exportarYActualizarCampo("pri_tec", "PRI-TEC");
              }}
              disabled={bulkRunning}
            >
              Confirmar
            </button>
            <button
              className="rounded border px-3 py-1"
              onClick={() => toast.dismiss(toastId)}
            >
              Cancelar
            </button>
          </div>
        </div>
      ),
      { duration: 10000 }
    );
  };

  const exportarTecLiq = async () => {
    if (bulkRunning) return;
    const toastId = toast(
      () => (
        <div>
          <div className="text-sm font-medium">Se exportara TEC-LIQ y se marcara en BD segun filtros.</div>
          <div className="mt-2 flex justify-end gap-2">
            <button
              className="rounded bg-green-600 px-3 py-1 text-white"
              onClick={async () => {
                toast.dismiss(toastId);
                await exportarYActualizarCampo("tec_liq", "TEC-LIQ");
              }}
              disabled={bulkRunning}
            >
              Confirmar
            </button>
            <button
              className="rounded border px-3 py-1"
              onClick={() => toast.dismiss(toastId)}
            >
              Cancelar
            </button>
          </div>
        </div>
      ),
      { duration: 10000 }
    );
  };

  const exportarInv = async () => {
    if (bulkRunning) return;
    const toastId = toast(
      () => (
        <div>
          <div className="text-sm font-medium">Se exportara INV y se marcara en BD segun filtros.</div>
          <div className="mt-2 flex justify-end gap-2">
            <button
              className="rounded bg-amber-600 px-3 py-1 text-white"
              onClick={async () => {
                toast.dismiss(toastId);
                await exportarYActualizarCampo("inv", "INV");
              }}
              disabled={bulkRunning}
            >
              Confirmar
            </button>
            <button
              className="rounded border px-3 py-1"
              onClick={() => toast.dismiss(toastId)}
            >
              Cancelar
            </button>
          </div>
        </div>
      ),
      { duration: 10000 }
    );
  };

  useEffect(() => {
    const id = setTimeout(() => {
      setSnFilter(snQuery.trim().toUpperCase());
    }, 250);
    return () => clearTimeout(id);
  }, [snQuery]);

  useEffect(() => {
    setExactSearch(false);
  }, [snQuery]);

  useEffect(() => {
    if (!filtersHydrated) return;
    try {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(getFiltersSnapshot()));
    } catch {
      // best effort
    }
  }, [
    filtersHydrated,
    snFilter,
    exactSearch,
    filtroEstadosKey,
    filtroUbicacion,
    filtroEquipo,
    filtroPriTec,
    filtroTecLiq,
    filtroInv,
    selectedDescsKey,
  ]);

  const cuadrillaByNombre = useMemo(() => {
    const m = new Map<string, string>();
    cuadrillas.forEach((c) => {
      const key = String(c.nombre || "").toUpperCase();
      if (key) m.set(key, c.id);
    });
    return m;
  }, [cuadrillas]);

  const ubicacionesBase = useMemo(() => {
    const base = [
      "ALMACEN",
      "AVERIA",
      "GARANTIA",
      "PERDIDO",
      "ROBO",
      "WIN",
      "INSTALADOS",
      ...cuadrillas.map((c) => c.nombre || ""),
    ];
    return normalizeList(base);
  }, [cuadrillas]);

  const estadosDisponibles = useMemo(
    () => normalizeList(["ALMACEN", "CAMPO", "INSTALADO", "WIN", "DESCONTADOS"]),
    []
  );

  const equiposBase = useMemo(
    () => normalizeList(["ONT", "MESH", "FONO", "BOX", ...(equipos || []).map((e) => e.equipo || "")]),
    [equipos]
  );

  const descripcionesFiltradas = useMemo(() => descOptions, [descOptions]);

  const buildListParams = (opts?: {
    reset?: boolean;
    cursorValue?: string | null;
    exactOverride?: boolean;
    snOverride?: string;
  }) => {
    const params = new URLSearchParams();
    params.set("limit", "200");
    const shouldReset = !!opts?.reset;
    const cursorValue = opts?.cursorValue ?? cursor;
    if (!shouldReset && cursorValue) params.set("cursor", cursorValue);
    const snVal = (opts?.snOverride ?? snFilter).trim();
    if (snVal) {
      params.set("sn", snVal);
      if (typeof opts?.exactOverride === "boolean" ? opts.exactOverride : exactSearch) {
        params.set("exact", "1");
      }
    }
    if (filtroEstados.size > 0) Array.from(filtroEstados).forEach((e) => params.append("estado", e));
    if (filtroUbicacion) params.set("ubicacion", filtroUbicacion);
    if (filtroEquipo) params.set("equipo", filtroEquipo);
    if (filtroPriTec) params.set("pri_tec", filtroPriTec);
    if (filtroTecLiq) params.set("tec_liq", filtroTecLiq);
    if (filtroInv) params.set("inv", filtroInv);
    if (selectedDescs.size > 0) Array.from(selectedDescs).forEach((d) => params.append("descripcion", d));
    return params;
  };

  async function fetchList(reset = false, exactOverride?: boolean, snOverride?: string) {
    if (!filtersHydrated) return;
    setLoading(true);
    try {
      const params = buildListParams({ reset, exactOverride, snOverride });
      const res = await fetch(`/api/equipos/list?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("LIST_FAIL");
      const data = (await res.json()) as ListResponse;
      if (!data?.ok) throw new Error("LIST_FAIL");
      if (data.cuadrillas) setCuadrillas(data.cuadrillas);
      setHasMore(!!data.hasMore);
      setCursor(data.nextCursor || null);
      setTotalFiltered(Number(data.totalFiltered || 0));
      setEquipos((prev) => (reset ? data.items : [...prev, ...data.items]));
    } catch (e: any) {
      toast.error(String(e?.message || "No se pudo cargar"));
    } finally {
      setLoading(false);
    }
  }

  async function fetchAllFilteredRowsForExport(): Promise<EquipoRow[]> {
    const out: EquipoRow[] = [];
    let pageCursor: string | null = null;
    let safety = 0;
    while (safety < 500) {
      safety += 1;
      const params = buildListParams({ reset: true, cursorValue: null });
      params.set("limit", "200");
      if (pageCursor) params.set("cursor", pageCursor);
      const res = await fetch(`/api/equipos/list?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("LIST_FAIL");
      const data = (await res.json()) as ListResponse;
      if (!data?.ok) throw new Error("LIST_FAIL");
      out.push(...(Array.isArray(data.items) ? data.items : []));
      if (!data.hasMore || !data.nextCursor) break;
      pageCursor = data.nextCursor;
    }
    return out;
  }

  async function exportarYActualizarCampo(
    field: "pri_tec" | "tec_liq" | "inv",
    sheet: "PRI-TEC" | "TEC-LIQ" | "INV"
  ) {
    if (bulkRunning) return;
    setBulkRunning(true);
    try {
      const filters = getFiltersSnapshot();
      if (!confirmNoFiltersMassive(`EXPORTAR ${sheet} Y ACTUALIZAR`, filters)) {
        toast.message("Operacion cancelada");
        return;
      }
      const rows = await fetchAllFilteredRowsForExport();
      if (!rows.length) {
        toast.error("No hay equipos para exportar");
        return;
      }
      if (!confirmExportUpdateCount(sheet, rows.length)) {
        toast.message("Operacion cancelada");
        return;
      }

      const data = rows.map((e: any) => {
        const row = mapExportRow(e);
        if (field === "pri_tec") row["Pri-Tec"] = "SI";
        if (field === "tec_liq") row["Tec-Liq"] = "SI";
        if (field === "inv") row.Inv = "SI";
        return row;
      });
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheet);
      XLSX.writeFile(wb, exportFilename(sheet));

      const result = await bulkSetEquiposCampoByFiltrosAction({
        field,
        value: "SI",
        filters,
      });
      if (!result?.ok) throw new Error("BULK_UPDATE_FAIL");

      setEquipos([]);
      setCursor(null);
      await fetchList(true);
      toast.success(`${sheet} exportado. Actualizados: ${result.updated} de ${result.matched}.`);
    } catch (e: any) {
      toast.error(String(e?.message || "No se pudo exportar/actualizar"));
    } finally {
      setBulkRunning(false);
    }
  }

  async function fetchDescOptions() {
    try {
      const params = new URLSearchParams();
      if (filtroEstados.size > 0) {
        Array.from(filtroEstados).forEach((e) => params.append("estado", e));
      }
      if (filtroEquipo) params.set("equipo", filtroEquipo);
      if (filtroUbicacion) params.set("ubicacion", filtroUbicacion);
      const res = await fetch(`/api/equipos/descripciones?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data?.items)) setDescOptions(data.items);
    } catch {
      // silencioso
    }
  }

  useEffect(() => {
    if (!filtersHydrated) return;
    setEquipos([]);
    setCursor(null);
    fetchList(true);
    fetchDescOptions();
  }, [filtersHydrated, snFilter, filtroUbicacion, filtroEquipo, filtroPriTec, filtroTecLiq, filtroInv, selectedDescsKey, filtroEstadosKey]);

  useEffect(() => {
    if (!filtersHydrated) return;
    fetchDescOptions();
    setSelectedDescs(new Set());
  }, [filtersHydrated, filtroEquipo, filtroUbicacion, filtroEstadosKey]);

  const startEdit = (row: EquipoRow) => {
    setEditingId(row.id);
    setNextUbicacion(String(row.ubicacion || ""));
    setEditCaso(String((row as any).caso || ""));
    setEditObs(String((row as any).observacion || ""));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setNextUbicacion("");
    setEditCaso("");
    setEditObs("");
  };

  const closeOntModal = () => {
    setOntModalOpen(false);
    setOntModalRow(null);
    setOntModalFromCuadrillaId("");
    setOntModalToCuadrillaId("");
    setOntModalFromUb("");
    setOntModalToUb("");
    setOntModalWithPrecon(false);
    setOntModalPreconId("");
    setOntModalLoading(false);
  };

  const executeMove = (row: EquipoRow, opts?: { preconMaterialId?: string }) => {
    const sn = String(row.SN || row.id || "").trim().toUpperCase();
    if (!sn) return;
    const toUb = String(nextUbicacion || "").trim();
    if (!toUb) {
      toast.error("Selecciona ubicacion");
      return;
    }
    const fromUb = String(row.ubicacion || "").trim().toUpperCase();
    const toUbKey = toUb.toUpperCase();
    const fromCuadrillaId = cuadrillaByNombre.get(fromUb) || undefined;
    const toCuadrillaId = cuadrillaByNombre.get(toUbKey) || undefined;

    startTransition(async () => {
      try {
        const r = await moverEquipoManualAction({
          sn,
          toUbicacion: toUb,
          fromCuadrillaId,
          toCuadrillaId,
          caso: editCaso,
          observacion: editObs,
          preconMaterialId: opts?.preconMaterialId || "",
        });
        if (!r?.ok) throw new Error("MOVE_FAIL");
        closeOntModal();
        cancelEdit();
        setEquipos([]);
        setCursor(null);
        await fetchList(true);
        toast.success("Equipo actualizado");
      } catch (e: any) {
        toast.error(String(e?.message || "No se pudo mover el equipo"));
      }
    });
  };

  const openOntMoveModal = async (row: EquipoRow, args: { fromCuadrillaId: string; toCuadrillaId: string; fromUb: string; toUb: string }) => {
    setOntModalRow(row);
    setOntModalFromCuadrillaId(args.fromCuadrillaId);
    setOntModalToCuadrillaId(args.toCuadrillaId);
    setOntModalFromUb(args.fromUb);
    setOntModalToUb(args.toUb);
    setOntModalOpen(true);
    setOntModalWithPrecon(false);
    setOntModalPreconId("");
    setOntModalLoading(true);
    try {
      const res = await getCuadrillaPreconStockAction({ cuadrillaId: args.fromCuadrillaId });
      if (res?.ok && res.stock) {
        setOntModalPreconStock({
          PRECON_50: Number(res.stock.PRECON_50 || 0),
          PRECON_100: Number(res.stock.PRECON_100 || 0),
          PRECON_150: Number(res.stock.PRECON_150 || 0),
          PRECON_200: Number(res.stock.PRECON_200 || 0),
        });
      }
    } catch {
      toast.error("No se pudo cargar stock PRECON de la cuadrilla origen");
    } finally {
      setOntModalLoading(false);
    }
  };

  const saveMove = (row: EquipoRow) => {
    const toUb = String(nextUbicacion || "").trim();
    if (!toUb) {
      toast.error("Selecciona ubicacion");
      return;
    }
    const fromUb = String(row.ubicacion || "").trim().toUpperCase();
    const toUbKey = toUb.toUpperCase();
    const fromCuadrillaId = cuadrillaByNombre.get(fromUb) || undefined;
    const toCuadrillaId = cuadrillaByNombre.get(toUbKey) || undefined;
    const isCrossCuadrillaMove = !!fromCuadrillaId && !!toCuadrillaId && fromCuadrillaId !== toCuadrillaId;
    const isOnt = String(row.equipo || "").trim().toUpperCase() === "ONT";

    if (isOnt && isCrossCuadrillaMove) {
      openOntMoveModal(row, {
        fromCuadrillaId: fromCuadrillaId as string,
        toCuadrillaId: toCuadrillaId as string,
        fromUb,
        toUb: toUbKey,
      });
      return;
    }

    executeMove(row);
  };

  const marcarAuditoria = (row: EquipoRow) => {
    const sn = String(row.SN || row.id || "").trim().toUpperCase();
    if (!sn) return;
    startTransition(async () => {
      try {
        const r = await marcarAuditoriaAction({ sn });
        if (!r?.ok) throw new Error("AUDIT_FAIL");
        setEquipos((prev) =>
          prev.map((e) => (e.id === row.id ? { ...e, auditoria: r.auditoria } : e))
        );
        toast.success("Marcado para sustentar");
      } catch {
        toast.error("No se pudo marcar");
      }
    });
  };

  const quitarAuditoria = (row: EquipoRow) => {
    const sn = String(row.SN || row.id || "").trim().toUpperCase();
    if (!sn) return;
    startTransition(async () => {
      try {
        const r = await quitarAuditoriaAction({ sn });
        if (!r?.ok) throw new Error("AUDIT_CLEAR_FAIL");
        setEquipos((prev) =>
          prev.map((e) => (e.id === row.id ? { ...e, auditoria: undefined } : e))
        );
        toast.success("Auditoria eliminada");
      } catch {
        toast.error("No se pudo quitar");
      }
    });
  };

  const toggleDesc = (desc: string, checked: boolean) => {
    setSelectedDescs((prev) => {
      const next = new Set(prev);
      if (checked) next.add(desc);
      else next.delete(desc);
      return next;
    });
  };

  const clearFilters = () => {
    setSnQuery("");
    setSnFilter("");
    setFiltroEstados(new Set());
    setFiltroUbicacion("");
    setFiltroEquipo("");
    setFiltroPriTec("");
    setFiltroTecLiq("");
    setFiltroInv("");
    setSelectedDescs(new Set());
  };

  const ontPreconDisponibles = useMemo(
    () =>
      PRECON_OPTIONS.map((id) => ({
        id,
        stock: Number(ontModalPreconStock[id] || 0),
      })),
    [ontModalPreconStock]
  );

  const confirmarMovimientoOnt = () => {
    if (!ontModalRow) return;
    if (ontModalWithPrecon && !ontModalPreconId) {
      toast.error("Selecciona un PRECON para mover junto al equipo ONT");
      return;
    }
    if (ontModalWithPrecon && Number(ontModalPreconStock[ontModalPreconId] || 0) < 1) {
      toast.error("No hay stock suficiente del PRECON seleccionado en la cuadrilla origen");
      return;
    }
    executeMove(ontModalRow, { preconMaterialId: ontModalWithPrecon ? ontModalPreconId : "" });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-3 dark:border-slate-700 dark:from-slate-900 dark:to-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Control de Equipos</div>
            <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">Traslados entre cuadrillas (Instalaciones)</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 py-2 text-sm">
            <div className="font-medium">Resumen</div>
            <div className="text-slate-500 dark:text-slate-400">Total filtrados: {totalFiltered}</div>
            <div className="text-xs text-slate-500">
              Pagina cargada: {resumenPaginaByEquipo.parts.join(" - ") || "-"}
            </div>
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Filtros</div>
        <div className="flex flex-wrap gap-2">
        <input
          ref={snInputRef}
          value={snQuery}
          onChange={(e) => setSnQuery(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
              trackScanKey();
            } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "Escape") {
              resetScanStats();
            }
            if (e.key === "Enter") {
              e.preventDefault();
              setEquipos([]);
              setCursor(null);
              const exact = snQuery.trim().toUpperCase();
              if (exact) {
                const isTail = exact.length === 6;
                setExactSearch(!isTail);
                fetchList(true, !isTail, exact);
                if (scannerMode || isLikelyScannerInput()) {
                  // Si fue pistoleo, dejar seleccionado para que el siguiente scan reemplace el anterior.
                  setTimeout(() => {
                    snInputRef.current?.focus();
                    snInputRef.current?.select();
                  }, 0);
                }
              }
              resetScanStats();
            }
          }}
          className="w-full max-w-xs rounded-lg border px-3 py-2 text-sm font-mono"
          placeholder="Buscar SN (prefijo; Enter = exacto)"
        />
        <label className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs">
          <input
            type="checkbox"
            checked={scannerMode}
            onChange={(e) => setScannerMode(e.target.checked)}
          />
          Modo escaner
        </label>

        <div className="rounded-lg border px-2 py-2 text-xs" data-dd="estado">
          <div className="font-medium mb-1">Estado</div>
          <div className="relative">
            <button
              type="button"
              className="min-w-[160px] rounded border px-2 py-1 text-left text-xs"
              onClick={() => setEstadoOpen((v) => !v)}
            >
              {filtroEstados.size > 0 ? `Seleccionados: ${filtroEstados.size}` : "Seleccionar estados"}
            </button>
            {estadoOpen && (
              <div className="absolute z-20 mt-1 w-48 rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-2 shadow">
                {estadosDisponibles.map((estado) => (
                  <label key={estado} className="flex items-center gap-2 py-1 text-xs">
                    <input
                      type="checkbox"
                      checked={filtroEstados.has(estado)}
                      onChange={(e) => {
                        setFiltroEstados((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(estado);
                          else next.delete(estado);
                          return next;
                        });
                      }}
                    />
                    <span>{estado}</span>
                  </label>
                ))}
                <button
                  type="button"
                  className="mt-2 w-full rounded border px-2 py-1 text-xs"
                  onClick={() => setEstadoOpen(false)}
                >
                  Cerrar
                </button>
              </div>
            )}
          </div>
        </div>

        <select
          value={filtroUbicacion}
          onChange={(e) => setFiltroUbicacion(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="">Ubicacion</option>
          {ubicacionesBase.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>

        <select
          value={filtroEquipo}
          onChange={(e) => setFiltroEquipo(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="">Equipo</option>
          {equiposBase.map((eq) => (
            <option key={eq} value={eq}>
              {eq}
            </option>
          ))}
        </select>

        <select
          value={filtroPriTec}
          onChange={(e) => setFiltroPriTec(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="">PRI-TEC</option>
          <option value="SI">SI</option>
          <option value="NO">NO</option>
        </select>

        <select
          value={filtroTecLiq}
          onChange={(e) => setFiltroTecLiq(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="">TEC-LIQ</option>
          <option value="SI">SI</option>
          <option value="NO">NO</option>
        </select>

        <select
          value={filtroInv}
          onChange={(e) => setFiltroInv(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="">INV</option>
          <option value="SI">SI</option>
          <option value="NO">NO</option>
        </select>

        <button
          type="button"
          onClick={clearFilters}
          className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          Limpiar filtros
        </button>
      </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={exportarEquipos}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white shadow-sm"
          disabled={bulkRunning}
        >
          Exportar Equipos
        </button>
        <button
          type="button"
          onClick={exportarPriTec}
          className="rounded-lg bg-purple-600 px-3 py-2 text-sm text-white shadow-sm"
          disabled={bulkRunning}
        >
          Exportar PRI-TEC
        </button>
        <button
          type="button"
          onClick={exportarTecLiq}
          className="rounded-lg bg-green-600 px-3 py-2 text-sm text-white shadow-sm"
          disabled={bulkRunning}
        >
          Exportar TEC-LIQ
        </button>
        <button
          type="button"
          onClick={exportarInv}
          className="rounded-lg bg-amber-600 px-3 py-2 text-sm text-white shadow-sm"
          disabled={bulkRunning}
        >
          Exportar INV
        </button>
      </div>

      <div className="rounded-xl border p-3" data-dd="desc">
        <div className="text-sm font-medium">Descripcion</div>
        <div className="mt-2 flex gap-2">
          <div className="relative">
            <button
              type="button"
              className="min-w-[220px] rounded border px-2 py-1 text-left text-xs"
              onClick={() => setDescOpen((v) => !v)}
            >
              {selectedDescs.size > 0 ? `Seleccionadas: ${selectedDescs.size}` : "Seleccionar descripciones"}
            </button>
            {descOpen && (
              <div className="absolute z-20 mt-1 w-64 rounded border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-2 shadow max-h-56 overflow-auto">
                {descripcionesFiltradas.length === 0 ? (
                  <div className="text-xs text-slate-500 dark:text-slate-400">Sin descripciones</div>
                ) : (
                  descripcionesFiltradas.map((d) => (
                    <label key={d} className="flex items-center gap-2 py-1 text-xs">
                      <input
                        type="checkbox"
                        checked={selectedDescs.has(d)}
                        onChange={(e) => toggleDesc(d, e.target.checked)}
                      />
                      <span>{d}</span>
                    </label>
                  ))
                )}
                <button
                  type="button"
                  className="mt-2 w-full rounded border px-2 py-1 text-xs"
                  onClick={() => setDescOpen(false)}
                >
                  Cerrar
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            className="rounded border px-2 py-1 text-xs"
            onClick={() => setSelectedDescs(new Set())}
          >
            Limpiar
          </button>
        </div>
      </div>

      <div className="rounded border overflow-auto">
        <table className="min-w-[1100px] text-sm">
          <thead className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <tr className="text-left">
              <th className="p-2">SN</th>
              <th className="p-2">F. Despacho</th>
              <th className="p-2">Tecnicos</th>
              <th className="p-2">F. Instalacion</th>
              <th className="p-2">Codigo</th>
              <th className="p-2">Cliente</th>
              <th className="p-2">F. Ingreso</th>
              <th className="p-2">Estado</th>
              <th className="p-2">Ubicacion</th>
              <th className="p-2">Equipo</th>
              <th className="p-2">Caso</th>
              <th className="p-2">Observacion</th>
              <th className="p-2">PRI-TEC</th>
              <th className="p-2">TEC-LIQ</th>
              <th className="p-2">INV</th>
              <th className="p-2">Accion</th>
            </tr>
          </thead>
          <tbody>
            {equipos.map((e: any) => {
              const isEditing = editingId === e.id;
              return (
                <tr key={e.id} className="border-t">
                  <td className="p-2 font-mono">{e.SN || e.id}</td>
                  <td className="p-2">{formatYmdToDmy(e.f_despachoYmd) || "-"}</td>
                  <td className="p-2">
                    {Array.isArray(e.tecnicos) ? e.tecnicos.join(", ") : e.tecnicos || "-"}
                  </td>
                  <td className="p-2">{formatYmdToDmy(e.f_instaladoYmd) || "-"}</td>
                  <td className="p-2">{e.codigoCliente || "-"}</td>
                  <td className="p-2">{e.cliente || "-"}</td>
                  <td className="p-2">{formatYmdToDmy(e.f_ingresoYmd) || "-"}</td>
                  <td className="p-2">{e.estado || "-"}</td>
                  <td className="p-2">
                    {isEditing ? (
                      <select
                        value={nextUbicacion}
                        onChange={(ev) => setNextUbicacion(ev.target.value)}
                        className="rounded border px-2 py-1"
                      >
                        <option value="">Selecciona</option>
                        {ubicacionesBase.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    ) : (
                      e.ubicacion || "-"
                    )}
                  </td>
                  <td className="p-2">{e.equipo || "-"}</td>
                  <td className="p-2">
                    {isEditing ? (
                      <input
                        value={editCaso}
                        onChange={(ev) => setEditCaso(ev.target.value)}
                        className="w-full rounded border px-2 py-1 text-sm"
                      />
                    ) : (
                      e.caso || "-"
                    )}
                  </td>
                  <td className="p-2">
                    {isEditing ? (
                      <input
                        value={editObs}
                        onChange={(ev) => setEditObs(ev.target.value)}
                        className="w-full rounded border px-2 py-1 text-sm"
                      />
                    ) : (
                      e.observacion || "-"
                    )}
                  </td>
                  <td className="p-2">{e.pri_tec || "-"}</td>
                  <td className="p-2">{e.tec_liq || "-"}</td>
                  <td className="p-2">{e.inv || "-"}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-2">
                      {canEdit && (
                        <>
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                className="rounded bg-emerald-600 px-3 py-1 text-white"
                                onClick={() => saveMove(e)}
                                disabled={isPending}
                              >
                                Guardar
                              </button>
                              <button
                                type="button"
                                className="rounded bg-gray-300 px-3 py-1"
                                onClick={cancelEdit}
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="rounded bg-blue-600 px-3 py-1 text-white"
                              onClick={() => startEdit(e)}
                            >
                              Editar
                            </button>
                          )}
                        </>
                      )}
                      {canEdit && (
                        <>
                          {e.auditoria?.requiere ? (
                            <button
                              type="button"
                              className="rounded bg-red-600 px-3 py-1 text-white"
                              onClick={() => quitarAuditoria(e)}
                              disabled={isPending}
                            >
                              Quitar
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="rounded bg-amber-600 px-3 py-1 text-white"
                              onClick={() => marcarAuditoria(e)}
                              disabled={isPending}
                            >
                              Sustentar
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {equipos.length === 0 && !loading && (
              <tr>
                <td colSpan={16} className="p-4 text-center text-slate-500 dark:text-slate-400">
                  Sin resultados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
        <div>
          {loading ? "Cargando..." : `Mostrando ${equipos.length} de ${totalFiltered} filtrados`}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded border px-3 py-1 disabled:opacity-50"
            onClick={() => fetchList(false)}
            disabled={!hasMore || loading}
          >
            Ver mas
          </button>
        </div>
      </div>

      {ontModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-2xl">
            <div className="mb-3 border-b pb-2">
              <div className="text-base font-semibold">Movimiento ONT con materiales</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Se movera el equipo ONT junto con su kit base de materiales entre cuadrillas.
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border bg-slate-50 dark:bg-slate-800/60 p-3 text-sm">
                <div><span className="font-medium">SN:</span> <span className="font-mono">{ontModalRow?.SN || ontModalRow?.id || "-"}</span></div>
                <div><span className="font-medium">Origen:</span> {ontModalFromUb || "-"}</div>
                <div><span className="font-medium">Destino:</span> {ontModalToUb || "-"}</div>
                <div><span className="font-medium">Cuadrilla origen:</span> {ontModalFromCuadrillaId || "-"}</div>
                <div><span className="font-medium">Cuadrilla destino:</span> {ontModalToCuadrillaId || "-"}</div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="mb-1 font-medium">Kit ONT a mover</div>
                <div className="space-y-1 text-slate-500 dark:text-slate-400">
                  {Object.entries(ONT_MATERIAL_KIT).map(([id, qty]) => (
                    <div key={id} className="flex items-center justify-between">
                      <span>{id}</span>
                      <span className="font-medium">{qty} UND</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={ontModalWithPrecon}
                  onChange={(e) => {
                    setOntModalWithPrecon(e.target.checked);
                    if (!e.target.checked) setOntModalPreconId("");
                  }}
                />
                Mover tambien PRECON (1 UND)
              </label>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {ontPreconDisponibles.map((it) => (
                  <label
                    key={it.id}
                    className={`flex cursor-pointer items-center justify-between rounded border px-3 py-2 text-sm ${
                      ontModalWithPrecon && ontModalPreconId === it.id
                        ? "border-blue-600 bg-blue-50 dark:bg-blue-950/40"
                        : "border-slate-200 dark:border-slate-700"
                    } ${it.stock <= 0 ? "opacity-50" : ""}`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="precon"
                        disabled={!ontModalWithPrecon || it.stock <= 0}
                        checked={ontModalWithPrecon && ontModalPreconId === it.id}
                        onChange={() => setOntModalPreconId(it.id)}
                      />
                      <span>{it.id}</span>
                    </span>
                    <span className="font-medium">{ontModalLoading ? "..." : `${it.stock} UND`}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border px-3 py-2 text-sm"
                onClick={closeOntModal}
                disabled={isPending}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-60"
                onClick={confirmarMovimientoOnt}
                disabled={isPending || ontModalLoading}
              >
                Confirmar movimiento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}




