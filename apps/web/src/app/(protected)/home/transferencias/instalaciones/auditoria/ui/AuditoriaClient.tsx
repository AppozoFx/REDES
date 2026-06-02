"use client";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx-js-style";
import { toast } from "sonner";

type Auditoria = {
  requiere?: boolean;
  estado?: "pendiente" | "sustentada" | string;
  fotoPath?: string;
  fotoURL?: string;
  actualizadoEn?: any;
};

type EquipoRow = {
  id: string;
  SN?: string;
  equipo?: string;
  estado?: string;
  ubicacion?: string;
  cliente?: string;
  tecnicos?: string[] | string;
  observacion?: string;
  f_despacho?: any;
  f_despachoAt?: any;
  f_despachoYmd?: any;
  auditoria?: Auditoria;
  detalleInstalacion?: any;
};

type CuadrillaOpt = {
  id: string;
  nombre?: string;
  coordinadorUid?: string;
};

type CoordinadorOpt = {
  uid: string;
  label: string;
};

const FILL_MATCH_PRIMARY = { patternType: "solid", fgColor: { rgb: "FFFDE047" } };
const FILL_MATCH_SECONDARY = { patternType: "solid", fgColor: { rgb: "FFFED7AA" } };

function asStr(v: any) {
  return String(v || "").trim();
}

function toSN(v: any) {
  return asStr(v).toUpperCase();
}

function tsToDate(v: any) {
  if (!v) return null;
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof v?.toDate === "function") return v.toDate();
  if (typeof v?.seconds === "number") return new Date(v.seconds * 1000);
  if (typeof v?._seconds === "number") return new Date(v._seconds * 1000);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDate(v: any) {
  const d = tsToDate(v);
  if (!d) return "-";
  return d.toLocaleDateString("es-PE");
}

function fmtDateTime(v: any) {
  const d = tsToDate(v);
  if (!d) return "";
  return d.toLocaleString("es-PE");
}

function formatearFecha(v: any) {
  const d = tsToDate(v);
  if (!d) return "";
  const day = `${d.getDate()}`.padStart(2, "0");
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function parseIntSafe(v: any) {
  const n = parseInt(String(v ?? 0), 10);
  return Number.isNaN(n) ? 0 : n;
}

function valorONulo(v: any) {
  return v === undefined || v === null || v === "" ? "" : v;
}

function getFechaDespacho(e: EquipoRow) {
  return e?.f_despacho ?? e?.f_despachoAt ?? e?.f_despachoYmd ?? null;
}

function normalizePhone(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  const noPrefix = digits.startsWith("51") && digits.length >= 11 ? digits.slice(2) : digits;
  return noPrefix.length >= 9 ? noPrefix : "";
}

function addHyperlinksToColumn(ws: XLSX.WorkSheet, headerText: string) {
  const ref = ws["!ref"];
  if (!ref) return;
  const range = XLSX.utils.decode_range(ref);

  let colIndex: number | null = null;
  for (let c = 0; c <= range.e.c; c += 1) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    const cell = ws[addr];
    if (cell && String(cell.v) === headerText) {
      colIndex = c;
      break;
    }
  }
  if (colIndex == null) return;

  for (let r = 1; r <= range.e.r; r += 1) {
    const addr = XLSX.utils.encode_cell({ r, c: colIndex });
    const cell = ws[addr];
    if (cell && typeof cell.v === "string" && cell.v.startsWith("http")) {
      const url = cell.v;
      ws[addr] = { f: `HYPERLINK("${url}","Ver foto")`, v: "Ver foto" } as any;
    }
  }
}

function mergeFillStyle(cell: any, fill: any) {
  const next = cell || {};
  const s = typeof next.s === "object" && next.s ? next.s : {};
  next.s = { ...s, fill };
  return next;
}

function applyCellFill(ws: XLSX.WorkSheet, row0: number, col0: number, fill: any) {
  const addr = XLSX.utils.encode_cell({ r: row0, c: col0 });
  ws[addr] = mergeFillStyle(ws[addr], fill);
}

function highlightSnAuditoriaMatches(ws: XLSX.WorkSheet) {
  const ref = ws["!ref"];
  if (!ref) return;
  const range = XLSX.utils.decode_range(ref);
  const targets = new Set([
    "SN_Auditoria",
    "SN_ONT",
    "proid",
    "SN_MESH(1)",
    "SN_MESH(2)",
    "SN_MESH(3)",
    "SN_MESH(4)",
    "SN_BOX(1)",
    "SN_BOX(2)",
    "SN_BOX(3)",
    "SN_BOX(4)",
    "SN_FONO",
  ]);

  const headerMap = new Map<string, number>();
  for (let c = 0; c <= range.e.c; c += 1) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    const value = String(ws[addr]?.v || "").trim();
    if (targets.has(value)) headerMap.set(value, c);
  }

  const snAudCol = headerMap.get("SN_Auditoria");
  if (snAudCol == null) return;

  const compareCols = [
    "SN_ONT",
    "proid",
    "SN_MESH(1)",
    "SN_MESH(2)",
    "SN_MESH(3)",
    "SN_MESH(4)",
    "SN_BOX(1)",
    "SN_BOX(2)",
    "SN_BOX(3)",
    "SN_BOX(4)",
    "SN_FONO",
  ]
    .map((key) => headerMap.get(key))
    .filter((c): c is number => c != null);

  for (let r = 1; r <= range.e.r; r += 1) {
    const snAddr = XLSX.utils.encode_cell({ r, c: snAudCol });
    const sn = toSN(ws[snAddr]?.v);
    if (!sn) continue;

    let matched = false;
    for (const col of compareCols) {
      const addr = XLSX.utils.encode_cell({ r, c: col });
      if (toSN(ws[addr]?.v) !== sn) continue;
      matched = true;
      applyCellFill(ws, r, col, FILL_MATCH_SECONDARY);
    }
    if (matched) applyCellFill(ws, r, snAudCol, FILL_MATCH_PRIMARY);
  }
}

export default function AuditoriaClient({ canEdit }: { canEdit: boolean }) {
  const [viewerUid, setViewerUid] = useState("");
  const [isCoordViewer, setIsCoordViewer] = useState(false);
  const [modo, setModo] = useState<"campo" | "instalados">("campo");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<EquipoRow[]>([]);
  const [obsDraft, setObsDraft] = useState<Record<string, string>>({});

  const [filtroEstadoAud, setFiltroEstadoAud] = useState("todos");
  const [filtroEstadoGeneral, setFiltroEstadoGeneral] = useState("todos");
  const [filtroUbicacion, setFiltroUbicacion] = useState("todas");
  const [filtroCoordinadorUid, setFiltroCoordinadorUid] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const [fileName, setFileName] = useState("");
  const [snExcel, setSnExcel] = useState<string[]>([]);
  const [snAnalisis, setSnAnalisis] = useState<{
    total: number;
    encontrados: number;
    noEncontrados: string[];
  } | null>(null);
  const [avisosPorUbicacion, setAvisosPorUbicacion] = useState<Record<string, boolean>>({});
  const [coordinadores, setCoordinadores] = useState<CoordinadorOpt[]>([]);
  const [cuadrillas, setCuadrillas] = useState<CuadrillaOpt[]>([]);
  const [sendingWsp, setSendingWsp] = useState(false);
  const [subiendoId, setSubiendoId] = useState("");

  const [fotoModal, setFotoModal] = useState<{ open: boolean; url: string; sn: string }>({
    open: false,
    url: "",
    sn: "",
  });

  // ── Shared UI classes ──
  const fieldClass =
    "h-9 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-blue-900/40";
  const btnSoftClass =
    "inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700";
  const btnPrimaryClass =
    "inline-flex items-center gap-1.5 rounded-xl bg-[#30518c] px-3 py-2 text-xs font-medium text-white shadow-[0_2px_8px_rgba(48,81,140,.25)] transition hover:bg-[#2b4880] disabled:opacity-50";
  const btnSuccessClass =
    "inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50";

  async function cargar(nextMode = modo) {
    setLoading(true);
    try {
      const res = await fetch(`/api/instalaciones/auditoria/list?mode=${encodeURIComponent(nextMode)}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      const items = (Array.isArray(body.items) ? body.items : []) as EquipoRow[];
      setRows(items);
      setObsDraft((prev) => {
        const next = { ...prev };
        for (const r of items) {
          if (next[r.id] === undefined) next[r.id] = asStr(r.observacion);
        }
        return next;
      });
    } catch (e: any) {
      toast.error(e?.message || "No se pudo cargar auditoria");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo]);

  useEffect(() => {
    (async () => {
      try {
        const [resMe, resCoord, resCuad] = await Promise.all([
          fetch("/api/auth/me", { cache: "no-store" }),
          fetch("/api/usuarios/by-role?role=COORDINADOR", { cache: "no-store" }),
          fetch("/api/cuadrillas/list?area=INSTALACIONES", { cache: "no-store" }),
        ]);
        const bMe = await resMe.json().catch(() => ({}));
        const bCoord = await resCoord.json().catch(() => ({}));
        const bCuad = await resCuad.json().catch(() => ({}));
        const uid = asStr(bMe?.uid);
        const roles = Array.isArray(bMe?.roles) ? bMe.roles.map((r: any) => asStr(r).toUpperCase()) : [];
        const isCoord = roles.includes("COORDINADOR") && !Boolean(bMe?.isAdmin);
        setViewerUid(uid);
        setIsCoordViewer(isCoord);

        const allCoords = Array.isArray(bCoord?.items) ? bCoord.items : [];
        const scopedCoords = isCoord ? allCoords.filter((c: any) => asStr(c?.uid) === uid) : allCoords;
        setCoordinadores(scopedCoords);
        setCuadrillas(Array.isArray(bCuad?.items) ? bCuad.items : []);

        if (isCoord && uid) {
          setFiltroCoordinadorUid(uid);
        }
      } catch {
        // noop
      }
    })();
  }, []);

  const baseParaListas = useMemo(() => {
    let out = [...rows];
    if (filtroEstadoAud !== "todos") {
      out = out.filter((r) => asStr(r.auditoria?.estado) === filtroEstadoAud);
    }
    return out;
  }, [rows, filtroEstadoAud]);

  const coordinadorByUbicacion = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of cuadrillas) {
      const nombre = asStr(c?.nombre).toUpperCase();
      const uid = asStr(c?.coordinadorUid);
      if (nombre && uid) map.set(nombre, uid);
    }
    return map;
  }, [cuadrillas]);

  const rowsConFiltroCoordinador = useMemo(() => {
    if (!filtroCoordinadorUid) return baseParaListas;
    return baseParaListas.filter((r) => {
      const ub = asStr(r.ubicacion).toUpperCase();
      return asStr(coordinadorByUbicacion.get(ub)) === filtroCoordinadorUid;
    });
  }, [baseParaListas, filtroCoordinadorUid, coordinadorByUbicacion]);

  const kpis = useMemo(() => {
    const total = baseParaListas.length;
    const pend = baseParaListas.filter((r) => asStr(r.auditoria?.estado || "pendiente") !== "sustentada").length;
    const sust = baseParaListas.filter((r) => asStr(r.auditoria?.estado) === "sustentada").length;
    return { total, pend, sust };
  }, [baseParaListas]);

  const avance = useMemo(() => {
    if (kpis.total <= 0) return 0;
    return Math.round((kpis.sust / kpis.total) * 1000) / 10;
  }, [kpis]);

  const ubicacionesDisponibles = useMemo(() => {
    return Array.from(new Set(rowsConFiltroCoordinador.map((r) => asStr(r.ubicacion)).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [rowsConFiltroCoordinador]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`auditoria_inst_avisos_${modo}`);
      if (!raw) {
        setAvisosPorUbicacion({});
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      setAvisosPorUbicacion(parsed && typeof parsed === "object" ? parsed : {});
    } catch {
      setAvisosPorUbicacion({});
    }
  }, [modo]);

  useEffect(() => {
    try {
      window.localStorage.setItem(`auditoria_inst_avisos_${modo}`, JSON.stringify(avisosPorUbicacion));
    } catch {
      // noop
    }
  }, [avisosPorUbicacion, modo]);

  const estadosGenerales = useMemo(() => {
    return Array.from(new Set(rowsConFiltroCoordinador.map((r) => asStr(r.estado)).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [rowsConFiltroCoordinador]);

  const equiposFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const filtrados = rowsConFiltroCoordinador.filter((r) => {
      const okUb = filtroUbicacion === "todas" ? true : asStr(r.ubicacion) === filtroUbicacion;
      const okEstado = filtroEstadoGeneral === "todos" ? true : asStr(r.estado) === filtroEstadoGeneral;
      const okQ =
        !q ||
        asStr(r.SN).toLowerCase().includes(q) ||
        asStr(r.equipo).toLowerCase().includes(q) ||
        asStr(r.ubicacion).toLowerCase().includes(q) ||
        asStr(r.cliente).toLowerCase().includes(q);
      return okUb && okEstado && okQ;
    });
    return filtrados.sort((a, b) => {
      const da = tsToDate(modo === "instalados" ? a.detalleInstalacion?.fechaInstalacion : getFechaDespacho(a))?.getTime() ?? Number.POSITIVE_INFINITY;
      const db = tsToDate(modo === "instalados" ? b.detalleInstalacion?.fechaInstalacion : getFechaDespacho(b))?.getTime() ?? Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      return asStr(a.SN || a.id).localeCompare(asStr(b.SN || b.id));
    });
  }, [rowsConFiltroCoordinador, busqueda, filtroEstadoGeneral, filtroUbicacion, modo]);

  const statsByUbicacion = useMemo(() => {
    const map = new Map<string, { total: number; sust: number; pend: number }>();
    for (const r of rowsConFiltroCoordinador) {
      const ub = asStr(r.ubicacion);
      if (!ub) continue;
      const cur = map.get(ub) || { total: 0, sust: 0, pend: 0 };
      const estadoAud = asStr(r.auditoria?.estado || "pendiente");
      cur.total += 1;
      if (estadoAud === "sustentada") cur.sust += 1;
      else cur.pend += 1;
      map.set(ub, cur);
    }
    return map;
  }, [rowsConFiltroCoordinador]);

  const hasFiltros =
    filtroEstadoAud !== "todos" ||
    filtroEstadoGeneral !== "todos" ||
    filtroUbicacion !== "todas" ||
    !!filtroCoordinadorUid ||
    !!busqueda.trim();
  const totalUbicaciones = ubicacionesDisponibles.length;
  const ubicacionesAvisadas = ubicacionesDisponibles.filter((u) => !!avisosPorUbicacion[u]).length;
  const ubicacionesPendientes = Math.max(0, totalUbicaciones - ubicacionesAvisadas);

  async function onFile(file: File) {
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rowsExcel = XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[];
      const sns = Array.from(
        new Set(
          rowsExcel
            .map((r) => toSN(r.SN ?? r.sn ?? r.Sn ?? r["sn "] ?? r["SN "]))
            .filter(Boolean)
        )
      );
      if (!sns.length) {
        setFileName("");
        setSnExcel([]);
        toast.error("No se encontraron SN validos en el Excel");
        return;
      }
      setFileName(file.name);
      setSnExcel(sns);
      setSnAnalisis(null);
      toast.success(`Leidos ${sns.length} SN`);
    } catch {
      toast.error("No se pudo leer el Excel");
    }
  }

  function analizarSN() {
    if (!snExcel.length) {
      toast.error("Primero carga un Excel");
      return;
    }
    setSaving(true);
    fetch("/api/instalaciones/auditoria/mutate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "analizar_sns", sns: snExcel }),
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
        const total = Number(body?.total || snExcel.length);
        const encontrados = Number(body?.encontrados || 0);
        const noEncontrados = Array.isArray(body?.noEncontrados) ? body.noEncontrados.map((x: any) => asStr(x)).filter(Boolean) : [];
        setSnAnalisis({ total, encontrados, noEncontrados });
        toast.success(`Analisis listo: ${encontrados} encontrados, ${noEncontrados.length} no encontrados`);
      })
      .catch((e: any) => {
        toast.error(e?.message || "No se pudo analizar SN");
      })
      .finally(() => {
        setSaving(false);
      });
  }

  async function guardarObservaciones() {
    if (!canEdit) return;
    const changes: Array<{ id: string; observacion: string }> = [];
    for (const r of rows) {
      const nuevo = asStr(obsDraft[r.id]);
      const actual = asStr(r.observacion);
      if (nuevo !== actual) changes.push({ id: r.id, observacion: nuevo });
    }
    if (!changes.length) {
      toast.message("No hay cambios por guardar");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/instalaciones/auditoria/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_observaciones", changes }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      setRows((prev) => prev.map((r) => ({ ...r, observacion: asStr(obsDraft[r.id]) })));
      toast.success(`Observaciones guardadas (${body.saved || changes.length})`);
    } catch (e: any) {
      toast.error(e?.message || "No se pudieron guardar observaciones");
    } finally {
      setSaving(false);
    }
  }

  async function marcarMasivo() {
    if (!canEdit) return;
    if (!snExcel.length) return toast.error("Primero carga un Excel");
    if (!snAnalisis) return toast.error("Primero analiza los SN cargados");
    setSaving(true);
    try {
      const res = await fetch("/api/instalaciones/auditoria/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "marcar_masivo", sns: snExcel }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      if (Array.isArray(body?.notFound) && body.notFound.length) {
        toast.message(`No encontrados: ${body.notFound.length}`);
      }
      setSnExcel([]);
      setFileName("");
      setSnAnalisis(null);
      await cargar();
      toast.success(`Marcado masivo completado (${body.saved || 0})`);
    } catch (e: any) {
      toast.error(e?.message || "Fallo el marcado masivo");
    } finally {
      setSaving(false);
    }
  }

  async function limpiarUno(r: EquipoRow) {
    if (!canEdit) return;
    setSaving(true);
    try {
      const res = await fetch("/api/instalaciones/auditoria/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "limpiar_uno", id: r.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      setRows((prev) => prev.filter((x) => x.id !== r.id));
      toast.success(`SN ${asStr(r.SN) || r.id}: auditoria limpiada`);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo limpiar");
    } finally {
      setSaving(false);
    }
  }

  async function nuevaAuditoria() {
    if (!canEdit) return;
    if (!window.confirm(`Esto limpiara la auditoria de ${rows.length} equipos. Continuar?`)) return;
    setSaving(true);
    try {
      const res = await fetch("/api/instalaciones/auditoria/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "nueva_auditoria" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      await cargar();
      toast.success(`Nueva auditoria lista. Limpiados: ${body.cleaned || 0}`);
    } catch (e: any) {
      toast.error(e?.message || "Error al limpiar auditoria");
    } finally {
      setSaving(false);
    }
  }

  async function subirFoto(r: EquipoRow, file: File, marcarSustentado: boolean) {
    if (!canEdit) return;
    setSubiendoId(r.id);
    try {
      const fd = new FormData();
      fd.set("equipoId", r.id);
      fd.set("marcarSustentado", marcarSustentado ? "true" : "false");
      fd.set("file", file);
      const res = await fetch("/api/instalaciones/auditoria/photo", { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      setRows((prev) =>
        prev.map((x) =>
          x.id === r.id
            ? {
                ...x,
                auditoria: {
                  ...(x.auditoria || {}),
                  requiere: true,
                  estado: body.estado || x.auditoria?.estado || "pendiente",
                  fotoPath: body.fotoPath,
                  fotoURL: body.fotoURL,
                  actualizadoEn: new Date().toISOString(),
                },
              }
            : x
        )
      );
      toast.success(marcarSustentado ? `SN ${asStr(r.SN)} sustentado` : "Foto actualizada");
    } catch (e: any) {
      toast.error(e?.message || "No se pudo subir foto");
    } finally {
      setSubiendoId("");
    }
  }

  function exportManifest() {
    if (!equiposFiltrados.length) {
      toast.error("No hay filas para exportar");
      return;
    }
    if (modo === "campo") {
      const header = ["SN", "Equipo", "F. Despacho", "Tecnicos", "Ubicacion", "Estado", "Auditoria", "Observacion", "FotoURL"];
      const data = equiposFiltrados.map((e) => [
        asStr(e.SN || e.id),
        asStr(e.equipo),
        fmtDate(getFechaDespacho(e)),
        Array.isArray(e.tecnicos) ? e.tecnicos.join(", ") : asStr(e.tecnicos),
        asStr(e.ubicacion),
        asStr(e.estado),
        asStr(e.auditoria?.estado || "pendiente"),
        asStr(e.observacion),
        asStr(e.auditoria?.fotoURL),
      ]);
      const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
      addHyperlinksToColumn(ws, "FotoURL");
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "AUDITORIA_CAMPO");
      XLSX.writeFile(wb, `AUDITORIA-CAMPO-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success("Exportado (campo)");
      return;
    }

    const dataInstalados = equiposFiltrados.map((e, idx) => {
      const l = e.detalleInstalacion || {};
      const fecha = tsToDate(l.fechaInstalacion);
      const cat5 = parseIntSafe(l.cat5e);
      const cat6 = parseIntSafe(l.cat6);
      const puntos = cat5 + cat6;
      const planTxt = asStr(l.planGamer);
      const kitTxt = asStr(l.kitWifiPro);
      const esGamer = planTxt.toUpperCase() === "GAMER" || planTxt.toUpperCase().includes("GAMER");
      const esKit = kitTxt.toUpperCase() === "KIT WIFI PRO (AL CONTADO)";
      const actaVal = Array.isArray(l.acta) ? l.acta.filter(Boolean).join(", ") : valorONulo(l.acta);

      let obsContrata = "";
      if (cat5 > 0) {
        const extras: string[] = [];
        if (esGamer) extras.push("Se realizo Plan Gamer Cat.6");
        if (esKit) extras.push("KIT WIFI PRO");
        obsContrata = `Se realizo ${cat5} Cableado UTP Cat.5e${extras.length ? ` + ${extras.join(" + ")}` : ""}`;
      } else {
        const extras: string[] = [];
        if (esGamer) extras.push("Se realizo Plan Gamer Cat.6");
        if (esKit) extras.push("KIT WIFI PRO");
        obsContrata = extras.join(" + ");
      }

      const snMESH = (Array.isArray(l.snMESH) ? l.snMESH : []).filter(Boolean);
      const snBOX = (Array.isArray(l.snBOX) ? l.snBOX : []).filter(Boolean);
      const meshCols = {
        "SN_MESH(1)": valorONulo(snMESH[0]),
        "SN_MESH(2)": valorONulo(snMESH[1]),
        "SN_MESH(3)": valorONulo(snMESH[2]),
        "SN_MESH(4)": valorONulo(snMESH[3]),
      };
      const boxCols = {
        "SN_BOX(1)": valorONulo(snBOX[0]),
        "SN_BOX(2)": valorONulo(snBOX[1]),
        "SN_BOX(3)": valorONulo(snBOX[2]),
        "SN_BOX(4)": valorONulo(snBOX[3]),
      };
      const cantidadMesh = [snMESH[0], snMESH[1], snMESH[2], snMESH[3]].filter(Boolean).length;
      const cat5Cell = cat5 === 0 ? "" : cat5;
      const cat6Cell = cat6 === 0 ? "" : cat6;
      const puntosCell = puntos === 0 ? "" : puntos;
      const cableadoUTP = puntos > 0 ? puntos * 25 : "";

      return {
        "N°": idx + 1,
        SN_Auditoria: valorONulo(e.SN || e.id),
        "Fecha Instalación": formatearFecha(fecha),
        "Tipo de Servicio": "INSTALACION",
        "Nombre de Partida": "Ultima Milla",
        Cuadrilla: valorONulo(l.cuadrillaNombre),
        Acta: actaVal,
        "Codigo Cliente": valorONulo(l.codigoCliente),
        Documento: valorONulo(l.documento),
        Cliente: valorONulo(l.cliente || e.cliente),
        Direccion: valorONulo(l.direccion),
        "Tipo Orden": valorONulo(l.tipoOrden),
        Plan: valorONulo(l.plan),
        SN_ONT: valorONulo(l.snONT),
        proid: valorONulo(l.proidONT ?? l.proid),
        ...meshCols,
        ...boxCols,
        SN_FONO: valorONulo(l.snFONO),
        metraje_instalado: valorONulo(l.metraje_instalado ?? l.metrajeInstalado),
        "Cantidad mesh": cantidadMesh,
        rotuloNapCto: valorONulo(l.rotuloNapCto),
        "Observacion de la contrata": obsContrata || "",
        "Cableado UTP (MTS)": cableadoUTP,
        Observacion: valorONulo(l.observacion),
        "Plan Gamer": valorONulo(l.planGamer),
        KitWifiPro: valorONulo(l.kitWifiPro),
        "Servicio Cableado Mesh": valorONulo(l.servicioCableadoMesh),
        Cat5e: cat5Cell,
        Cat6: cat6Cell,
        "Puntos UTP": puntosCell,
        "Estado Auditoria": asStr(e.auditoria?.estado || "pendiente"),
        "Observacion Auditoria": valorONulo(obsDraft[e.id] ?? e.observacion),
        "FotoURL Auditoria": asStr(e.auditoria?.fotoURL),
      };
    });
    const wsInstalados = XLSX.utils.json_to_sheet(dataInstalados);
    highlightSnAuditoriaMatches(wsInstalados);
    addHyperlinksToColumn(wsInstalados, "FotoURL Auditoria");
    const wbInstalados = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbInstalados, wsInstalados, "AUDITORIA_INSTALADOS");
    XLSX.writeFile(wbInstalados, `AUDITORIA-INSTALADOS-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Exportado (instalados)");
    return;

    const data = equiposFiltrados.map((e, idx) => {
      const l = e.detalleInstalacion || {};
      return {
        "N°": idx + 1,
        SN_Auditoria: asStr(e.SN || e.id),
        "Fecha Instalacion": fmtDate(l.fechaInstalacion),
        Cuadrilla: asStr(l.cuadrillaNombre),
        Cliente: asStr(l.cliente || e.cliente),
        Direccion: asStr(l.direccion),
        Plan: asStr(l.plan),
        SN_ONT: asStr(l.snONT),
        SN_FONO: asStr(l.snFONO),
        "Estado Auditoria": asStr(e.auditoria?.estado || "pendiente"),
        "Observacion Auditoria": asStr(obsDraft[e.id] ?? e.observacion),
        "FotoURL Auditoria": asStr(e.auditoria?.fotoURL),
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    addHyperlinksToColumn(ws, "FotoURL Auditoria");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "AUDITORIA_INSTALADOS");
    XLSX.writeFile(wb, `AUDITORIA-INSTALADOS-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Exportado (instalados)");
  }

  function descargarPlantillaSN() {
    const header = ["SN"];
    const ejemplos = [["FHTT12345678"], ["FHTT87654321"]];
    const ws = XLSX.utils.aoa_to_sheet([header, ...ejemplos]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PLANTILLA_SN");
    XLSX.writeFile(wb, "PLANTILLA-AUDITORIA-SN.xlsx");
    toast.success("Plantilla descargada");
  }

  function exportNoEncontrados() {
    if (!snAnalisis?.noEncontrados?.length) {
      toast.error("No hay SN no encontrados para exportar");
      return;
    }
    const data = snAnalisis.noEncontrados.map((sn, idx) => ({
      N: idx + 1,
      SN: sn,
      Estado: "NO_ENCONTRADO",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "NO_ENCONTRADOS");
    XLSX.writeFile(wb, `AUDITORIA-SN-NO-ENCONTRADOS-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Exportado no encontrados");
  }

  async function enviarWspCuadrillaSeleccionada() {
    if (!filtroCoordinadorUid) {
      toast.error("Selecciona un coordinador");
      return;
    }
    if (filtroUbicacion === "todas") {
      toast.error("Selecciona una cuadrilla/ubicacion");
      return;
    }

    const cuadrilla = asStr(filtroUbicacion);
    const filas = rowsConFiltroCoordinador.filter((r) => asStr(r.ubicacion) === cuadrilla);
    if (!filas.length) {
      toast.error("No hay equipos para enviar");
      return;
    }

    setSendingWsp(true);
    const preWin = window.open("about:blank", "_blank");
    try {
      const res = await fetch(`/api/usuarios/phones?uids=${encodeURIComponent(filtroCoordinadorUid)}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      const celularRaw = Array.isArray(body?.items) ? String(body.items[0]?.celular || "") : "";
      const celular = normalizePhone(celularRaw);
      if (!celular) throw new Error("El coordinador no tiene celular registrado");

      const header = "SN                  Equipo      F. Despacho";
      const lines = filas.slice(0, 200).map((r) => {
        const sn = asStr(r.SN || r.id).padEnd(20, " ").slice(0, 20);
        const eq = asStr(r.equipo).padEnd(10, " ").slice(0, 10);
        const fd = fmtDate(getFechaDespacho(r));
        return `${sn} ${eq} ${fd}`;
      });
      const coordLabel = coordinadores.find((c) => c.uid === filtroCoordinadorUid)?.label || "Coordinador";
      const msg = [
        `${cuadrilla} (${coordLabel})`,
        header,
        ...lines,
        `Total: ${filas.length}`,
      ].join("\n");

      const url = `https://wa.me/51${celular}?text=${encodeURIComponent(msg)}`;
      if (preWin && !preWin.closed) {
        preWin.location.href = url;
        preWin.focus();
      } else {
        const win = window.open(url, "_blank");
        if (!win) window.location.href = url;
      }
      toast.success("Abriendo WhatsApp");
    } catch (e: any) {
      if (preWin && !preWin.closed) preWin.close();
      toast.error(e?.message || "No se pudo abrir WhatsApp");
    } finally {
      setSendingWsp(false);
    }
  }

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Banner solo lectura ── */}
      {!canEdit && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-300">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Perfil en solo lectura: puedes visualizar la auditoría sin realizar cambios.
        </div>
      )}

      {/* ── KPI + Mode toggle ── */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-700">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#30518c]/10 dark:bg-[#30518c]/20">
              <svg className="h-4 w-4 text-[#30518c] dark:text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                <rect x="9" y="3" width="6" height="4" rx="1" />
                <path d="M9 12h6M9 16h4" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Control de Auditoría</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Seguimiento de equipos pendientes y sustentados</p>
            </div>
          </div>
          {/* Mode pill toggle */}
          <div className="inline-flex rounded-full bg-slate-100 p-1 text-xs dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setModo("campo")}
              className={`rounded-full px-4 py-1.5 font-medium transition ${
                modo === "campo"
                  ? "bg-white text-slate-800 shadow dark:bg-slate-700 dark:text-slate-100"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              Equipos en campo
            </button>
            <button
              type="button"
              onClick={() => setModo("instalados")}
              className={`rounded-full px-4 py-1.5 font-medium transition ${
                modo === "instalados"
                  ? "bg-white text-slate-800 shadow dark:bg-slate-700 dark:text-slate-100"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              Equipos instalados
            </button>
          </div>
        </div>

        {/* KPI cards — grid dividido por líneas */}
        <div className="grid grid-cols-2 gap-px bg-slate-100 md:grid-cols-4 dark:bg-slate-700/60">
          <div className="bg-white px-5 py-4 dark:bg-slate-900">
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">En auditoría</p>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                <svg className="h-3.5 w-3.5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
              </div>
            </div>
            <p className="mt-2 text-3xl font-bold tracking-tight">{kpis.total}</p>
          </div>

          <div className="bg-amber-50/80 px-5 py-4 dark:bg-slate-900">
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">Pendientes</p>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
                <svg className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
            </div>
            <p className="mt-2 text-3xl font-bold tracking-tight text-amber-700 dark:text-amber-300">{kpis.pend}</p>
          </div>

          <div className="bg-emerald-50/80 px-5 py-4 dark:bg-slate-900">
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Sustentadas</p>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
                <svg className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
            </div>
            <p className="mt-2 text-3xl font-bold tracking-tight text-emerald-700 dark:text-emerald-300">{kpis.sust}</p>
          </div>

          <div className="bg-white px-5 py-4 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Avance</p>
              <span className="text-xl font-bold text-[#30518c] dark:text-blue-400">{avance}%</span>
            </div>
            <div className="mt-3">
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className="h-full rounded-full bg-[#30518c] transition-all duration-500 dark:bg-blue-500"
                  style={{ width: `${Math.max(0, Math.min(100, avance))}%` }}
                />
              </div>
              <p className="mt-1 text-right text-[11px] text-slate-400 dark:text-slate-500">
                {kpis.sust} / {kpis.total} equipos
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Avisos por cuadrilla ── */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-700">
          <div>
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Avisos por cuadrilla</p>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Avisadas: <strong>{ubicacionesAvisadas}</strong>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Pendientes: <strong>{ubicacionesPendientes}</strong>
              </span>
              <span>Total: <strong>{totalUbicaciones}</strong></span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btnSoftClass}
              onClick={() => {
                const next: Record<string, boolean> = {};
                for (const u of ubicacionesDisponibles) next[u] = true;
                setAvisosPorUbicacion(next);
              }}
              disabled={!ubicacionesDisponibles.length}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Marcar todas
            </button>
            <button
              type="button"
              className={btnSoftClass}
              onClick={() => setAvisosPorUbicacion({})}
              disabled={!ubicacionesDisponibles.length}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              Limpiar marcas
            </button>
          </div>
        </div>

        <div className="p-4">
          {!ubicacionesDisponibles.length ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">No hay ubicaciones disponibles para marcar.</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {ubicacionesDisponibles.map((u) => {
                const checked = !!avisosPorUbicacion[u];
                const st = statsByUbicacion.get(u) || { total: 0, sust: 0, pend: 0 };
                return (
                  <label
                    key={u}
                    className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2.5 transition-colors ${
                      checked
                        ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-800/60 dark:bg-emerald-900/20"
                        : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{u}</p>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px]">
                        <span className="text-emerald-600 dark:text-emerald-400">✓ {st.sust}</span>
                        <span className="text-amber-600 dark:text-amber-400">⏳ {st.pend}</span>
                        <span className="text-slate-400">• {st.total}</span>
                      </div>
                    </div>
                    <div className="ml-3 flex items-center gap-2">
                      <span className={`text-[11px] font-medium ${checked ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}>
                        {checked ? "Avisada" : "Pendiente"}
                      </span>
                      <div className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition ${checked ? "border-emerald-500 bg-emerald-500" : "border-slate-300 dark:border-slate-600"}`}>
                        {checked && (
                          <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5}>
                            <polyline points="10 3 5 9 2 6" />
                          </svg>
                        )}
                      </div>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setAvisosPorUbicacion((prev) => ({ ...prev, [u]: e.target.checked }))}
                        className="sr-only"
                      />
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── Filtros + Acciones + Carga masiva ── */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">

        {/* Filtros */}
        <div className="border-b border-slate-100 p-4 dark:border-slate-700">
          <div className="grid gap-3 md:grid-cols-5">
            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Estado auditoría</label>
              <div className="relative">
                <select className={fieldClass} value={filtroEstadoAud} onChange={(e) => setFiltroEstadoAud(e.target.value)}>
                  <option value="todos">Todos</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="sustentada">Sustentada</option>
                </select>
                <svg className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="6 9 12 15 18 9" /></svg>
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Estado general</label>
              <div className="relative">
                <select className={fieldClass} value={filtroEstadoGeneral} onChange={(e) => setFiltroEstadoGeneral(e.target.value)}>
                  <option value="todos">Todos</option>
                  {estadosGenerales.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <svg className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="6 9 12 15 18 9" /></svg>
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Ubicación</label>
              <div className="relative">
                <select className={fieldClass} value={filtroUbicacion} onChange={(e) => setFiltroUbicacion(e.target.value)}>
                  <option value="todas">Todas</option>
                  {ubicacionesDisponibles.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <svg className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="6 9 12 15 18 9" /></svg>
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Buscar</label>
              <div className="relative">
                <svg className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                <input
                  className={fieldClass + " pl-8"}
                  placeholder="SN, equipo, ubicación…"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Coordinador</label>
              <div className="relative">
                <select
                  className={fieldClass + (isCoordViewer ? " cursor-not-allowed opacity-60" : "")}
                  value={filtroCoordinadorUid}
                  onChange={(e) => setFiltroCoordinadorUid(e.target.value)}
                  disabled={isCoordViewer}
                >
                  {!isCoordViewer && <option value="">Todos</option>}
                  {coordinadores.map((c) => <option key={c.uid} value={c.uid}>{c.label}</option>)}
                </select>
                <svg className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="6 9 12 15 18 9" /></svg>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              Mostrando
              <span className="font-semibold text-slate-700 dark:text-slate-200">{equiposFiltrados.length}</span>
              de
              <span className="font-semibold text-slate-700 dark:text-slate-200">{rowsConFiltroCoordinador.length}</span>
              equipos
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={btnSoftClass}
                onClick={() => {
                  setFiltroEstadoAud("todos");
                  setFiltroEstadoGeneral("todos");
                  setFiltroUbicacion("todas");
                  setFiltroCoordinadorUid(isCoordViewer ? viewerUid : "");
                  setBusqueda("");
                }}
                disabled={!hasFiltros}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                Limpiar filtros
              </button>
              <button type="button" onClick={() => void cargar()} className={btnSoftClass} disabled={loading}>
                <svg className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
                {loading ? "Cargando…" : "Actualizar"}
              </button>
              <button type="button" onClick={exportManifest} className={btnPrimaryClass}>
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                Exportar Excel
              </button>
              <button
                type="button"
                onClick={enviarWspCuadrillaSeleccionada}
                disabled={sendingWsp || !filtroCoordinadorUid || filtroUbicacion === "todas"}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-medium text-white transition hover:bg-emerald-600 disabled:opacity-50"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.5 0C5.149 0 0 5.149 0 11.5c0 2.038.535 3.95 1.47 5.604L0 23l6.062-1.449A11.452 11.452 0 0 0 11.5 23C17.851 23 23 17.851 23 11.5S17.851 0 11.5 0z"/></svg>
                {sendingWsp ? "Enviando…" : "Enviar WSP"}
              </button>
            </div>
          </div>
        </div>

        {/* Acciones de edición */}
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/40">
            <button type="button" onClick={guardarObservaciones} className={btnSuccessClass} disabled={saving}>
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>
              Guardar cambios
            </button>
            <button
              type="button"
              onClick={nuevaAuditoria}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-700 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-600 dark:hover:bg-slate-500"
              disabled={saving}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
              Nueva auditoría
            </button>
          </div>
        )}

        {/* Carga masiva por SN */}
        {canEdit && (
          <div className="p-4">
            <div className="rounded-2xl border-2 border-dashed border-slate-200 p-4 dark:border-slate-700">
              <div className="mb-3 flex items-center gap-2">
                <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Carga masiva por SN</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={descargarPlantillaSN} className={btnSoftClass}>
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                  Plantilla
                </button>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-emerald-700">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                  Cargar Excel (SN)
                  <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
                </label>
                <button type="button" onClick={analizarSN} disabled={!snExcel.length || saving} className={btnSoftClass}>
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                  Analizar SN
                </button>
                <button
                  type="button"
                  onClick={marcarMasivo}
                  disabled={!snExcel.length || saving || !snAnalisis}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-fuchsia-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-fuchsia-700 disabled:opacity-50"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>
                  Marcar SN {snExcel.length ? `(${snExcel.length})` : ""}
                </button>
                {fileName && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                    {fileName}
                  </span>
                )}
              </div>

              {snAnalisis && (
                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl border border-slate-200 bg-white p-3 text-center dark:border-slate-700 dark:bg-slate-900">
                      <p className="text-lg font-bold">{snAnalisis.total}</p>
                      <p className="text-xs text-slate-500">Total</p>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center dark:border-emerald-800/60 dark:bg-emerald-900/20">
                      <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{snAnalisis.encontrados}</p>
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">Encontrados</p>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center dark:border-amber-700/60 dark:bg-amber-900/20">
                      <p className="text-lg font-bold text-amber-700 dark:text-amber-300">{snAnalisis.noEncontrados.length}</p>
                      <p className="text-xs text-amber-600 dark:text-amber-400">No encontrados</p>
                    </div>
                  </div>
                  {snAnalisis.noEncontrados.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Detalle de SN no encontrados</p>
                        <button type="button" onClick={exportNoEncontrados} className={btnSoftClass}>
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                          Descargar lista
                        </button>
                      </div>
                      <div className="max-h-32 overflow-auto rounded-xl border border-amber-200 bg-amber-50 p-3 font-mono text-xs text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-300">
                        {snAnalisis.noEncontrados.join(", ")}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── Tabla de equipos ── */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-16 text-slate-400 dark:text-slate-500">
            <svg className="h-8 w-8 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
              <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="3" />
            </svg>
            <p className="text-sm">Cargando auditoría…</p>
          </div>
        ) : (
          <div className="max-h-[75vh] overflow-auto">
            <table className="min-w-[1180px] text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800">
                <tr>
                  {[
                    "SN",
                    "Equipo",
                    modo === "instalados" ? "F. Instalación" : "F. Despacho",
                    modo === "instalados" ? "Cliente" : "Técnicos",
                    "Estado",
                    modo === "instalados" ? "Dirección" : "Ubicación",
                    "Auditoría",
                    "Foto",
                    "Observación",
                    "Acciones",
                  ].map((h, i) => (
                    <th
                      key={h}
                      className={`px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 ${
                        i === 9 ? "text-right" : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {equiposFiltrados.map((r, idx) => {
                  const liq = r.detalleInstalacion || {};
                  const estadoAud = asStr(r.auditoria?.estado || "pendiente");
                  const pendiente = estadoAud !== "sustentada";
                  return (
                    <tr
                      key={r.id}
                      className={`transition-colors hover:bg-blue-50/40 dark:hover:bg-blue-900/10 ${
                        idx % 2 !== 0 ? "bg-slate-50/40 dark:bg-slate-800/10" : ""
                      }`}
                    >
                      <td className="px-3 py-2.5">
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {asStr(r.SN || r.id)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{asStr(r.equipo) || "—"}</td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">
                        {modo === "instalados" ? fmtDate(liq.fechaInstalacion) : fmtDate(getFechaDespacho(r))}
                      </td>
                      <td className="px-3 py-2.5 max-w-[140px] truncate text-slate-600 dark:text-slate-400">
                        {modo === "instalados"
                          ? asStr(liq.cliente || r.cliente) || "—"
                          : Array.isArray(r.tecnicos)
                          ? r.tecnicos.join(", ")
                          : asStr(r.tecnicos) || "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        {asStr(r.estado) ? (
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {asStr(r.estado)}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">
                        {modo === "instalados" ? asStr(liq.direccion) || "—" : asStr(r.ubicacion) || "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            pendiente
                              ? "border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700/60 dark:bg-amber-900/30 dark:text-amber-300"
                              : "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-300"
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${pendiente ? "bg-amber-500" : "bg-emerald-500"}`} />
                          {estadoAud}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {asStr(r.auditoria?.fotoURL) ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="text-xs font-medium text-[#30518c] hover:underline dark:text-blue-400"
                              title={fmtDateTime(r.auditoria?.actualizadoEn)}
                              onClick={() => setFotoModal({ open: true, url: asStr(r.auditoria?.fotoURL), sn: asStr(r.SN || r.id) })}
                            >
                              Ver foto
                            </button>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={asStr(r.auditoria?.fotoURL)}
                              alt={`foto-${asStr(r.SN || r.id)}`}
                              className="h-9 w-9 cursor-pointer rounded-lg border border-slate-200 object-cover shadow-sm transition hover:scale-110 dark:border-slate-700"
                              onClick={() => setFotoModal({ open: true, url: asStr(r.auditoria?.fotoURL), sn: asStr(r.SN || r.id) })}
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-500">Sin foto</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          className="h-8 w-full min-w-[160px] rounded-lg border border-slate-200 px-2 text-xs outline-none transition focus:border-blue-400 focus:ring-1 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800"
                          disabled={!canEdit}
                          value={obsDraft[r.id] ?? ""}
                          onChange={(e) => setObsDraft((prev) => ({ ...prev, [r.id]: e.target.value }))}
                          placeholder="Observación…"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex flex-col items-end gap-1">
                          {canEdit ? (
                            <>
                              <input
                                id={`file-aud-${r.id}`}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={subiendoId === r.id}
                                onChange={(ev) => {
                                  const file = ev.target.files?.[0];
                                  if (file) { subirFoto(r, file, pendiente); ev.target.value = ""; }
                                }}
                              />
                              <button
                                type="button"
                                className={`inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] font-medium text-white transition ${
                                  pendiente ? "bg-emerald-600 hover:bg-emerald-700" : "bg-[#30518c] hover:bg-[#2b4880]"
                                } disabled:opacity-60`}
                                disabled={subiendoId === r.id}
                                onClick={() => document.getElementById(`file-aud-${r.id}`)?.click()}
                              >
                                {subiendoId === r.id ? (
                                  <><span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />Subiendo…</>
                                ) : pendiente ? (
                                  <><svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>Sustentar</>
                                ) : (
                                  <><svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>Act. foto</>
                                )}
                              </button>
                              <button
                                type="button"
                                className="inline-flex h-7 items-center gap-1 rounded-lg bg-slate-600 px-2.5 text-[11px] font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
                                onClick={() => limpiarUno(r)}
                                disabled={saving}
                              >
                                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /></svg>
                                Limpiar
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!equiposFiltrados.length && (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center gap-2 text-slate-400 dark:text-slate-500">
                        <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <p className="text-sm">No hay equipos para mostrar con el filtro actual.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Modal foto ── */}
      {fotoModal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setFotoModal({ open: false, url: "", sn: "" })}
        >
          <div
            className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700">
              <div>
                <p className="font-semibold text-slate-800 dark:text-slate-100">Foto de auditoría</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">SN: <span className="font-mono">{fotoModal.sn}</span></p>
              </div>
              <button
                type="button"
                onClick={() => setFotoModal({ open: false, url: "", sn: "" })}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="flex justify-center bg-slate-50 p-4 dark:bg-slate-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fotoModal.url} alt={`foto-${fotoModal.sn}`} className="max-h-[70vh] rounded-xl object-contain shadow" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
