"use client";
import React, { useEffect, useMemo, useRef, useState, startTransition } from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import { despacharInstalacionesAction } from "../../server-actions";
import jsPDF from "jspdf";
import QRCode from "qrcode";

/**
 * Mantiene tu lgica:
 * - Server Action: despacharInstalacionesAction
 * - Payload: { cuadrillaId, equipos, materiales, bobinasResidenciales? }
 * - Print area: usa lastPayload + result
 *
 * Replica la forma del otro:
 * - Paso 1: buscar/seleccionar cuadrilla + card info + (opcional) stock
 * - Paso 2: scanner SN + lista/tabla + bobinas + grid materiales
 * - Modal Preview: confirmar/cancelar antes de enviar
 * - ClickGuard: anti doble click/submits
 */

const MATS_INST = [
  "PRECON_50",
  "PRECON_100",
  "PRECON_150",
  "PRECON_200",
  "ACTA",
  "BOBINA", // residencial con cdigos (WIN-XXXX o lo que uses)
  
  "CONECTOR",
  "ROSETA",
  "ACOPLADOR",
  "PACHCORD",
  "CINTILLO_30",
  "CINTILLO_10",
  "CINTILLO_BANDERA",
  "CINTA_AISLANTE",
  "TEMPLADOR",
  "ANCLAJE_P",
  "CLEVI",
  "HEBILLA_1_2",
  "CINTA_BANDI_1_2",
  "CAJA_GRAPAS",
] as const;

type Segmento = "RESIDENCIAL" | "CONDOMINIO";
type Tipo = "REGULAR" | "ALTO_VALOR";

type CuadrillaListItem = {
  id: string;
  nombre: string;
  r_c?: string;
  categoria?: string;
  zonaId?: string;
  tipoZona?: string;
  vehiculo?: string;
  numeroCuadrilla?: string;
};
type CuadrillaInfo = {
  nombre?: string;
  coordinadorUid?: string;
  coordinadorNombre?: string;
  coordinador?: string;
  tecnicosUids?: string[];
  tecnicosNombres?: string[];
  tipo?: string;
  segmento?: string;
  r_c?: string;
  categoria?: string;
  tipoZona?: string;
  zonaId?: string;
  vehiculo?: string;
};

type StockItem = { id: string; nombre?: string; cantidad?: number; metros?: number; tipo?: string };
type CuadrillaStock = {
  materiales?: StockItem[];
  equipos?: StockItem[];
  bobinas?: StockItem[];
};

type GuiaThermalData = {
  fechaStr?: string;
  usuario?: string;
  cuadrilla?: string;
  coordinador?: string;
  tecnicos?: string[];
  tipo?: string;
  observacion?: string;
  equipos?: Array<{ SN?: string; equipo?: string }>;
  materiales?: {
    automaticos?: Record<string, number>;
    manuales?: Record<string, number>;
    drumps?: string[];
  };
  metrosCondominio?: number;
  qrDataUrl?: string;
};

const RES_BOBINA_METROS = 1000;
const KIT_BASE_POR_ONT_LOCAL: Record<string, number> = {
  ACTA: 1,
  CONECTOR: 1,
  ROSETA: 1,
  ACOPLADOR: 1,
  PACHCORD: 1,
  CINTILLO_30: 4,
  CINTILLO_BANDERA: 1,
};

function shortName(name: string) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  const first = parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  return last ? `${first} ${last}` : first;
}

async function makeQrDataUrl(value: string) {
  return QRCode.toDataURL(value, {
    errorCorrectionLevel: "H",
    margin: 0,
    width: 320,
  });
}

function calcHeight80mm(data: GuiaThermalData) {
  const line = 5;
  let lines = 0;
  lines += 6;
  lines += 4;
  lines += (data.tecnicos || []).length;
  lines += 2;
  lines += Object.keys(data.materiales?.automaticos || {}).length;
  lines += Object.entries(data.materiales?.manuales || {}).filter(([, v]) => Number(v) > 0).length;
  if (String(data.tipo || "").toLowerCase() === "residencial") {
    lines += (data.materiales?.drumps || []).length;
    if ((data.materiales?.drumps || []).length > 0) lines += 2;
  } else {
    if (Number(data.metrosCondominio || 0) > 0) lines += 1;
  }
  if ((data.equipos || []).length > 0) {
    lines += 2;
    lines += (data.equipos || []).length;
  }
  const obs = String(data.observacion || "");
  const obsLines = obs ? Math.max(1, Math.ceil(obs.length / 24)) : 1;
  lines += obsLines + 1;
  const extra = (data.qrDataUrl ? 60 : 10) + 22;
  const altura = 10 + lines * line + extra;
  return Math.max(120, altura);
}

function generarPDFTermico80mm(guiaId: string, data: GuiaThermalData) {
  const altura = calcHeight80mm(data);
  const pdf = new jsPDF({ unit: "mm", format: [80, altura] });

  const C = { align: "center" as const };
  let y = 10;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);

  pdf.text("CONSTRUCCION DE REDES M&D S.A.C", 40, y, C); y += 5;
  pdf.text("RUC: 20601345979", 40, y, C); y += 5;
  pdf.text("Cal. Juan Prado de Zela Mza. F2 Lt. 3", 40, y, C); y += 5;
  pdf.text("Apv. San Francisco de Cayran", 40, y, C); y += 5;
  pdf.text("Cel/WSP: 913 637 815", 40, y, C); y += 7;

  pdf.setFont("helvetica", "bold");
  pdf.text(`GUIA: ${guiaId}`, 40, y, C); y += 5;
  pdf.setFont("helvetica", "normal");
  const fecha = data.fechaStr || new Date().toLocaleString("es-PE");
  pdf.text(`FECHA: ${fecha}`, 40, y, C); y += 5;
  pdf.text(`USUARIO: ${data.usuario || "-"}`, 40, y, C); y += 5;
  pdf.setFont("helvetica", "bold");
  pdf.text(`CUADRILLA: ${data.cuadrilla || "-"}`, 40, y, C); y += 5;
  pdf.text(`COORDINADOR: ${data.coordinador || "-"}`, 40, y, C); y += 5;
  pdf.setFont("helvetica", "normal");

  (data.tecnicos || []).forEach((t, i) => {
    pdf.text(`TECNICO ${i + 1}: ${t}`, 40, y, C);
    y += 5;
  });

  y += 3;
  pdf.setFont("helvetica", "bold");
  pdf.text("DESPACHO", 40, y, C);
  y += 6;
  pdf.setFont("helvetica", "normal");

  const colX1 = 6;
  const colX2 = 42;
  const rowH = 4;
  const renderTwoCols = (items: string[]) => {
    const rows = Math.ceil(items.length / 2);
    for (let i = 0; i < rows; i++) {
      const left = items[i * 2];
      const right = items[i * 2 + 1];
      if (left) pdf.text(left, colX1, y);
      if (right) pdf.text(right, colX2, y);
      y += rowH;
    }
  };

  pdf.setFontSize(7);

  const automaticos = data.materiales?.automaticos || {};
  const autosList = Object.entries(automaticos)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k.replaceAll("_", " ")}: ${v}`);
  const manuales = data.materiales?.manuales || {};
  const manualesList = Object.entries(manuales)
    .map(([k, v]) => ({ k, n: Number(v) || 0 }))
    .filter((x) => x.n > 0)
    .map((x) => `${x.k.replaceAll("_", " ")}: ${x.n}`);
  const matsList = [...autosList, ...manualesList];
  if (matsList.length) {
    pdf.setFont("helvetica", "bold");
    pdf.text("MATERIALES", 40, y, C);
    y += 4;
    pdf.setFont("helvetica", "normal");
    renderTwoCols(matsList);
    y += 1;
  }
  pdf.setFontSize(9);

  if (String(data.tipo).toLowerCase() === "residencial") {
    const drumps = data.materiales?.drumps || [];
    if (drumps.length > 0) {
      pdf.text("BOBINAS DRUMP:", 40, y, C); y += 5;
      drumps.forEach((code) => {
        pdf.text(`- ${code}`, 40, y, C);
        y += 4;
      });
      pdf.text(`TOTAL: ${drumps.length * RES_BOBINA_METROS} m`, 40, y, C);
      y += 5;
    }
  } else if (String(data.tipo).toLowerCase() === "condominio") {
    const m = Number(data.metrosCondominio) || 0;
    if (m > 0) {
      pdf.text(`BOBINA (METROS): ${m}`, 40, y, C);
      y += 5;
    }
  }

  if ((data.equipos || []).length > 0) {
    y += 3;
    pdf.setFont("helvetica", "bold");
    pdf.text("EQUIPOS:", 40, y, C);
    y += 5;
    pdf.setFont("helvetica", "normal");
    (data.equipos || []).forEach((eq) => {
      const sn = eq.SN || "-";
      const tipoEq = eq.equipo || "-";
      pdf.text(`${sn} - ${tipoEq}`, 40, y, C);
      y += 5;
    });
  }

  y += 4;
  const obsText = `OBS: ${data.observacion || "Sin observaciones"}`;
  const obsLines = pdf.splitTextToSize(obsText, 60) as string[];
  pdf.text(obsLines, 10, y);
  y += obsLines.length * 4;
  y += 2;

  if (data.qrDataUrl) {
    pdf.addImage(data.qrDataUrl, "PNG", 20, y, 40, 40);
    y += 52;
  } else {
    y += 6;
  }

  pdf.line(10, y, 40, y);
  pdf.line(45, y, 75, y);
  y += 10;
  const firmaTec = (data.tecnicos || [])[0] || "Tecnico";
  const firmaAlm = data.usuario || "Almacen";
  pdf.text(firmaTec, 25, y, { align: "center" });
  pdf.text(firmaAlm, 60, y, { align: "center" });

  return pdf;
}

function printThermalBlobTwice(pdf: jsPDF) {
  const blob = pdf.output("blob");
  const urlBlob = URL.createObjectURL(blob);

  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.src = urlBlob;
  document.body.appendChild(iframe);

  iframe.onload = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.contentWindow?.print(), 1000);
  };

  setTimeout(() => {
    try {
      document.body.removeChild(iframe);
    } catch {}
    URL.revokeObjectURL(urlBlob);
  }, 15000);

  return blob;
}

// -----------------------
// Hook: click guard
// -----------------------
function useClickGuard(defaultCooldownMs = 700) {
  const untilRef = useRef(0);
  return (fn: () => void | Promise<void>, ms = defaultCooldownMs) => {
    if (Date.now() < untilRef.current) return;
    untilRef.current = Date.now() + ms;
    try {
      const r = fn();
      // no await: guard solo bloquea el doble click; pending cubre lo dems
      return r as any;
    } finally {
      setTimeout(() => {
        if (Date.now() >= untilRef.current) untilRef.current = 0;
      }, ms);
    }
  };
}

function numOr0(v: string | undefined) {
  const n = Number((v ?? "").toString().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function normalizePhone(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  const noPrefix = digits.startsWith("51") && digits.length >= 11 ? digits.slice(2) : digits;
  return noPrefix.length >= 9 ? noPrefix : "";
}

async function obtenerCelularesTecnicos(tecnicosUID: string[] = []) {
  if (!tecnicosUID.length) return [];
  const qs = encodeURIComponent(tecnicosUID.join(","));
  const res = await fetch(`/api/usuarios/phones?uids=${qs}`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  const items = Array.isArray(data?.items) ? data.items : [];
  const celulares = items.map((it: any) => normalizePhone(String(it?.celular || ""))).filter(Boolean);
  return Array.from(new Set(celulares));
}

async function enviarGuiaPorWhatsAppATecnicos(args: {
  tecnicosUID: string[];
  tipoGuia: string;
  guiaId: string;
  cuadrilla: string;
  tecnicosNombres: string[];
  coordinador: string;
  usuario: string;
  fechaHora: string;
  urlComprobante: string;
  extraInfo?: string;
  preOpenWindow?: Window | null;
}) {
  const celulares = await obtenerCelularesTecnicos(args.tecnicosUID);
  if (!celulares.length) {
    if (args.preOpenWindow && !args.preOpenWindow.closed) args.preOpenWindow.close();
    return { total: 0 };
  }

  const lines: string[] = [];
  lines.push(`*${args.tipoGuia}*`);
  lines.push(`Guia: ${args.guiaId}`);
  lines.push(`Cuadrilla: ${args.cuadrilla}`);
  if (args.coordinador) lines.push(`Coordinador: ${args.coordinador}`);
  if (args.tecnicosNombres.length) lines.push(`Tecnicos: ${args.tecnicosNombres.join(", ")}`);
  if (args.usuario) lines.push(`Registrado por: ${args.usuario}`);
  if (args.fechaHora) lines.push(`Fecha/Hora: ${args.fechaHora}`);
  if (args.extraInfo) lines.push(args.extraInfo);
  lines.push("Puedes ver el comprobante aqui:");
  lines.push(args.urlComprobante);
  const mensaje = lines.join("\n");

  const numero = celulares[0];
  try {
    const url = `https://wa.me/51${numero}?text=${encodeURIComponent(mensaje)}`;
    if (args.preOpenWindow && !args.preOpenWindow.closed) {
      args.preOpenWindow.location.href = url;
      args.preOpenWindow.focus();
    } else {
      const win = window.open(url, "_blank");
      if (win) {
        win.opener = null;
      } else {
        window.location.href = url;
      }
    }
  } catch {
    // silent
  }

  return { total: 1 };
}

// -----------------------
// Componente
// -----------------------
export default function DespachoClient() {
  const guard = useClickGuard(700);

  const [step, setStep] = useState<1 | 2>(1);

  // Paso 1
  const [cuadrillaId, setCuadrillaId] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [cuadrillas, setCuadrillas] = useState<CuadrillaListItem[]>([]);
  const [cuadrillasLoading, setCuadrillasLoading] = useState(false);
  const [comboOpen, setComboOpen] = useState(false);
  const [cuadrillaNombre, setCuadrillaNombre] = useState("");
  const [coordinador, setCoordinador] = useState("");
  const [tecnicos, setTecnicos] = useState("");
  const [coordinadorUid, setCoordinadorUid] = useState("");
  const [tecnicosUids, setTecnicosUids] = useState<string[]>([]);
  const [tecnicosNombres, setTecnicosNombres] = useState<string[]>([]);
  const [tipo, setTipo] = useState<Tipo>("REGULAR");
  const [segmento, setSegmento] = useState<Segmento>("RESIDENCIAL");
  const [zonaId, setZonaId] = useState("");
  const [infoLoaded, setInfoLoaded] = useState(false);

  // (Opcional) Stock
  const [stock, setStock] = useState<CuadrillaStock | null>(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [materialUnits, setMaterialUnits] = useState<Record<string, "UND" | "METROS" | undefined>>({});
  const [usuarioNombre, setUsuarioNombre] = useState("");
  const [observacion, setObservacion] = useState("");

  // Paso 2 - Equipos (modo scanner + modo bulk)
  const [snInput, setSnInput] = useState("");
  const snInputRef = useRef<HTMLInputElement | null>(null);
  const [equipos, setEquipos] = useState<Array<{ sn: string; tipo: string }>>([]);
  const [snValidating, setSnValidating] = useState(false);
  const [pendingScans, setPendingScans] = useState(0);

  // Paso 2 - Bobinas / Materiales
  const [bobinaInput, setBobinaInput] = useState("");
  const [bobinaCodes, setBobinaCodes] = useState<string[]>([]);
  const [bobinaCondominioMetros, setBobinaCondominioMetros] = useState<string>("300");
  const [matUnd, setMatUnd] = useState<Record<string, string>>({});
  const [matMetros, setMatMetros] = useState<Record<string, string>>({});

  // Preview modal
  const [showPreview, setShowPreview] = useState(false);

  // Server action
  const [result, run, pending] = useActionState(despacharInstalacionesAction as any, null as any);
  const [lastPayload, setLastPayload] = useState<any>(null);
  const printedGuiaRef = useRef<string>("");
  const waWindowRef = useRef<Window | null>(null);
  const transferIdRef = useRef<string>("");
  const scanQueueRef = useRef<string[]>([]);
  const scanProcessingRef = useRef(false);

  // -----------------------
  // Cargar lista de cuadrillas (opcional)
  // No rompe si no existe endpoint: queda vaco y todo funciona con ID manual.
  // -----------------------
  useEffect(() => {
    (async () => {
      try {
        // Si tienes un endpoint diferente, cmbialo aqu.
        setCuadrillasLoading(true);
        const res = await fetch("/api/cuadrillas/list?area=INSTALACIONES", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        // Espera: { ok:true, items:[{id,nombre}] }
        const items: CuadrillaListItem[] = data?.items || data?.cuadrillas || [];
        if (Array.isArray(items)) setCuadrillas(items);
      } catch {
        // silencioso: no rompe nada
      } finally {
        setCuadrillasLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (step !== 2 || pending || showPreview) return;
    const t = setTimeout(() => snInputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [step, pending, showPreview]);

  function ensureTransferId() {
    if (!transferIdRef.current) {
      transferIdRef.current =
        typeof crypto?.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
    return transferIdRef.current;
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/materiales/list?area=INSTALACIONES", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const items = Array.isArray(data?.items) ? data.items : [];
        const map: Record<string, "UND" | "METROS" | undefined> = {};
        for (const it of items) {
          const id = String(it?.id || "");
          const unidad = String(it?.unidadTipo || "").toUpperCase();
          if (id) map[id] = unidad === "METROS" ? "METROS" : unidad === "UND" ? "UND" : undefined;
        }
        setMaterialUnits(map);
      } catch {
        // silencioso
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.ok && data?.nombre) setUsuarioNombre(shortName(String(data.nombre)));
      } catch {
        // silencioso
      }
    })();
  }, []);

  function resetDespachoForm() {
    setStep(1);
    setCuadrillaId("");
    setBusqueda("");
    setCuadrillaNombre("");
    setCoordinador("");
    setCoordinadorUid("");
    setTecnicos("");
    setTecnicosUids([]);
    setTecnicosNombres([]);
    setTipo("REGULAR");
    setSegmento("RESIDENCIAL");
    setZonaId("");
    setInfoLoaded(false);
    setStock(null);
    setStockLoading(false);
    setSnInput("");
    setEquipos([]);
    setBobinaInput("");
    setBobinaCodes([]);
    setBobinaCondominioMetros("300");
    setMatUnd({});
    setMatMetros({});
    setObservacion("");
    setShowPreview(false);
    setLastPayload(null);
    transferIdRef.current = "";
    scanQueueRef.current = [];
    scanProcessingRef.current = false;
    setPendingScans(0);
  }

  // -----------------------
  // Resultado del server action
  // -----------------------
  useEffect(() => {
    if (!result) return;
    if ((result as any).ok) {
      const r: any = result;
      toast.success("Despacho generado", { description: `Gua: ${r.guia}` });
      if (r.resumen?.warnings?.length) {
        toast.message("Avisos", { description: r.resumen.warnings.join("; ") });
      }
      setShowPreview(false);

      if (r.guia && printedGuiaRef.current !== r.guia) {
        printedGuiaRef.current = r.guia;
        (async () => {
          const ok = await imprimirGuiaTermica();
          if (ok) resetDespachoForm();
        })();
      }
    } else {
      const msg = (result as any)?.error?.formErrors?.join(", ") || "Error en despacho";
      toast.error(msg);
    }
  }, [result]);

  // -----------------------
  // Helpers Paso 1
  // -----------------------
  async function cargarInfoCuadrillaById(id: string): Promise<Segmento> {
    const res = await fetch(`/api/cuadrillas/info?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    const data = await res.json();
    if (!data?.ok) throw new Error(data?.error || "No se pudo obtener info de la cuadrilla");

    const info: CuadrillaInfo = data;
    setCuadrillaNombre(info.nombre || "");
    const coordName = shortName(info.coordinadorNombre || info.coordinadorUid || "");
    const techNames = Array.isArray(info.tecnicosNombres)
      ? info.tecnicosNombres.map((n: string) => shortName(n))
      : Array.isArray(info.tecnicosUids)
      ? info.tecnicosUids
      : [];
    setCoordinador(coordName);
    setCoordinadorUid(String(info.coordinadorUid || info.coordinador || ""));
    setTecnicos(techNames.join(", "));
    setTecnicosUids(Array.isArray(info.tecnicosUids) ? info.tecnicosUids : []);
    setTecnicosNombres(techNames);
    const rawTipo = String(info.tipoZona || info.tipo || "").trim().toUpperCase();
    const nextTipo: Tipo = rawTipo === "ALTO_VALOR" ? "ALTO_VALOR" : "REGULAR";
    const rawSegmento = String(info.segmento || info.r_c || info.categoria || "")
      .trim()
      .toUpperCase();
    const nextSegmento: Segmento = rawSegmento === "CONDOMINIO" ? "CONDOMINIO" : "RESIDENCIAL";
    setTipo(nextTipo);
    setSegmento(nextSegmento);
    setZonaId(info.zonaId || "");
    setInfoLoaded(true);
    return nextSegmento;
  }

  async function cargarStockCuadrillaById(id: string, seg: Segmento) {
    setStockLoading(true);
    try {
      // Si no tienes endpoint de stock todava, esto no rompe: queda en null.
      const res = await fetch(`/api/cuadrillas/stock?id=${encodeURIComponent(id)}&segmento=${encodeURIComponent(seg)}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.ok) setStock(data.stock || data.data || null);
    } catch {
      // silencioso
    } finally {
      setStockLoading(false);
    }
  }

  const buscarYSeleccionarCuadrilla = () =>
    guard(async () => {
      const q = busqueda.trim();
      if (!q) return;

      // match exact (case-insensitive). Si quieres, luego se mejora a contains.
      const found =
        cuadrillas.find((c) => c.id === q) ||
        cuadrillas.find((c) => c.nombre?.trim().toLowerCase() === q.toLowerCase());

      if (!found?.id) {
        toast.error("Cuadrilla no encontrada o no est habilitada.");
        return;
      }

      setCuadrillaId(found.id);
      setBusqueda(found.nombre || found.id);
      try {
        const seg = await cargarInfoCuadrillaById(found.id);
        await cargarStockCuadrillaById(found.id, seg);
        toast.success("Cuadrilla cargada");
        setComboOpen(false);
        setTimeout(() => snInputRef.current?.focus(), 0);
      } catch (e: any) {
        toast.error(e?.message || "Error cargando cuadrilla");
      }
    });

  const filteredCuadrillas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return cuadrillas.slice(0, 50);
    return cuadrillas
      .filter((c) => c.nombre?.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
      .slice(0, 50);
  }, [busqueda, cuadrillas]);

  const handleCargarInfo = () =>
    guard(async () => {
      if (!cuadrillaId) return;
      try {
        const seg = await cargarInfoCuadrillaById(cuadrillaId);
        await cargarStockCuadrillaById(cuadrillaId, seg);
        toast.success("Info cargada");
      } catch (e: any) {
        toast.error(e?.message || "Error consultando cuadrilla");
      }
    });

  // -----------------------
  // Paso 2: Equipos (scanner + bulk)
  // -----------------------
  const resumenEquipos = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of equipos) {
      const k = e.tipo || "OTROS";
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    const order = ["ONT", "MESH", "FONO", "BOX", "OTROS"];
    const parts: string[] = [];
    for (const k of order) {
      const v = counts.get(k);
      if (v) parts.push(`${v} ${k}`);
    }
    for (const [k, v] of counts.entries()) {
      if (!order.includes(k)) parts.push(`${v} ${k}`);
    }
    return parts.length ? parts.join(" - ") : "0";
  }, [equipos]);

  async function processScanQueue() {
    if (scanProcessingRef.current) return;
    scanProcessingRef.current = true;
    try {
      while (scanQueueRef.current.length > 0) {
        const sn = scanQueueRef.current.shift()!;
        setPendingScans(scanQueueRef.current.length);
        try {
          setSnValidating(true);
          const res = await fetch(`/api/equipos/validate?sn=${encodeURIComponent(sn)}`, { cache: "no-store" });
          if (res.status === 404) {
            toast.error(`SN ${sn}: no existe`);
            continue;
          }
          const data = await res.json();
          if (!data?.ok) {
            toast.error(`SN ${sn}: ${data?.error || "Error validando"}`);
            continue;
          }
          if (data.status === "ALMACEN") {
            const tipoEq = String(data.equipo || "OTROS").toUpperCase();
            let added = false;
            setEquipos((prev) => {
              if (prev.some((e) => e.sn === sn)) return prev;
              added = true;
              return [...prev, { sn, tipo: tipoEq }];
            });
            if (added) toast.success(`SN ${sn} en almacen`);
            continue;
          }
          if (data.status === "DESPACHADO") {
            toast.error(`SN ${sn}: ya despachada (${data.ubicacion || "N/A"})`);
            continue;
          }
          toast.error(`SN ${sn}: no esta en almacen (${data.ubicacion || "N/A"})`);
        } catch {
          toast.error(`SN ${sn}: error validando`);
        } finally {
          setSnValidating(false);
        }
      }
    } finally {
      scanProcessingRef.current = false;
      setPendingScans(0);
      setTimeout(() => snInputRef.current?.focus(), 0);
    }
  }

  function handleAddSN() {
    const sn = snInput.trim().toUpperCase();
    if (!sn) return;
    if (equipos.some((e) => e.sn === sn) || scanQueueRef.current.includes(sn)) {
      toast.error("Este SN ya fue agregado");
      setSnInput("");
      return;
    }
    scanQueueRef.current.push(sn);
    setPendingScans(scanQueueRef.current.length);
    setSnInput("");
    void processScanQueue();
  }

  const handleRemoveSN = (sn: string) => setEquipos((p) => p.filter((x) => x.sn !== sn));

  const handleAddBobina = () =>
    guard(() => {
      const code = bobinaInput.trim().toUpperCase();
      if (!code) return;
      if (bobinaCodes.includes(code)) {
        toast.error("Esta bobina ya fue agregada");
        setBobinaInput("");
        return;
      }
      setBobinaCodes((p) => [...p, code]);
      setBobinaInput("");
      toast.success("Bobina agregada");
    });

  const handleRemoveBobina = (code: string) =>
    setBobinaCodes((p) => p.filter((x) => x !== code));

  function handleMatUndChange(id: string, raw: string) {
    const value = raw.replace(/\D/g, "");
    setMatUnd((p) => {
      const next = { ...p, [id]: value };
      if (id === "CLEVI") {
        const n = value ? Number(value) : 0;
        next.HEBILLA_1_2 = n ? String(n * 2) : "";
      }
      return next;
    });
  }

  async function imprimirGuiaTermica(): Promise<boolean> {
    const guia = (result as any)?.guia;
    if (!guia) {
      toast.error("No hay guia para imprimir");
      return false;
    }

    const { payload } = buildPayload();
    const mats = (payload as any).materiales || [];
    const countONT = equipos.filter((e) => String(e.tipo || "").toUpperCase() === "ONT").length;
    const automaticos: Record<string, number> = {};
    if (countONT > 0) {
      for (const [k, v] of Object.entries(KIT_BASE_POR_ONT_LOCAL)) {
        automaticos[k] = (automaticos[k] || 0) + v * countONT;
      }
    }
    const manuales: Record<string, number> = {};
    for (const m of mats) {
      const id = String(m?.materialId || "");
      if (!id || id === "TARUGOS_P") continue;
      const n = Number(m?.und ?? m?.metros ?? 0);
      if (!n) continue;
      manuales[id] = (manuales[id] || 0) + n;
    }

    const data: GuiaThermalData = {
      fechaStr: new Date().toLocaleString("es-PE"),
      usuario: usuarioNombre || "",
      cuadrilla: cuadrillaNombre || cuadrillaId,
      coordinador: coordinador || "",
      tecnicos: tecnicos ? tecnicos.split(",").map((t) => t.trim()).filter(Boolean) : [],
      tipo: segmento,
      observacion: observacion || "",
      equipos: equipos.map((e) => ({ SN: e.sn, equipo: e.tipo })),
      materiales: {
        automaticos,
        manuales,
        drumps: (payload as any)?.bobinasResidenciales?.map((b: any) => b.codigoRaw) || [],
      },
      metrosCondominio: Math.max(0, numOr0(bobinaCondominioMetros || "0")),
    };

    const token = typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "";
    const path = `guias/instalaciones/despacho/${guia}.pdf`;
    const encodedPath = encodeURIComponent(path);
    const directUrl = bucket
      ? `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${token}`
      : "";

    if (directUrl) {
      try {
        data.qrDataUrl = await makeQrDataUrl(directUrl);
      } catch {}
    }

    const pdf = generarPDFTermico80mm(guia, data);

    try {
      const blob = pdf.output("blob");
      const res = await fetch(
        `/api/transferencias/instalaciones/guia/upload?guiaId=${encodeURIComponent(guia)}&tipo=despacho&token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "content-type": "application/pdf" },
          body: await blob.arrayBuffer(),
        }
      );
      if (!res.ok) throw new Error("UPLOAD_FAILED");

      printThermalBlobTwice(pdf);

      const equiposByTipo: Record<string, number> = {};
      equipos.forEach((e) => {
        const tipo = String(e.tipo || "OTROS").toUpperCase();
        equiposByTipo[tipo] = (equiposByTipo[tipo] || 0) + 1;
      });
      const equiposResumen = Object.entries(equiposByTipo)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${v} ${k}`)
        .join("\n");
      const equiposDetalle = equipos
        .map((e) => `${e.sn} - ${String(e.tipo || "").toUpperCase() || "OTROS"}`)
        .join("\n");

      const materialesDetalleList: string[] = [];
      Object.entries(automaticos)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([k, v]) => {
          const n = Number(v) || 0;
          if (n > 0) materialesDetalleList.push(`${k}: ${n}`);
        });
      Object.entries(manuales)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([k, v]) => {
          if (String(k) === "BOBINA") return;
          const n = Number(v) || 0;
          if (n > 0) materialesDetalleList.push(`${k}: ${n}`);
        });
      const bobinasRes = (payload as any)?.bobinasResidenciales || [];
      if (bobinasRes.length > 0) {
        materialesDetalleList.push(`BOBINA: ${bobinasRes.length * 1000} m`);
        materialesDetalleList.push(`DRUMP: ${bobinasRes.map((b: any) => b.codigoRaw).join(", ")}`);
      } else {
        const bobinaMetros = mats
          .filter((m: any) => String(m?.materialId || "") === "BOBINA")
          .reduce((acc: number, m: any) => acc + Number(m?.metros || 0), 0);
        if (bobinaMetros > 0) materialesDetalleList.push(`BOBINA: ${bobinaMetros} m`);
      }

      const partsMsg: string[] = [];
      if (equipos.length > 0) {
        partsMsg.push("*Resumen equipos:*");
        partsMsg.push(equiposResumen || "-");
        partsMsg.push("*Equipos (SN - equipo):*");
        partsMsg.push(equiposDetalle || "-");
      }
      if (materialesDetalleList.length > 0) {
        partsMsg.push("*Materiales:*");
        partsMsg.push(materialesDetalleList.join("\n"));
      }
      const extraInfo = partsMsg.length ? partsMsg.join("\n") : "";

      if (directUrl && coordinadorUid) {
        const r = await enviarGuiaPorWhatsAppATecnicos({
          tecnicosUID: [coordinadorUid],
          tipoGuia: "Despacho",
          guiaId: guia,
          cuadrilla: cuadrillaNombre || cuadrillaId,
          tecnicosNombres: tecnicosNombres,
          coordinador: coordinador || "",
          usuario: usuarioNombre || "",
          fechaHora: new Date().toLocaleString("es-PE"),
          urlComprobante: directUrl,
          extraInfo,
          preOpenWindow: waWindowRef.current,
        });
        if (!r.total) toast.message("No se encontro celular de coordinador");
      } else if (waWindowRef.current && !waWindowRef.current.closed) {
        waWindowRef.current.close();
      }
    } catch {
      toast.error("No se pudo subir la guia a Storage");
      return false;
    }

    return true;
  }


  // -----------------------
  // Construccin payload (MISMA lgica que t ya tienes)
  // -----------------------
  function buildPayload() {
    const materiales: any[] = [];

    for (const id of MATS_INST) {
      if (id === "BOBINA") continue;


      const und = Math.max(0, Math.trunc(numOr0(matUnd[id] || "0")));
      const m = Math.max(0, numOr0(matMetros[id] || "0"));

      if (und > 0) materiales.push({ materialId: id, und });
      else if (m > 0) materiales.push({ materialId: id, metros: m });
    }
    // TARUGOS_P siempre acompaï¿½a a ANCLAJE_P (1:1), interno
    const anclajeUnd = Math.max(0, Math.trunc(numOr0(matUnd.ANCLAJE_P || "0")));
    if (anclajeUnd > 0) materiales.push({ materialId: "TARUGOS_P", und: anclajeUnd });

    if (segmento === "RESIDENCIAL") {
      const codes = bobinaCodes;
      if (codes.length) materiales.push({ materialId: "BOBINA", metros: codes.length * 1000 });

      const payload = {
        transferId: ensureTransferId(),
        cuadrillaId,
        equipos: equipos.map((e) => e.sn),
        materiales,
        bobinasResidenciales: codes.map((codigoRaw) => ({ codigoRaw })),
        observacion,
      };

      return { payload, extra: { codesCount: codes.length } };
    } else {
      const m = Math.max(0, numOr0(bobinaCondominioMetros || "0"));
      if (m > 0) materiales.push({ materialId: "BOBINA", metros: m });

      const payload = { transferId: ensureTransferId(), cuadrillaId, equipos: equipos.map((e) => e.sn), materiales, observacion };
      return { payload, extra: { metros: m } };
    }
  }

  // -----------------------
  // Validacin para abrir preview (como el otro)
  // -----------------------
  function canOpenPreview() {
    if (!cuadrillaId) return { ok: false, msg: "Falta cuadrillaId." };

    const { payload } = buildPayload();
    const mats = (payload as any).materiales || [];
    const tieneMateriales = mats.length > 0;
    const tieneEquipos = equipos.length > 0;

    if (segmento === "RESIDENCIAL") {
      const codes = bobinaCodes;
      const tieneBobinas = codes.length > 0;
      if (!tieneMateriales && !tieneEquipos && !tieneBobinas) {
        return { ok: false, msg: "Para RESIDENCIAL: agrega equipos, materiales o al menos 1 bobina (cdigo)." };
      }
    } else {
      const m = Math.max(0, numOr0(bobinaCondominioMetros));
      const tieneMetros = m > 0;
      if (!tieneMateriales && !tieneEquipos && !tieneMetros) {
        return { ok: false, msg: "Para CONDOMINIO: agrega equipos, materiales o metros de bobina." };
      }
    }
    return { ok: true as const, msg: "" };
  }

  const abrirPreview = () =>
    guard(() => {
      const v = canOpenPreview();
      if (!v.ok) {
        toast.error(v.msg);
        return;
      }
      setShowPreview(true);
    });

  const confirmar = () =>
    guard(() => {
      if (pending) return;
      if (!waWindowRef.current || waWindowRef.current.closed) {
        const w = window.open("about:blank", "_blank");
        if (w) w.opener = null;
        waWindowRef.current = w;
      }
      const { payload } = buildPayload();
      setLastPayload({ ...payload, segmento });

      startTransition(() => (run as any)(payload));
    });

  // -----------------------
  // UI
  // -----------------------
  return (
    <div className="space-y-5">
      {pending && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30">
          <div className="rounded-lg bg-white px-4 py-3 text-sm shadow">
            Registrando despacho...
          </div>
        </div>
      )}
      <fieldset disabled={pending} className={pending ? "opacity-60" : ""}>
        {/* Paso 1 */}
        {step === 1 && (
          <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-medium">Paso 1  -  Seleccionar cuadrilla</div>
            <div className="text-xs text-muted-foreground">
              Puedes buscar por nombre (si existe /api/cuadrillas/list) o ingresar el ID manual.
            </div>
          </div>

          {/* Combobox con bsqueda (si hay lista) */}
          {cuadrillas.length > 0 && (
            <div className="grid grid-cols-1 gap-3">
              <div className="relative">
                <label className="block text-sm font-medium">Cuadrilla</label>
                <input
                  value={busqueda}
                  onChange={(e) => {
                    const v = e.target.value;
                    setBusqueda(v);
                    setComboOpen(true);
                    if (!v.trim()) {
                      setInfoLoaded(false);
                      setCuadrillaId("");
                      setCuadrillaNombre("");
                      setCoordinador("");
                      setTecnicos("");
                      setZonaId("");
                    }
                  }}
                  onFocus={() => setComboOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") buscarYSeleccionarCuadrilla();
                    if (e.key === "Escape") setComboOpen(false);
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
                  placeholder="Escribe nombre o ID (ej: K1 MOTO o K1_MOTO)"
                />
                {cuadrillaId && (
                  <div className="mt-1 text-xs text-muted-foreground">ID: {cuadrillaId}</div>
                )}

                {comboOpen && (
                  <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                    {cuadrillasLoading && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">Cargando</div>
                    )}
                    {!cuadrillasLoading && filteredCuadrillas.length === 0 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">Sin resultados</div>
                    )}
                    {!cuadrillasLoading &&
                      filteredCuadrillas.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={async () => {
                            setBusqueda(c.nombre || c.id);
                            setCuadrillaId(c.id);
                            setInfoLoaded(false);
                            setStock(null);
                            setCuadrillaNombre("");
                            setCoordinador("");
                            setTecnicos("");
                            setZonaId("");
                            try {
                              await cargarInfoCuadrillaById(c.id);
                              toast.success("Cuadrilla cargada");
                            } catch (err: any) {
                              toast.error(err?.message || "Error cargando cuadrilla");
                            } finally {
                              setComboOpen(false);
                              setTimeout(() => snInputRef.current?.focus(), 0);
                            }
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                        >
                          <div className="font-medium">{c.nombre || c.id}</div>
                          <div className="text-xs text-muted-foreground">{c.id}</div>
                        </button>
                      ))}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* Fallback: ID manual + Segmento (si no hay lista) */}
          {cuadrillas.length === 0 && (
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-sm font-medium">Cuadrilla ID</label>
                <input
                  value={cuadrillaId}
                  onChange={(e) => setCuadrillaId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
                  placeholder="Ej: K35_MOTO"
                />
              </div>
            </div>
          )}

          {cuadrillas.length === 0 && (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!cuadrillaId}
                onClick={handleCargarInfo}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 hover:bg-slate-50 disabled:opacity-50"
              >
                Cargar info cuadrilla
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <button
              disabled={!cuadrillaId}
              onClick={() => setStep(2)}
              className="rounded bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>

          {/* Card resumen + Stock */}
          {infoLoaded && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm space-y-1 shadow-sm">
              <div className="font-medium">Resumen</div>
              <div>
                ID: <b>{cuadrillaId || ""}</b>  -  Segmento: <b>{segmento}</b>  -  Tipo: <b>{tipo}</b>
              </div>
              <div>Nombre: {cuadrillaNombre || ""}</div>
              <div>Zona: {zonaId || ""}</div>
              <div>Coordinador: {coordinador || ""}</div>
              <div>Tcnicos: {tecnicos || ""}</div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  disabled={!cuadrillaId || stockLoading}
                  onClick={() => cargarStockCuadrillaById(cuadrillaId, segmento)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 hover:bg-slate-50 disabled:opacity-50"
                >
                  {stockLoading ? "Cargando stock..." : "Ver stock (opcional)"}
                </button>
                {!stock && <span className="text-xs text-muted-foreground">Si no existe el endpoint, no se mostrar.</span>}
              </div>

              {stock && (
                <div className="pt-2 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <div className="text-xs font-medium mb-1">Materiales</div>
                    <div className="space-y-1">
                      {(stock.materiales || []).slice(0, 10).map((m, i) => (
                        <div key={i} className="text-xs flex justify-between gap-2">
                          <span className="truncate">{m.nombre || m.id}</span>
                          <span className="tabular-nums">{m.cantidad ?? m.metros ?? 0}</span>
                        </div>
                      ))}
                      {(stock.materiales || []).length > 10 && (
                        <div className="text-[11px] text-muted-foreground">+{(stock.materiales || []).length - 10} ms</div>
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <div className="text-xs font-medium mb-1">Equipos</div>
                    <div className="space-y-1">
                      {(stock.equipos || []).slice(0, 10).map((e, i) => (
                        <div key={i} className="text-xs flex justify-between gap-2">
                          <span className="truncate">{e.tipo || e.nombre || e.id}</span>
                          <span className="tabular-nums">{e.cantidad ?? 0}</span>
                        </div>
                      ))}
                      {(stock.equipos || []).length > 10 && (
                        <div className="text-[11px] text-muted-foreground">+{(stock.equipos || []).length - 10} ms</div>
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <div className="text-xs font-medium mb-1">Bobinas</div>
                    <div className="space-y-1">
                      {(stock.bobinas || []).slice(0, 10).map((b, i) => (
                        <div key={i} className="text-xs flex justify-between gap-2">
                          <span className="truncate">{b.nombre || b.id}</span>
                          <span className="tabular-nums">{b.metros ?? b.cantidad ?? 0}</span>
                        </div>
                      ))}
                      {(stock.bobinas || []).length > 10 && (
                        <div className="text-[11px] text-muted-foreground">+{(stock.bobinas || []).length - 10} ms</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {/* Paso 2 */}
        {step === 2 && (
          <div className="space-y-5">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 hover:bg-slate-50"
              onClick={() => {
                setStep(1);
                toast.message("Regresaste al Paso 1");
              }}
            >
               Paso 1
            </button>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
              <div className="font-medium">Cuadrilla</div>
              <div>
                ID: {cuadrillaId}  -  Segmento: {segmento}  -  Tipo: {tipo}
              </div>
              {!!cuadrillaNombre && <div>Nombre: {cuadrillaNombre}</div>}
            </div>
          </div>

          {/* Equipos: scanner */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="font-medium">Equipos (SN)  -  Scanner</div>
            <div className="mt-2 flex gap-2">
              <input
                ref={snInputRef}
                value={snInput}
                onChange={(e) => setSnInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddSN();
                  }
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono"
                placeholder="Escanea o escribe el SN y Enter"
              />
              <button
                type="button"
                onClick={handleAddSN}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-50"
                disabled={!snInput.trim()}
              >
                Agregar
              </button>
            </div>
            {snValidating && (
              <div className="mt-1 text-xs text-muted-foreground">Validando SN...</div>
            )}
            {pendingScans > 0 && (
              <div className="mt-1 text-xs text-slate-500">En cola: {pendingScans}</div>
            )}

            <div className="mt-2 text-xs text-muted-foreground">Total: {resumenEquipos}</div>

            {equipos.length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="text-left px-3 py-2">SN</th>
                      <th className="text-left px-3 py-2">Equipo</th>
                      <th className="text-right px-3 py-2">Accion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {equipos.map((e) => (
                      <tr key={e.sn} className="border-t border-slate-200">
                        <td className="px-3 py-2 font-mono">{e.sn}</td>
                        <td className="px-3 py-2">{e.tipo || "OTROS"}</td>
                        <td className="px-3 py-2 text-right">
                          <button className="text-red-600 hover:underline" onClick={() => handleRemoveSN(e.sn)}>
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </div>

          {/* Bobinas residencial */}
          {segmento === "RESIDENCIAL" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2 shadow-sm">
              <div className="font-medium">Bobinas (RESIDENCIAL)  -  Codigos</div>
              <div className="flex gap-2">
                <input
                  value={bobinaInput}
                  onChange={(e) => setBobinaInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && handleAddBobina()}
                  placeholder="WIN-1234"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono"
                />
                <button
                  type="button"
                  onClick={handleAddBobina}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
                >
                  Agregar
                </button>
              </div>
              <div className="text-xs text-muted-foreground">
                Total bobinas: {bobinaCodes.length}  -  Total metros: {bobinaCodes.length * 1000}
              </div>

              {bobinaCodes.length > 0 && (
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        <th className="text-left px-3 py-2">Codigo</th>
                        <th className="text-right px-3 py-2">Accion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bobinaCodes.map((code) => (
                        <tr key={code} className="border-t border-slate-200">
                          <td className="px-3 py-2 font-mono">{code}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              className="text-red-600 hover:underline"
                              onClick={() => handleRemoveBobina(code)}
                            >
                              Eliminar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}


          {/* Materiales */}

          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2 shadow-sm">
            <div className="font-medium">Materiales (INSTALACIONES)</div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {MATS_INST.map((id) => {
                if (id === "BOBINA" && segmento === "RESIDENCIAL") return null;
                const unidad = materialUnits[id];
                return (
                  <div key={id} className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <div className="text-sm font-medium">{id}</div>

                    {id === "BOBINA" && segmento === "CONDOMINIO" ? (
                      <div className="mt-2">
                        <label className="block text-xs">Metros</label>
                        <input
                          value={bobinaCondominioMetros}
                          onChange={(e) => setBobinaCondominioMetros(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1"
                          inputMode="decimal"
                        />
                      </div>
                    ) : unidad === "UND" ? (
                      <div className="mt-2 text-xs">
                        <label className="block">UND</label>
                        <input
                          value={matUnd[id] || ""}
                          onChange={(e) => handleMatUndChange(id, e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1"
                          inputMode="numeric"
                          pattern="[0-9]*"
                        />
                      </div>
                    ) : unidad === "METROS" ? (
                      <div className="mt-2 text-xs">
                        <label className="block">Metros</label>
                        <input
                          value={matMetros[id] || ""}
                          onChange={(e) => setMatMetros((p) => ({ ...p, [id]: e.target.value }))}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1"
                          inputMode="decimal"
                        />
                      </div>
                    ) : (
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <label className="block">UND</label>
                          <input
                            value={matUnd[id] || ""}
                            onChange={(e) => handleMatUndChange(id, e.target.value)}
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1"
                            inputMode="numeric"
                            pattern="[0-9]*"
                          />
                        </div>
                        <div>
                          <label className="block">Metros</label>
                          <input
                            value={matMetros[id] || ""}
                            onChange={(e) => setMatMetros((p) => ({ ...p, [id]: e.target.value }))}
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1"
                            inputMode="decimal"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="font-medium">Observación</div>
            <textarea
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-2 py-1"
              rows={3}
              placeholder="Observaciones del despacho"
            />
          </div>

          {/* Acciones: Preview / Confirmar */}
          <div className="pt-2 flex gap-2 items-center">
            <button
              type="button"
              disabled={pending || !cuadrillaId}
              onClick={abrirPreview}
              className="rounded-xl bg-fuchsia-600 px-4 py-2 text-white hover:bg-fuchsia-700 disabled:opacity-50"
            >
              {pending ? "Procesando..." : "Previsualizar"}
            </button>

            {result?.ok && (result as any)?.resumen?.warnings?.length > 0 && (
              <span className="text-xs text-amber-700">{(result as any).resumen.warnings.length} aviso(s)</span>
            )}
          </div>

          {/* Printable area (tu misma lgica) */}
          {result?.ok && (
            <div id="print-area" className="hidden print:block">
              <div>
                <div>Gua: {(result as any).guia}</div>
                <div>
                  Cuadrilla: {cuadrillaId}  -  Segmento: {segmento}
                </div>
                <div>Fecha: {new Date().toLocaleString()}</div>
              </div>
              <div className="mt-2">
                <div className="font-medium">Equipos</div>
                {(lastPayload?.equipos || []).map((sn: string) => (
                  <div key={sn} className="text-xs">
                    {sn}
                  </div>
                ))}
              </div>
              <div className="mt-2">
                <div className="font-medium">Materiales</div>
                {(lastPayload?.materiales || [])
                  .filter((m: any) => String(m?.materialId || "") !== "TARUGOS_P")
                  .map((m: any, idx: number) => (
                  <div key={idx} className="text-xs">
                    {m.materialId}: {m.und || m.metros}
                  </div>
                ))}
                {segmento === "RESIDENCIAL" && (lastPayload?.bobinasResidenciales || []).length > 0 && (
                  <div className="text-xs">
                    Bobinas: {(lastPayload?.bobinasResidenciales || []).map((b: any) => b.codigoRaw).join(", ")}
                  </div>
                )}
              </div>
            </div>
          )}

          <style jsx global>{`
            @media print {
              body * {
                visibility: hidden;
              }
              #print-area,
              #print-area * {
                visibility: visible;
              }
              #print-area {
                position: absolute;
                left: 0;
                top: 0;
                width: 80mm;
                padding: 8px;
              }
            }
          `}</style>
        </div>
      )}

      {/* Modal Preview */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl bg-white rounded-xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <div className="font-semibold">Resumen de despacho</div>
              <button
                onClick={() => setShowPreview(false)}
                className="text-gray-500 hover:text-gray-700"
                aria-label="Cerrar"
              >
                
              </button>
            </div>

            {(() => {
              const { payload } = buildPayload();
              const mats = (payload as any).materiales || [];
              const bobinasRes = (payload as any).bobinasResidenciales || [];
              return (
                <div className="p-5 space-y-4 text-sm">
                  <div className="grid sm:grid-cols-2 gap-2">
                    <div>
                      <b>Cuadrilla ID:</b> {cuadrillaId}
                    </div>
                    <div>
                      <b>Segmento:</b> {segmento}
                    </div>
                    <div>
                      <b>Tipo:</b> {tipo}
                    </div>
                    <div>
                      <b>Fecha:</b> {new Date().toLocaleString("es-PE")}
                    </div>
                    {!!cuadrillaNombre && (
                      <div className="sm:col-span-2">
                        <b>Nombre:</b> {cuadrillaNombre}
                      </div>
                    )}
                    {!!tecnicos && (
                      <div className="sm:col-span-2">
                        <b>Tecnicos:</b> {tecnicos}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <b>Equipos ({equipos.length})</b>
                    {equipos.length === 0 ? (
                      <div className="text-slate-500">-</div>
                    ) : (
                      <ul className="list-disc pl-5 mt-1">
                        {equipos.map((e) => (
                          <li key={e.sn} className="font-mono">
                            {e.sn}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <b>Materiales ({mats.length})</b>
                    {mats.length === 0 ? (
                      <div className="text-slate-500"></div>
                    ) : (
                      <ul className="list-disc pl-5 mt-1">
                        {mats
                          .filter((m: any) => String(m?.materialId || "") !== "TARUGOS_P")
                          .map((m: any, i: number) => (
                          <li key={i}>
                            {m.materialId}: {m.und ? `${m.und} UND` : `${m.metros} m`}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {segmento === "RESIDENCIAL" && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <b>Bobinas RESIDENCIAL</b>
                      {bobinasRes.length === 0 ? (
                        <div className="text-slate-500"></div>
                      ) : (
                        <>
                          <div className="text-xs text-muted-foreground">
                            Cantidad: {bobinasRes.length}  -  Total metros: {bobinasRes.length * 1000}
                          </div>
                          <div className="mt-1 text-xs break-words">
                            {bobinasRes.map((b: any) => b.codigoRaw).join(", ")}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {segmento === "CONDOMINIO" && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <b>Bobina CONDOMINIO (metros)</b>
                      <div>{Math.max(0, numOr0(bobinaCondominioMetros))}</div>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="px-5 py-4 border-t flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={confirmar}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {pending ? "Registrando..." : "Confirmar y Registrar"}
              </button>
            </div>
          </div>
        </div>
        )}
      </fieldset>
    </div>
  );
}






