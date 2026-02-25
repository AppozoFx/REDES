"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import "dayjs/locale/es";
import toast from "react-hot-toast";
import Select from "react-select";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

/* =========================
   Config dayjs
========================= */
dayjs.extend(customParseFormat);
dayjs.locale("es");

/* =========================
   Helpers
========================= */
const cls = (...x: (string | false | null | undefined)[]) => x.filter(Boolean).join(" ");
const parseIntSafe = (v: unknown) => {
  const n = parseInt(String(v), 10);
  return Number.isNaN(n) ? 0 : n;
};
const valorONulo = (v: unknown) => (v !== undefined && v !== "" ? v : null);

const useDebounce = (value: string, delay = 350) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
};

// --- Helpers para cuadrillas K# RESIDENCIAL / K# MOTO ---
const RX_CUADRILLA = /^K\s?(\d+)\s+(RESIDENCIAL|MOTO)$/i;

const parseCuadrilla = (nombre: unknown) => {
  if (!nombre) return null;
  const m = String(nombre).trim().match(RX_CUADRILLA);
  if (!m) return null;
  return { num: parseInt(m[1], 10), tipo: m[2].toUpperCase() };
};

// Prioridad de grupo: RESIDENCIAL (0) antes que MOTO (1)
const groupOrder = (tipo?: string) => (tipo === "RESIDENCIAL" ? 0 : 1);

const convertirAFecha = (valor: any) => {
  if (!valor) return null;
  if (typeof valor?.toDate === "function") return valor.toDate();
  if (typeof valor === "string" && valor.includes("T")) return new Date(valor);

  const parseada = dayjs(valor, "D [de] MMMM [de] YYYY, h:mm:ss A [UTC-5]", "es", true);
  return parseada.isValid() ? parseada.toDate() : new Date(valor);
};

const formatearFecha = (fecha: Date | null) => (fecha ? dayjs(fecha).format("DD/MM/YYYY") : "-");

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const resaltarPlanHTML = (planTexto: unknown) => {
  const base = String(planTexto ?? "");
  if (!base.trim()) return "-";
  const palabras = [
    { texto: "INTERNETGAMER", color: "bg-green-300", tip: "Paquete especial para gamers" },
    { texto: "KIT WIFI PRO (EN VENTA)", color: "bg-blue-300", tip: "Incluye Kit Wifi Pro en venta" },
    { texto: "SERVICIO CABLEADO DE MESH", color: "bg-purple-300", tip: "Servicio adicional de cableado para MESH" },
  ];
  let out = base;
  palabras.forEach(({ texto, color, tip }) => {
    const rx = new RegExp(escapeRegExp(texto), "gi");
    const span = `<span class='px-1 ${color} font-bold rounded cursor-help' title='${tip}'>${texto}</span>`;
    out = out.replace(rx, span);
  });
  return out;
};

const toArray = (v: unknown) => {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") return [v];
  return [];
};

/* =========================
   Componente principal
========================= */
export default function InstalacionesClient() {
  const [isDark, setIsDark] = useState(false);
  const [instalaciones, setInstalaciones] = useState<any[]>([]);
  const [cargando, setCargando] = useState(false);
  const [ediciones, setEdiciones] = useState<Record<string, any>>({});
  const [guardandoFila, setGuardandoFila] = useState<string | null>(null);

  const [sort, setSort] = useState({ key: "__fechaCuadrilla__", dir: "asc" as "asc" | "desc" });
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const [filtros, setFiltros] = useState({
    mes: dayjs().format("YYYY-MM"),
    dia: "",
    cuadrilla: "",
    tipoCuadrilla: [] as string[],
    busqueda: "",
    filtrarPlanGamer: false,
    filtrarKitWifiPro: false,
    filtrarCableadoMesh: false,
    filtrarObservacion: false,
    cat5eFiltro: "",
  });

  const debouncedBusqueda = useDebounce(filtros.busqueda);

  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setIsDark(root.classList.contains("dark") || mq.matches);
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    mq.addEventListener?.("change", sync);
    return () => {
      obs.disconnect();
      mq.removeEventListener?.("change", sync);
    };
  }, []);

  /* ===== Sticky offsets / mediciones ===== */
  const kpiRef = useRef<HTMLDivElement | null>(null);
  const theadRef = useRef<HTMLTableSectionElement | null>(null);
  const [theadH, setTheadH] = useState(0);
  const [headPinned, setHeadPinned] = useState(false);

  useEffect(() => {
    const recalc = () => {
      const kpiH = kpiRef.current?.getBoundingClientRect().height || 0;
      const thH = theadRef.current?.getBoundingClientRect().height || 0;
      setTheadH(thH);

      if (theadRef.current) {
        const currentTop = theadRef.current.getBoundingClientRect().top;
        setHeadPinned(currentTop <= kpiH + 0.5);
      }
    };

    recalc();
    window.addEventListener("resize", recalc, { passive: true });
    window.addEventListener("scroll", recalc, { passive: true });

    const ro = new ResizeObserver(recalc);
    if (kpiRef.current) ro.observe(kpiRef.current);
    if (theadRef.current) ro.observe(theadRef.current);

    return () => {
      window.removeEventListener("resize", recalc);
      window.removeEventListener("scroll", recalc);
      ro.disconnect();
    };
  }, []);

  /* =========================
     Datos base
  ========================= */
  useEffect(() => {
    obtenerInstalaciones();
  }, [filtros.mes, filtros.dia]);

  const obtenerInstalaciones = async ({ keepPage = false } = {}) => {
    setCargando(true);
    try {
      const params = new URLSearchParams();
      if (filtros.dia) {
        params.set("ymd", filtros.dia);
      } else {
        params.set("ym", filtros.mes);
      }

      const res = await fetch(`/api/instalaciones/list?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Error al obtener instalaciones");

      setInstalaciones(json?.items || []);
    } catch (e) {
      console.error(e);
      toast.error("Error al obtener instalaciones");
    } finally {
      setCargando(false);
      if (!keepPage) setPage(1);
    }
  };

  /* =========================
     Opciones select
  ========================= */
  const opcionesTipoCuadrilla = useMemo(() => {
    return [...new Set(instalaciones.map((l) => l.tipoCuadrilla).filter(Boolean))].map((t) => ({
      value: t,
      label: t,
    }));
  }, [instalaciones]);

  /* =========================
     Filtro + Orden
  ========================= */
  const instalacionesFiltradas = useMemo(() => {
    const deb = (debouncedBusqueda || "").trim().toLowerCase();

    const base = instalaciones.filter((l) => {
      const filtroCuadrilla = String(filtros.cuadrilla || "").trim().toLowerCase();
      const coincideCuadrilla = filtroCuadrilla
        ? String(l.cuadrillaNombre || "").toLowerCase().includes(filtroCuadrilla)
        : true;

      const coincideTipoCuadrilla =
        filtros.tipoCuadrilla.length > 0 ? filtros.tipoCuadrilla.includes(l.tipoCuadrilla) : true;

      const coincideBusqueda = deb
        ? (l.codigoCliente || "").toString().toLowerCase().includes(deb) ||
          (l.cliente || "").toLowerCase().includes(deb)
        : true;

      const hayFiltroAddons =
        filtros.filtrarPlanGamer || filtros.filtrarKitWifiPro || filtros.filtrarCableadoMesh;

      const cumpleGrupoAddons = !hayFiltroAddons
        ? true
        : (
            (filtros.filtrarPlanGamer && !!(l.planGamer && String(l.planGamer).trim() !== "")) ||
            (filtros.filtrarKitWifiPro && !!(l.kitWifiPro && String(l.kitWifiPro).trim() !== "")) ||
            (filtros.filtrarCableadoMesh &&
              !!(l.servicioCableadoMesh && String(l.servicioCableadoMesh).trim() !== ""))
          );

      const cumpleCat5e =
        filtros.cat5eFiltro !== ""
          ? parseIntSafe(l.cat5e) === parseInt(String(filtros.cat5eFiltro), 10)
          : true;

      const cumpleObservacion =
        !filtros.filtrarObservacion || (l.observacion && l.observacion.trim() !== "");

      return (
        coincideCuadrilla &&
        coincideTipoCuadrilla &&
        coincideBusqueda &&
        cumpleGrupoAddons &&
        cumpleCat5e &&
        cumpleObservacion
      );
    });

    const sorted = [...base].sort((a, b) => {
      if (sort.key === "__fechaCuadrilla__") {
        const ta = convertirAFecha(a.fechaInstalacion)?.getTime() ?? 0;
        const tb = convertirAFecha(b.fechaInstalacion)?.getTime() ?? 0;
        if (ta !== tb) return ta - tb;

        const pa = parseCuadrilla(a.cuadrillaNombre);
        const pb = parseCuadrilla(b.cuadrillaNombre);
        const goA = groupOrder(pa?.tipo);
        const goB = groupOrder(pb?.tipo);
        if (goA !== goB) return goA - goB;
        return (pa?.num ?? 0) - (pb?.num ?? 0);
      }

      const k = sort.key as string;
      let va = a[k];
      let vb = b[k];

      if (k === "fechaInstalacion") {
        va = convertirAFecha(va)?.getTime() ?? 0;
        vb = convertirAFecha(vb)?.getTime() ?? 0;
      }

      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();

      if (va < vb) return sort.dir === "asc" ? -1 : 1;
      if (va > vb) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [instalaciones, filtros, debouncedBusqueda, sort]);

  /* =========================
     KPIs
  ========================= */
  const kpis = useMemo(() => {
    const total = instalacionesFiltradas.length;
    const countArray = (arr: unknown) => (Array.isArray(arr) ? arr.filter(Boolean).length : 0);

    const totalONT = instalacionesFiltradas.filter((l) => l.snONT).length;
    const totalMESH = instalacionesFiltradas.reduce((acc, l) => acc + countArray(l.snMESH), 0);
    const totalBOX = instalacionesFiltradas.reduce((acc, l) => acc + countArray(l.snBOX), 0);
    const totalFONO = instalacionesFiltradas.filter((l) => l.snFONO).length;

    const totalGamer = instalacionesFiltradas.filter((l) => !!l.planGamer).length;
    const totalWifiPro = instalacionesFiltradas.filter((l) => !!l.kitWifiPro).length;
    const totalCableado = instalacionesFiltradas.filter((l) => !!l.servicioCableadoMesh).length;

    const totalCat5e = instalacionesFiltradas.reduce((acc, l) => acc + parseIntSafe(l.cat5e), 0);
    const totalCat6 = instalacionesFiltradas.reduce((acc, l) => acc + parseIntSafe(l.cat6), 0);

    return {
      total,
      totalONT,
      totalMESH,
      totalBOX,
      totalFONO,
      totalGamer,
      totalWifiPro,
      totalCableado,
      totalCat5e,
      totalCat6,
      totalUTP: totalCat5e + totalCat6,
    };
  }, [instalacionesFiltradas]);

  /* =========================
     Paginacion
  ========================= */
  const totalPages = Math.max(1, Math.ceil(instalacionesFiltradas.length / pageSize));
  const pageData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return instalacionesFiltradas.slice(start, start + pageSize);
  }, [instalacionesFiltradas, page]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  /* =========================
     Eventos UI
  ========================= */
  const setSortKey = (key: string) => {
    setSort((prev) => {
      if (prev.key === key) return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      return { key, dir: "asc" };
    });
  };

  const handleFiltroInput = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFiltros((prev) => ({ ...prev, [name]: value }));
    setPage(1);
  };

  const limpiarFiltros = () => {
    setFiltros({
      mes: dayjs().format("YYYY-MM"),
      dia: "",
      cuadrilla: "",
      tipoCuadrilla: [],
      busqueda: "",
      filtrarPlanGamer: false,
      filtrarKitWifiPro: false,
      filtrarCableadoMesh: false,
      filtrarObservacion: false,
      cat5eFiltro: "",
    });
    setPage(1);
  };

  const handleEdicionChange = (id: string, campo: string, valor: any) => {
    setEdiciones((prev) => ({
      ...prev,
      [id]: { ...prev[id], [campo]: valor },
    }));
  };

  const guardarFila = async (row: any) => {
    const cambios = { ...(ediciones[row.id] || {}) };
    if (!cambios) {
      toast.error("No hay cambios para guardar");
      return;
    }
    const planGamerChecked = (cambios.planGamer ?? row.planGamer ?? "") !== "";
    const cableadoChecked = (cambios.servicioCableadoMesh ?? row.servicioCableadoMesh ?? "") !== "";
    const cat5Val = parseIntSafe(cambios.cat5e ?? row.cat5e ?? 0);
    const cat6Val = planGamerChecked ? 1 : parseIntSafe(cambios.cat6 ?? row.cat6 ?? 0);
    const cat5Final = cableadoChecked ? Math.max(0, cat5Val) : 0;
    const puntosUTP = cat5Final + cat6Val;

    cambios.cat5e = cat5Final;
    cambios.cat6 = cat6Val;
    cambios.puntosUTP = puntosUTP;
    try {
      setGuardandoFila(row.id);
      const res = await fetch("/api/instalaciones/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, ...cambios }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Error al guardar cambios");

      toast.success("Cambios guardados");
      await obtenerInstalaciones({ keepPage: true });
      setEdiciones((prev) => {
        const cp = { ...prev } as Record<string, any>;
        delete cp[row.id];
        return cp;
      });
    } catch (e) {
      console.error(e);
      toast.error("Error al guardar cambios");
    } finally {
      setGuardandoFila(null);
    }
  };

  /* =========================
     Drawer
  ========================= */
  const [detalleOpen, setDetalleOpen] = useState(false);
  const [detalleItem, setDetalleItem] = useState<any | null>(null);

  const abrirDetalle = (item: any) => {
    setDetalleItem(item);
    setDetalleOpen(true);
  };

  const cerrarDetalle = () => {
    setDetalleOpen(false);
    setDetalleItem(null);
  };

  const renderLinea = (label: string, value: any) => (
    <div className="flex items-start gap-2 text-sm">
      <span className="w-32 shrink-0 text-slate-500 dark:text-slate-400">{label}</span>
      <span className="break-words text-slate-800 dark:text-slate-100">{value || "-"}</span>
    </div>
  );

  /* =========================
     Exportar Excel
  ========================= */
  const handleExportarExcel = () => {
    const dataExportar = instalacionesFiltradas.map((l, idx) => {
      const fecha = convertirAFecha(l.fechaInstalacion);
      const cat5 = parseIntSafe(l.cat5e);
      const cat6 = parseIntSafe(l.cat6);
      const puntos = cat5 + cat6;

      const planTxt = (l.planGamer ?? "").toString().trim();
      const kitTxt = (l.kitWifiPro ?? "").toString().trim();
      const esGamer = planTxt.toUpperCase() === "GAMER" || planTxt.toUpperCase().includes("GAMER");
      const esKit = kitTxt.toUpperCase() === "KIT WIFI PRO (AL CONTADO)";

      const actaVal = Array.isArray(l.acta) ? l.acta.filter(Boolean).join(", ") : valorONulo(l.acta);

      let obsContrata = "";
      if (cat5 > 0) {
        const extras = [] as string[];
        if (esGamer) extras.push("Se realizo Plan Gamer Cat.6");
        if (esKit) extras.push("KIT WIFI PRO");
        obsContrata = `Se realizo ${cat5} Cableado UTP Cat.5e${extras.length ? " + " + extras.join(" + ") : ""}`;
      } else {
        const extras = [] as string[];
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
        "N": idx + 1,
        "Fecha Instalacion": formatearFecha(fecha),
        "Tipo de Servicio": "INSTALACION",
        "Nombre de Partida": "Ultima Milla",
        "Cuadrilla": valorONulo(l.cuadrillaNombre),
        "Acta": actaVal,
        "Codigo Cliente": valorONulo(l.codigoCliente),
        "Documento": valorONulo(l.documento),
        "Cliente": valorONulo(l.cliente),
        "Direccion": valorONulo(l.direccion),
        "Tipo Orden": valorONulo(l.tipoOrden),
        "Plan": valorONulo(l.plan),
        "SN_ONT": valorONulo(l.snONT),
        "proid": valorONulo(l.proidONT ?? l.proid),
        ...meshCols,
        ...boxCols,
        "SN_FONO": valorONulo(l.snFONO),
        "metraje_instalado": valorONulo(l.metraje_instalado ?? l.metrajeInstalado),
        "Cantidad mesh": cantidadMesh,
        "rotuloNapCto": valorONulo(l.rotuloNapCto),
        "Observacion de la contrata": obsContrata || "",
        "Cableado UTP (MTS)": cableadoUTP,
        "Observacion": valorONulo(l.observacion),
        "Plan Gamer": valorONulo(l.planGamer),
        "KitWifiPro": valorONulo(l.kitWifiPro),
        "Servicio Cableado Mesh": valorONulo(l.servicioCableadoMesh),
        "Cat5e": cat5Cell,
        "Cat6": cat6Cell,
        "Puntos UTP": puntosCell,
      };
    });

    const ws = XLSX.utils.json_to_sheet(dataExportar);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Instalaciones");

    const fechaMes = dayjs(filtros.mes).format("MMMM_YYYY").toLowerCase();
    const fechaDia = filtros.dia ? `_${dayjs(filtros.dia).format("DD_MM_YYYY")}` : "";
    const nombreArchivo = `Instalaciones_REDES_${fechaMes}${fechaDia}.xlsx`;

    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([wbout], { type: "application/octet-stream" }), nombreArchivo);
    toast.success(`Archivo "${nombreArchivo}" exportado correctamente`);
  };

  /* =========================
     Render
  ========================= */
  return (
    <div className="p-4 text-slate-900 dark:text-slate-100">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Instalaciones</h1>
        <div className="flex gap-2">
          <button
            onClick={handleExportarExcel}
            className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2 rounded shadow"
          >
            Exportar a Excel
          </button>
          <button
            onClick={limpiarFiltros}
            className="rounded border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Limpiar filtros
          </button>
        </div>
      </div>

      {/* KPIs sticky */}
      <div
        ref={kpiRef}
        className="sticky top-0 z-20 mb-3 border border-blue-200 rounded-xl bg-gradient-to-r from-blue-50 via-white to-blue-50 p-3 shadow"
      >
        <div className="flex flex-wrap gap-4 items-center justify-between text-blue-900 text-[13px] font-medium">
          <span className="inline-flex items-center gap-2">
            <span className="bg-blue-600 text-white rounded-full px-3 py-1 text-xs font-bold">
              {kpis.total}
            </span>{" "}
            instalaciones
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="bg-gray-800 text-white rounded-full px-2 py-0.5 text-xs">ONT</span> {kpis.totalONT}
            <span className="bg-green-200 text-green-800 rounded-full px-2 py-0.5 text-xs">MESH</span> {kpis.totalMESH}
            <span className="bg-yellow-200 text-yellow-800 rounded-full px-2 py-0.5 text-xs">BOX</span> {kpis.totalBOX}
            <span className="bg-pink-200 text-pink-800 rounded-full px-2 py-0.5 text-xs">FONO</span> {kpis.totalFONO}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="bg-purple-200 text-purple-800 rounded-full px-2 py-0.5 text-xs">Gamer</span> {kpis.totalGamer}
            <span className="bg-blue-200 text-blue-800 rounded-full px-2 py-0.5 text-xs">Wifi Pro</span> {kpis.totalWifiPro}
            <span className="bg-orange-200 text-orange-800 rounded-full px-2 py-0.5 text-xs">Cableado</span> {kpis.totalCableado}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-800 dark:bg-slate-700 dark:text-slate-100">Cat5e</span> {kpis.totalCat5e}
            <span className="bg-slate-400 text-slate-900 rounded-full px-2 py-0.5 text-xs">Cat6</span> {kpis.totalCat6}
            <span className="bg-slate-800 text-white rounded-full px-2 py-0.5 text-xs">UTP</span> {kpis.totalUTP}
          </span>
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Mes</label>
          <input
            type="month"
            name="mes"
            value={filtros.mes}
            onChange={handleFiltroInput}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          />
        </div>

        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Dia</label>
          <input
            type="date"
            name="dia"
            value={filtros.dia}
            onChange={handleFiltroInput}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          />
        </div>

        <div className="flex flex-col">
          <label className="mb-1 text-sm font-medium text-gray-700 dark:text-slate-300">Tipo de Cuadrilla</label>
          <Select
            isMulti
            name="tipoCuadrilla"
            instanceId="instalaciones-tipo-cuadrilla"
            inputId="instalaciones-tipo-cuadrilla"
            options={opcionesTipoCuadrilla}
            className="text-sm"
            placeholder="Seleccionar..."
            value={opcionesTipoCuadrilla.filter((opt) => filtros.tipoCuadrilla.includes(opt.value))}
            onChange={(sel) => setFiltros((p) => ({ ...p, tipoCuadrilla: (sel || []).map((s) => s.value) }))}
            styles={
              isDark
                ? {
                    control: (base: any, state: any) => ({
                      ...base,
                      backgroundColor: "#020617",
                      borderColor: state.isFocused ? "#38bdf8" : "#334155",
                      boxShadow: "none",
                    }),
                    menu: (base: any) => ({ ...base, backgroundColor: "#0f172a", color: "#e2e8f0" }),
                    option: (base: any, state: any) => ({
                      ...base,
                      backgroundColor: state.isSelected ? "#1d4ed8" : state.isFocused ? "#1e293b" : "#0f172a",
                      color: "#e2e8f0",
                    }),
                    input: (base: any) => ({ ...base, color: "#e2e8f0" }),
                    placeholder: (base: any) => ({ ...base, color: "#94a3b8" }),
                    multiValue: (base: any) => ({ ...base, backgroundColor: "#1e293b" }),
                    multiValueLabel: (base: any) => ({ ...base, color: "#e2e8f0" }),
                  }
                : undefined
            }
          />
        </div>

        <div className="flex flex-col">
          <label className="mb-1 text-sm font-medium text-gray-700 dark:text-slate-300">Cuadrilla</label>
          <input
            type="text"
            name="cuadrilla"
            placeholder="Buscar cuadrilla"
            value={filtros.cuadrilla}
            onChange={handleFiltroInput}
            autoComplete="off"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          />
        </div>

        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Codigo o Cliente</label>
          <input
            type="text"
            name="busqueda"
            placeholder="Buscar codigo o cliente"
            value={filtros.busqueda}
            onChange={handleFiltroInput}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          />
        </div>

        <div className="col-span-full">
          <div className="flex flex-wrap gap-4 items-end">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={filtros.filtrarPlanGamer}
                onChange={(e) => setFiltros((p) => ({ ...p, filtrarPlanGamer: e.target.checked }))}
              />
              Plan Gamer
            </label>

            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={filtros.filtrarKitWifiPro}
                onChange={(e) => setFiltros((p) => ({ ...p, filtrarKitWifiPro: e.target.checked }))}
              />
              Kit Wifi Pro
            </label>

            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={filtros.filtrarCableadoMesh}
                onChange={(e) => setFiltros((p) => ({ ...p, filtrarCableadoMesh: e.target.checked }))}
              />
              Cableado Mesh
            </label>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Cat5e</label>
              <select
                name="cat5eFiltro"
                value={filtros.cat5eFiltro}
                onChange={handleFiltroInput}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">Todos</option>
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={filtros.filtrarObservacion}
                onChange={(e) => setFiltros((p) => ({ ...p, filtrarObservacion: e.target.checked }))}
              />
              Con observacion
            </label>

            <div className="ml-auto">
              <button
                onClick={() => obtenerInstalaciones({ keepPage: true })}
                disabled={cargando}
                className="bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-sm px-4 py-2 rounded shadow"
                title="Recargar datos sin perder filtros"
              >
                {cargando ? "Actualizando..." : "Refrescar tabla"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="relative overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 dark:bg-slate-800" ref={theadRef}>
            <tr className="text-center font-semibold text-gray-700 dark:text-slate-200">
              {[
                { k: "fechaInstalacion", lbl: "Fecha Instalacion", w: "w-40" },
                { k: "cuadrillaNombre", lbl: "Cuadrilla", w: "w-44" },
                { k: "codigoCliente", lbl: "Codigo", w: "w-32" },
                { k: "documento", lbl: "Documento", w: "w-40" },
                { k: "cliente", lbl: "Cliente", w: "w-56" },
                { k: "tipoOrden", lbl: "R/C", w: "w-36" },
                { k: "plan", lbl: "Plan", w: "min-w-[240px]" },
                { k: "snONT", lbl: "SN ONT", w: "w-40" },
                { k: "snMESH", lbl: "SN MESH", w: "w-56" },
                { k: "snBOX", lbl: "SN BOX", w: "w-56" },
                { k: "snFONO", lbl: "SN FONO", w: "w-40" },
                { k: "planGamer", lbl: "Plan Gamer", w: "w-32" },
                { k: "kitWifiPro", lbl: "Kit Wifi Pro", w: "w-36" },
                { k: "servicioCableadoMesh", lbl: "Cableado Mesh", w: "w-40" },
                { k: "cat5e", lbl: "Cat5e", w: "w-24" },
                { k: "cat6", lbl: "Cat6", w: "w-24" },
                { k: "puntos", lbl: "Puntos UTP", w: "w-28" },
                { k: "observacion", lbl: "Observacion", w: "min-w-[220px]" },
                { k: "accion", lbl: "Accion", w: "w-40" },
              ].map((col) => (
                <th
                  key={col.k}
                  className={cls("cursor-pointer select-none border border-slate-200 bg-gray-100 p-2 dark:border-slate-700 dark:bg-slate-800", col.w)}
                  onClick={() => col.k !== "accion" && setSortKey(col.k)}
                  title="Ordenar"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>{col.lbl}</span>
                    {sort.key === col.k && <span>{sort.dir === "asc" ? "^" : "v"}</span>}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {headPinned && (
              <tr aria-hidden>
                <td colSpan={19} style={{ height: theadH }} />
              </tr>
            )}

            {cargando ? (
              <tr>
                <td colSpan={19} className="p-6 text-center text-gray-500 dark:text-slate-400">
                  Cargando...
                </td>
              </tr>
            ) : pageData.length === 0 ? (
              <tr>
                <td colSpan={19} className="p-6 text-center text-gray-500 dark:text-slate-400">
                  No hay registros para los filtros seleccionados.
                </td>
              </tr>
            ) : (
              pageData.map((l) => {
                const f = convertirAFecha(l.fechaInstalacion);
                const planGamerChecked = (ediciones[l.id]?.planGamer ?? l.planGamer ?? "") !== "";
                const cableadoChecked = (ediciones[l.id]?.servicioCableadoMesh ?? l.servicioCableadoMesh ?? "") !== "";
                const cat5 = parseIntSafe(ediciones[l.id]?.cat5e ?? l.cat5e ?? 0);
                const cat6 = planGamerChecked ? 1 : parseIntSafe(ediciones[l.id]?.cat6 ?? l.cat6 ?? 0);
                const puntos = cat5 + cat6;

                return (
                  <tr key={l.id} className="text-center hover:bg-gray-50 dark:hover:bg-slate-800/70">
                    <td className="border border-slate-200 p-2 dark:border-slate-700">{formatearFecha(f)}</td>

                    <td className="border border-slate-200 p-2 dark:border-slate-700">{l.cuadrillaNombre || "-"}</td>
                    <td className="border border-slate-200 p-2 dark:border-slate-700">{l.codigoCliente || "-"}</td>
                    <td className="border border-slate-200 p-2 dark:border-slate-700">{l.documento || "-"}</td>
                    <td className="border border-slate-200 p-2 dark:border-slate-700">{l.cliente || "-"}</td>

                    <td className="border border-slate-200 p-2 dark:border-slate-700">{(l.tipoOrden || "-").toString()}</td>

                    <td
                      className="max-w-[360px] border border-slate-200 p-1 text-left dark:border-slate-700"
                      style={{ maxHeight: 64, overflowY: "auto" }}
                      dangerouslySetInnerHTML={{ __html: resaltarPlanHTML(l.plan) }}
                    />

                    <td className="border border-slate-200 p-2 dark:border-slate-700">{l.snONT || "-"}</td>

                    <td className="border border-slate-200 p-2 dark:border-slate-700">
                      {Array.isArray(l.snMESH) && l.snMESH.filter(Boolean).length > 0 ? (
                        <div className="flex flex-wrap gap-1 justify-center">
                          {l.snMESH.filter(Boolean).map((sn: string, i: number) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-800 border border-green-200"
                            >
                              {sn}
                            </span>
                          ))}
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>

                    <td className="border border-slate-200 p-2 dark:border-slate-700">
                      {Array.isArray(l.snBOX) && l.snBOX.filter(Boolean).length > 0 ? (
                        <div className="flex flex-wrap gap-1 justify-center">
                          {l.snBOX.filter(Boolean).map((sn: string, i: number) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-800 border border-yellow-200"
                            >
                              {sn}
                            </span>
                          ))}
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>

                    <td className="border border-slate-200 p-2 dark:border-slate-700">{l.snFONO || "-"}</td>

                    <td className="border border-slate-200 p-2 dark:border-slate-700">
                      <input
                        type="checkbox"
                        className="scale-110"
                        checked={(ediciones[l.id]?.planGamer ?? l.planGamer ?? "") !== ""}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          handleEdicionChange(l.id, "planGamer", checked ? "GAMER" : "");
                          if (!checked) handleEdicionChange(l.id, "cat6", 0);
                        }}
                      />
                    </td>

                    <td className="border border-slate-200 p-2 dark:border-slate-700">
                      <input
                        type="checkbox"
                        className="scale-110"
                        checked={(ediciones[l.id]?.kitWifiPro ?? l.kitWifiPro ?? "") !== ""}
                        onChange={(e) =>
                          handleEdicionChange(
                            l.id,
                            "kitWifiPro",
                            e.target.checked ? "KIT WIFI PRO (EN VENTA)" : ""
                          )
                        }
                      />
                    </td>

                    <td className="border border-slate-200 p-2 dark:border-slate-700">
                      <input
                        type="checkbox"
                        className="scale-110"
                        checked={(ediciones[l.id]?.servicioCableadoMesh ?? l.servicioCableadoMesh ?? "") !== ""}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          handleEdicionChange(
                            l.id,
                            "servicioCableadoMesh",
                            checked ? "SERVICIO CABLEADO DE MESH" : ""
                          );
                          if (!checked) handleEdicionChange(l.id, "cat5e", 0);
                        }}
                      />
                    </td>

                    <td className="border border-slate-200 p-1 dark:border-slate-700">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        disabled={!cableadoChecked}
                        value={ediciones[l.id]?.cat5e ?? l.cat5e ?? 0}
                        className="w-20 rounded border border-slate-300 px-2 py-1 text-center disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-800"
                        onChange={(e) => handleEdicionChange(l.id, "cat5e", Math.max(0, parseIntSafe(e.target.value)))}
                      />
                    </td>

                    <td className="border border-slate-200 p-2 dark:border-slate-700">{cat6}</td>
                    <td className="border border-slate-200 p-2 dark:border-slate-700">{puntos}</td>

                    <td className="border border-slate-200 p-1 dark:border-slate-700">
                      <input
                        type="text"
                        value={ediciones[l.id]?.observacion ?? l.observacion ?? ""}
                        className="w-full rounded border border-slate-300 px-2 py-1 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        onChange={(e) => handleEdicionChange(l.id, "observacion", e.target.value)}
                      />
                    </td>

                    <td className="border border-slate-200 p-2 dark:border-slate-700">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          className={cls(
                            "px-3 py-1 rounded text-xs text-white",
                            guardandoFila === l.id ? "bg-slate-400" : "bg-blue-600 hover:bg-blue-700"
                          )}
                          disabled={guardandoFila === l.id}
                          onClick={() => guardarFila(l)}
                        >
                          {guardandoFila === l.id ? "Guardando..." : "Guardar"}
                        </button>
                        <button
                          className="px-3 py-1 rounded text-xs text-white bg-slate-700 hover:bg-slate-800"
                          onClick={() => abrirDetalle(l)}
                        >
                          Detalle
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginacion */}
      <div className="mt-3 flex items-center justify-between">
        <div className="text-sm text-gray-600 dark:text-slate-400">
          Mostrando <strong>{pageData.length > 0 ? (page - 1) * pageSize + 1 : 0}</strong>-<strong>{
            (page - 1) * pageSize + pageData.length
          }</strong> de <strong>{instalacionesFiltradas.length}</strong>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded border border-slate-300 bg-white px-3 py-1 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            {"<"}
          </button>
          <span className="text-sm">
            Pagina <strong>{page}</strong> / {totalPages}
          </span>
          <button
            className="rounded border border-slate-300 bg-white px-3 py-1 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            {">"}
          </button>
        </div>
      </div>

      {/* Drawer */}
      {detalleOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={cerrarDetalle} />
          <div className="absolute right-0 top-0 h-full w-full max-w-[520px] overflow-y-auto border-l bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b p-4 dark:border-slate-700">
              <div>
                <div className="text-lg font-semibold">Detalle de instalacion</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Codigo: {detalleItem?.codigoCliente || "-"}</div>
              </div>
              <button
                className="rounded bg-slate-100 px-3 py-1 text-sm hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                onClick={cerrarDetalle}
              >
                Cerrar
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="text-sm font-semibold mb-2">Resumen</div>
                <div className="space-y-2">
                  {renderLinea("Cliente", detalleItem?.cliente)}
                  {renderLinea("Documento", detalleItem?.documento)}
                  {renderLinea("Direccion", detalleItem?.direccion)}
                  {renderLinea("Codigo", detalleItem?.codigoCliente)}
                  {renderLinea("Pedido", detalleItem?.orderId || detalleItem?.pedidoId)}
                  {renderLinea("Cuadrilla", detalleItem?.cuadrillaNombre)}
                  {renderLinea("Fecha", formatearFecha(convertirAFecha(detalleItem?.fechaInstalacion)))}
                  {renderLinea("Tipo Orden", detalleItem?.tipoOrden)}
                  {renderLinea("Plan", detalleItem?.plan)}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="text-sm font-semibold mb-2">Auditoria</div>
                <div className="space-y-2">
                  {renderLinea(
                    "Liquidado",
                    detalleItem?.liquidadoAt ? formatearFecha(convertirAFecha(detalleItem?.liquidadoAt)) : "-"
                  )}
                  {renderLinea("Liquidado por", detalleItem?.liquidadoBy)}
                  {renderLinea(
                    "Corregido",
                    detalleItem?.corregidoAt ? formatearFecha(convertirAFecha(detalleItem?.corregidoAt)) : "-"
                  )}
                  {renderLinea("Corregido por", detalleItem?.corregidoBy)}
                  {renderLinea("Estado", detalleItem?.corregido ? "CORREGIDA" : "LIQUIDADA")}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="text-sm font-semibold mb-2">Equipos</div>
                <div className="space-y-2">
                  {(() => {
                    const equipos = toArray(detalleItem?.equiposInstalados || detalleItem?.equipos || []);
                    if (!equipos.length) return <div className="text-sm text-slate-500 dark:text-slate-400">Sin equipos</div>;
                    return equipos.map((e: any, i: number) => (
                      <div key={i} className="text-sm border rounded px-2 py-1">
                        {e.tipo || e.kind || "Equipo"} {e.sn ? `- ${e.sn}` : ""} {e.proid ? `(PROID ${e.proid})` : ""}
                      </div>
                    ));
                  })()}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="text-sm font-semibold mb-2">Materiales</div>
                <div className="space-y-2">
                  {(() => {
                    const mats = toArray(detalleItem?.materialesConsumidos || detalleItem?.materiales || []);
                    if (!mats.length) return <div className="text-sm text-slate-500 dark:text-slate-400">Sin materiales</div>;
                    return mats.map((m: any, i: number) => (
                      <div key={i} className="text-sm border rounded px-2 py-1">
                        {m.tipo || m.nombre || "Material"} {m.cantidad ? `x ${m.cantidad}` : ""}
                      </div>
                    ));
                  })()}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="text-sm font-semibold mb-2">Llamadas</div>
                <div className="space-y-2">
                  {(() => {
                    const llamadas = toArray(detalleItem?.llamadas || detalleItem?.llamadasGestoras || []);
                    if (!llamadas.length) return <div className="text-sm text-slate-500 dark:text-slate-400">Sin llamadas</div>;
                    return llamadas.map((ll: any, i: number) => (
                      <div key={i} className="text-sm border rounded px-2 py-1">
                        <div>{ll.gestora || ll.user || ll.estadoLlamada || "Llamada"}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {ll.fecha ? formatearFecha(convertirAFecha(ll.fecha)) : ""}{" "}
                          {ll.resultado ? `- ${ll.resultado}` : ""}
                          {ll.horaInicioLlamada && ll.horaInicioLlamada !== "-" ? ` | ${ll.horaInicioLlamada}` : ""}
                          {ll.horaFinLlamada && ll.horaFinLlamada !== "-" ? ` - ${ll.horaFinLlamada}` : ""}
                        </div>
                        {ll.observacion || ll.observacionLlamada ? (
                          <div className="text-xs">{ll.observacion || ll.observacionLlamada}</div>
                        ) : null}
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
