"use client";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
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

  const fieldClass =
    "h-10 w-full rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40";
  const btnSoftClass = "rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 transition hover:bg-slate-100 disabled:opacity-50";
  const btnPrimaryClass = "rounded-lg bg-blue-600 px-3 py-2 text-sm text-white transition hover:bg-blue-700 disabled:opacity-50";
  const btnSuccessClass = "rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white transition hover:bg-emerald-800 disabled:opacity-50";

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
    return rowsConFiltroCoordinador.filter((r) => {
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
  }, [rowsConFiltroCoordinador, busqueda, filtroEstadoGeneral, filtroUbicacion]);

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

  return (
    <div className="space-y-4">
      {!canEdit && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Perfil en solo lectura: puedes visualizar auditoria, sin cambios.
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-lg font-semibold">Control de Auditoria</div>
            <div className="text-xs text-slate-500">Seguimiento de equipos pendientes y sustentados</div>
          </div>
          <div className="inline-flex rounded-full bg-slate-100 p-1 text-xs dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setModo("campo")}
              className={`rounded-full px-3 py-1 ${modo === "campo" ? "bg-white shadow dark:bg-slate-700 dark:text-slate-100" : "dark:text-slate-300"}`}
            >
              Equipos en campo
            </button>
            <button
              type="button"
              onClick={() => setModo("instalados")}
              className={`rounded-full px-3 py-1 ${modo === "instalados" ? "bg-white shadow dark:bg-slate-700 dark:text-slate-100" : "dark:text-slate-300"}`}
            >
              Equipos instalados
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border bg-slate-50 dark:bg-slate-800/60 p-3">
            <div className="text-xs text-slate-500">En auditoria</div>
            <div className="text-2xl font-semibold">{kpis.total}</div>
          </div>
          <div className="rounded-xl border bg-amber-50 p-3">
            <div className="text-xs text-amber-700">Pendientes</div>
            <div className="text-2xl font-semibold text-amber-800">{kpis.pend}</div>
          </div>
          <div className="rounded-xl border bg-emerald-50 p-3">
            <div className="text-xs text-emerald-700">Sustentadas</div>
            <div className="text-2xl font-semibold text-emerald-800">{kpis.sust}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-3">
            <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
              <span>Avance</span>
              <span>{avance}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-200">
              <div className="h-2 rounded-full bg-blue-600" style={{ width: `${Math.max(0, Math.min(100, avance))}%` }} />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Control de avisos por cuadrilla/ubicacion</div>
            <div className="text-xs text-slate-500">
              Avisadas: {ubicacionesAvisadas} | Pendientes: {ubicacionesPendientes} | Total: {totalUbicaciones}
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
              Marcar todas avisadas
            </button>
            <button
              type="button"
              className={btnSoftClass}
              onClick={() => setAvisosPorUbicacion({})}
              disabled={!ubicacionesDisponibles.length}
            >
              Limpiar marcas
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {ubicacionesDisponibles.map((u) => {
            const checked = !!avisosPorUbicacion[u];
            const st = statsByUbicacion.get(u) || { total: 0, sust: 0, pend: 0 };
            return (
              <label
                key={u}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                  checked ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                }`}
              >
                <span className="truncate pr-3">
                  {u}
                  <span className="ml-2 text-[11px] text-slate-500">S:{st.sust} | P:{st.pend} | T:{st.total}</span>
                </span>
                <span className="inline-flex items-center gap-2 whitespace-nowrap text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => setAvisosPorUbicacion((prev) => ({ ...prev, [u]: e.target.checked }))}
                  />
                  {checked ? "Avisada" : "Pendiente"}
                </span>
              </label>
            );
          })}
          {!ubicacionesDisponibles.length && <div className="text-sm text-slate-500">No hay ubicaciones disponibles para marcar.</div>}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4">
        <div className="grid gap-3 md:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs text-slate-500">Estado auditoria</label>
            <select className={fieldClass} value={filtroEstadoAud} onChange={(e) => setFiltroEstadoAud(e.target.value)}>
              <option value="todos">Todos</option>
              <option value="pendiente">Pendiente</option>
              <option value="sustentada">Sustentada</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Estado general</label>
            <select className={fieldClass} value={filtroEstadoGeneral} onChange={(e) => setFiltroEstadoGeneral(e.target.value)}>
              <option value="todos">Todos</option>
              {estadosGenerales.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Ubicacion</label>
            <select className={fieldClass} value={filtroUbicacion} onChange={(e) => setFiltroUbicacion(e.target.value)}>
              <option value="todas">Todas</option>
              {ubicacionesDisponibles.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Buscar</label>
            <input
              className={fieldClass}
              placeholder="SN, equipo, ubicacion o cliente"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Coordinador</label>
            <select
              className={fieldClass}
              value={filtroCoordinadorUid}
              onChange={(e) => setFiltroCoordinadorUid(e.target.value)}
              disabled={isCoordViewer}
            >
              {!isCoordViewer && <option value="">Todos</option>}
              {coordinadores.map((c) => (
                <option key={c.uid} value={c.uid}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-slate-500">
            Mostrando {equiposFiltrados.length} de {rowsConFiltroCoordinador.length} equipos
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
              Limpiar filtros
            </button>
            <button type="button" onClick={() => void cargar()} className={btnSoftClass} disabled={loading}>
              Actualizar
            </button>
            <button type="button" onClick={exportManifest} className={btnPrimaryClass}>
              Exportar Excel
            </button>
            <button
              type="button"
              onClick={enviarWspCuadrillaSeleccionada}
              disabled={sendingWsp || !filtroCoordinadorUid || filtroUbicacion === "todas"}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {sendingWsp ? "Enviando..." : "Enviar WSP"}
            </button>
          </div>
        </div>

        {canEdit && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 dark:bg-slate-800/60 p-2">
            <button type="button" onClick={guardarObservaciones} className={btnSuccessClass} disabled={saving}>
              Guardar cambios
            </button>
            <button type="button" onClick={nuevaAuditoria} className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white hover:bg-slate-900 disabled:opacity-50" disabled={saving}>
              Nueva auditoria
            </button>
          </div>
        )}

        {canEdit && (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-3">
            <div className="mb-2 text-sm font-semibold">Carga masiva por SN</div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={descargarPlantillaSN} className={btnSoftClass}>
                Descargar plantilla
              </button>
              <label className="cursor-pointer rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white transition hover:bg-emerald-700">
                Cargar Excel (SN)
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onFile(f);
                  }}
                />
              </label>
              <button
                type="button"
                onClick={analizarSN}
                disabled={!snExcel.length || saving}
                className={btnSoftClass}
              >
                Analizar SN
              </button>
              <button
                type="button"
                onClick={marcarMasivo}
                disabled={!snExcel.length || saving || !snAnalisis}
                className="rounded-lg bg-fuchsia-600 px-3 py-2 text-sm text-white transition hover:bg-fuchsia-700 disabled:opacity-50"
              >
                Marcar SN {snExcel.length ? `(${snExcel.length})` : ""}
              </button>
              {fileName && <div className="text-xs text-slate-500">Archivo: {fileName}</div>}
            </div>
            {snAnalisis && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 dark:bg-slate-800/60 p-2 text-xs text-slate-700 dark:text-slate-200">
                <div>Total: {snAnalisis.total} | Encontrados: {snAnalisis.encontrados} | No encontrados: {snAnalisis.noEncontrados.length}</div>
                {!!snAnalisis.noEncontrados.length && (
                  <div className="mt-2 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-amber-700">Detalle completo de SN no encontrados</div>
                      <button type="button" onClick={exportNoEncontrados} className={btnSoftClass}>
                        Descargar no encontrados
                      </button>
                    </div>
                    <div className="max-h-40 overflow-auto rounded border border-amber-200 bg-amber-50 p-2 text-amber-800">
                      {snAnalisis.noEncontrados.join(", ")}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 shadow-sm">
        {loading ? (
          <div className="p-6 text-center text-slate-600">Cargando auditoria...</div>
        ) : (
          <div className="max-h-[75vh] overflow-auto">
            <table className="min-w-[1180px] text-sm">
              <thead className="sticky top-0 z-10 bg-slate-100 text-left text-xs text-slate-600">
                <tr>
                  <th className="p-2">SN</th>
                  <th className="p-2">Equipo</th>
                  <th className="p-2">{modo === "instalados" ? "F. Instalacion" : "F. Despacho"}</th>
                  <th className="p-2">{modo === "instalados" ? "Cliente" : "Tecnicos"}</th>
                  <th className="p-2">Estado</th>
                  <th className="p-2">{modo === "instalados" ? "Direccion" : "Ubicacion"}</th>
                  <th className="p-2">Auditoria</th>
                  <th className="p-2">Foto</th>
                  <th className="p-2">Observacion</th>
                  <th className="p-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {equiposFiltrados.map((r) => {
                  const liq = r.detalleInstalacion || {};
                  const estadoAud = asStr(r.auditoria?.estado || "pendiente");
                  const pendiente = estadoAud !== "sustentada";
                  return (
                    <tr key={r.id} className="border-t hover:bg-slate-50 dark:hover:bg-slate-800/70">
                      <td className="p-2 font-mono text-xs">{asStr(r.SN || r.id)}</td>
                      <td className="p-2">{asStr(r.equipo) || "-"}</td>
                      <td className="p-2">{modo === "instalados" ? fmtDate(liq.fechaInstalacion) : fmtDate(getFechaDespacho(r))}</td>
                      <td className="p-2">
                        {modo === "instalados"
                          ? asStr(liq.cliente || r.cliente) || "-"
                          : Array.isArray(r.tecnicos)
                          ? r.tecnicos.join(", ")
                          : asStr(r.tecnicos) || "-"}
                      </td>
                      <td className="p-2">{asStr(r.estado) || "-"}</td>
                      <td className="p-2">{modo === "instalados" ? asStr(liq.direccion) || "-" : asStr(r.ubicacion) || "-"}</td>
                      <td className="p-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                            pendiente ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {estadoAud}
                        </span>
                      </td>
                      <td className="p-2">
                        {asStr(r.auditoria?.fotoURL) ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="text-xs text-blue-700 hover:underline"
                              title={fmtDateTime(r.auditoria?.actualizadoEn)}
                              onClick={() =>
                                setFotoModal({ open: true, url: asStr(r.auditoria?.fotoURL), sn: asStr(r.SN || r.id) })
                              }
                            >
                              Ver foto
                            </button>
                            <img
                              src={asStr(r.auditoria?.fotoURL)}
                              alt={`foto-${asStr(r.SN || r.id)}`}
                              className="h-10 w-10 cursor-pointer rounded border object-cover"
                              onClick={() => setFotoModal({ open: true, url: asStr(r.auditoria?.fotoURL), sn: asStr(r.SN || r.id) })}
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Sin foto</span>
                        )}
                      </td>
                      <td className="p-2">
                        <input
                          className="h-8 w-full min-w-[180px] rounded border px-2 text-xs disabled:bg-slate-100"
                          disabled={!canEdit}
                          value={obsDraft[r.id] ?? ""}
                          onChange={(e) => setObsDraft((prev) => ({ ...prev, [r.id]: e.target.value }))}
                          placeholder="Observacion"
                        />
                      </td>
                      <td className="p-2 text-right">
                        <div className="flex flex-col items-end gap-1">
                          {canEdit && (
                            <>
                              <input
                                id={`file-aud-${r.id}`}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={subiendoId === r.id}
                                onChange={(ev) => {
                                  const file = ev.target.files?.[0];
                                  if (file) {
                                    subirFoto(r, file, pendiente);
                                    ev.target.value = "";
                                  }
                                }}
                              />
                              <button
                                type="button"
                                className={`h-7 rounded px-3 text-xs text-white ${
                                  pendiente ? "bg-emerald-600 hover:bg-emerald-700" : "bg-sky-600 hover:bg-sky-700"
                                }`}
                                disabled={subiendoId === r.id}
                                onClick={() => document.getElementById(`file-aud-${r.id}`)?.click()}
                              >
                                {subiendoId === r.id ? "Subiendo..." : pendiente ? "Sustentar" : "Actualizar foto"}
                              </button>
                              <button
                                type="button"
                                className="h-7 rounded bg-slate-700 px-3 text-xs text-white hover:bg-slate-800"
                                onClick={() => limpiarUno(r)}
                                disabled={saving}
                              >
                                Limpiar
                              </button>
                            </>
                          )}
                          {!canEdit && <span className="text-xs text-slate-400">-</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!equiposFiltrados.length && (
                  <tr>
                    <td colSpan={10} className="p-6 text-center text-sm text-slate-500">
                      No hay equipos para mostrar con el filtro actual.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {fotoModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setFotoModal({ open: false, url: "", sn: "" })}>
          <div className="relative w-[92vw] max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-4 py-2">
              <div className="text-sm font-medium text-slate-700 dark:text-slate-200">Foto auditoria - SN {fotoModal.sn}</div>
              <button type="button" className="text-slate-500 hover:text-slate-800" onClick={() => setFotoModal({ open: false, url: "", sn: "" })}>
                Cerrar
              </button>
            </div>
            <div className="flex justify-center bg-slate-50 dark:bg-slate-800/60 p-3">
              <img src={fotoModal.url} alt={`foto-${fotoModal.sn}`} className="max-h-[75vh] rounded object-contain" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}






