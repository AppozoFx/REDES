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

const RX_CUADRILLA = /^K\s?(\d+)\s+(RESIDENCIAL|MOTO)$/i;

const parseCuadrilla = (nombre: unknown) => {
  if (!nombre) return null;
  const m = String(nombre).trim().match(RX_CUADRILLA);
  if (!m) return null;
  return { num: parseInt(m[1], 10), tipo: m[2].toUpperCase() };
};

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
  const [coordReadOnly, setCoordReadOnly] = useState(false);
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
    coordinador: "",
    tipoOrden: "",
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

  useEffect(() => {
    let mounted = true;
    const loadMe = async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok || !mounted) return;
        const roles = Array.isArray(json?.roles)
          ? json.roles.map((r: any) => String(r || "").toUpperCase())
          : [];
        const isCoord = roles.includes("COORDINADOR");
        setCoordReadOnly(Boolean(isCoord && !json?.isAdmin));
      } catch {
        if (mounted) setCoordReadOnly(false);
      }
    };
    loadMe();
    return () => { mounted = false; };
  }, []);

  const selectPortalStyles = {
    menuPortal: (base: any) => ({ ...base, zIndex: 9999 }),
  };

  const selectPortalProps = {
    menuPortalTarget: typeof document !== "undefined" ? document.body : null,
    menuPosition: "fixed" as const,
  };

  /* ===== Sticky offsets ===== */
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

  const opcionesCoordinador = useMemo(() => {
    const valores = new Map<string, string>();
    for (const row of instalaciones) {
      const label = String(row?.coordinadorNombre || row?.coordinador || row?.coordinadorUid || "").trim();
      if (!label) continue;
      valores.set(label, label);
    }
    return Array.from(valores.values()).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
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
      const valorCoordinador = String(l.coordinadorNombre || l.coordinador || l.coordinadorUid || "").trim();
      const coincideCoordinador = filtros.coordinador ? valorCoordinador === filtros.coordinador : true;
      const valorTipoOrden = String(l.tipoOrden || "").trim().toUpperCase();
      const coincideTipoOrden = filtros.tipoOrden ? valorTipoOrden === filtros.tipoOrden : true;

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
        coincideCoordinador &&
        coincideTipoOrden &&
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
      total, totalONT, totalMESH, totalBOX, totalFONO,
      totalGamer, totalWifiPro, totalCableado,
      totalCat5e, totalCat6, totalUTP: totalCat5e + totalCat6,
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
      coordinador: "",
      tipoOrden: "",
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
    <div className="flex items-start gap-3 text-sm">
      <span className="w-32 shrink-0 font-medium text-slate-500 dark:text-slate-400">{label}</span>
      <span className="break-words text-slate-800 dark:text-slate-100">{value || "-"}</span>
    </div>
  );

  /* =========================
     Exportar Excel
  ========================= */
  const handleExportarExcel = () => {
    // Paso 1: recolectar todos los nombres de material únicos del dataset filtrado
    const todosLosMateriales = new Set<string>();
    for (const l of instalacionesFiltradas) {
      const mats = Array.isArray(l.materialesConsumidos) ? l.materialesConsumidos : [];
      for (const m of mats) {
        const nombre = String(m.nombre || m.materialId || "").trim();
        if (nombre) todosLosMateriales.add(nombre);
      }
    }
    const nombresMateriales = Array.from(todosLosMateriales).sort();

    // Paso 2: construir filas
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

      // metraje_instalado: valor real desde los materiales liquidados
      // BOBINA → metros numérico  |  PRECON → nombre tal como está en materiales
      const mats = Array.isArray(l.materialesConsumidos) ? l.materialesConsumidos : [];
      const bobinaMat = mats.find((m: any) =>
        String(m.materialId || m.nombre || "").toUpperCase().includes("BOBINA")
      );
      const preconMat = mats.find((m: any) =>
        String(m.materialId || m.nombre || "").toUpperCase().includes("PRECON")
      );
      let metrajeCell: any = null;
      if (bobinaMat) {
        metrajeCell = bobinaMat.metros ?? bobinaMat.cantidad ?? null;
      } else if (preconMat) {
        metrajeCell = String(preconMat.nombre || preconMat.materialId || "PRECON_50").trim();
      } else {
        const rawMetraje = l.metraje_instalado ?? l.metrajeInstalado;
        metrajeCell = rawMetraje != null && rawMetraje !== "" ? rawMetraje : null;
      }

      // Columnas de materiales: una por cada material único del dataset
      // Valor: metros si tiene, sino cantidad
      const matCols: Record<string, any> = {};
      for (const nombre of nombresMateriales) {
        const mat = mats.find(
          (m: any) => String(m.nombre || m.materialId || "").trim() === nombre
        );
        matCols[nombre] = mat ? (mat.metros ?? mat.cantidad ?? null) : null;
      }

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
        "metraje_instalado": metrajeCell,
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
        ...matCols,
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
     Sort icon helper
  ========================= */
  const SortIcon = ({ col }: { col: string }) => {
    if (sort.key !== col)
      return <span className="text-slate-400 text-[10px] ml-0.5">⇅</span>;
    return (
      <span className="text-blue-500 text-[10px] ml-0.5 font-bold">
        {sort.dir === "asc" ? "▲" : "▼"}
      </span>
    );
  };

  /* =========================
     Render
  ========================= */
  const inputCls =
    "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-400";

  const colDefs = [
    { k: "fechaInstalacion", lbl: "Fecha", w: "w-32" },
    { k: "cuadrillaNombre", lbl: "Cuadrilla", w: "w-40" },
    { k: "codigoCliente", lbl: "Codigo", w: "w-28" },
    { k: "documento", lbl: "Documento", w: "w-36" },
    { k: "cliente", lbl: "Cliente", w: "w-52" },
    { k: "tipoOrden", lbl: "Tipo Orden", w: "w-28" },
    { k: "plan", lbl: "Plan", w: "min-w-[220px]" },
    { k: "snONT", lbl: "SN ONT", w: "w-36" },
    { k: "snMESH", lbl: "SN MESH", w: "w-52" },
    { k: "snBOX", lbl: "SN BOX", w: "w-52" },
    { k: "snFONO", lbl: "SN FONO", w: "w-36" },
    { k: "planGamer", lbl: "Gamer", w: "w-20" },
    { k: "kitWifiPro", lbl: "Wifi Pro", w: "w-24" },
    { k: "servicioCableadoMesh", lbl: "Cable Mesh", w: "w-28" },
    { k: "cat5e", lbl: "Cat5e", w: "w-20" },
    { k: "cat6", lbl: "Cat6", w: "w-20" },
    { k: "puntos", lbl: "UTP", w: "w-20" },
    { k: "observacion", lbl: "Observacion", w: "min-w-[200px]" },
    { k: "accion", lbl: "Acciones", w: "w-36" },
  ];

  return (
    <div className="p-4 text-slate-900 dark:text-slate-100">

      {/* ── Header ── */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Instalaciones
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Control y seguimiento de instalaciones liquidadas
            </p>
          </div>
          {coordReadOnly && (
            <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
              Solo lectura
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportarExcel}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 active:bg-emerald-800"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Exportar Excel
          </button>
          <button
            onClick={limpiarFiltros}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Limpiar filtros
          </button>
        </div>
      </div>

      {/* ── KPIs sticky ── */}
      <div
        ref={kpiRef}
        className="sticky top-0 z-20 mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"
      >
        <div className="flex flex-wrap divide-x divide-slate-100 dark:divide-slate-700">
          {/* Total */}
          <div className="flex items-center gap-2.5 px-4 py-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white">
              {kpis.total}
            </span>
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">instalaciones</span>
          </div>
          {/* Equipos */}
          <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Equipos</span>
            {[
              { lbl: "ONT", val: kpis.totalONT, cls: "bg-slate-700 text-white" },
              { lbl: "MESH", val: kpis.totalMESH, cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
              { lbl: "BOX", val: kpis.totalBOX, cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
              { lbl: "FONO", val: kpis.totalFONO, cls: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300" },
            ].map((k) => (
              <span key={k.lbl} className={cls("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold", k.cls)}>
                {k.lbl} <span className="font-bold">{k.val}</span>
              </span>
            ))}
          </div>
          {/* Servicios */}
          <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Servicios</span>
            {[
              { lbl: "Gamer", val: kpis.totalGamer, cls: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300" },
              { lbl: "Wifi Pro", val: kpis.totalWifiPro, cls: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300" },
              { lbl: "Cableado", val: kpis.totalCableado, cls: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" },
            ].map((k) => (
              <span key={k.lbl} className={cls("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold", k.cls)}>
                {k.lbl} <span className="font-bold">{k.val}</span>
              </span>
            ))}
          </div>
          {/* Cables */}
          <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cable</span>
            {[
              { lbl: "Cat5e", val: kpis.totalCat5e, cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
              { lbl: "Cat6", val: kpis.totalCat6, cls: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200" },
              { lbl: "UTP", val: kpis.totalUTP, cls: "bg-slate-800 text-white dark:bg-slate-600" },
            ].map((k) => (
              <span key={k.lbl} className={cls("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold", k.cls)}>
                {k.lbl} <span className="font-bold">{k.val}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Filtros ── */}
      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/40">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Mes</label>
            <input type="month" name="mes" value={filtros.mes} onChange={handleFiltroInput} className={inputCls} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Dia</label>
            <input type="date" name="dia" value={filtros.dia} onChange={handleFiltroInput} className={inputCls} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tipo Cuadrilla</label>
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
              {...selectPortalProps}
              styles={
                isDark
                  ? {
                      ...selectPortalStyles,
                      control: (base: any, state: any) => ({
                        ...base,
                        backgroundColor: "#020617",
                        borderColor: state.isFocused ? "#38bdf8" : "#334155",
                        boxShadow: "none",
                        borderRadius: "0.5rem",
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
                  : {
                      ...selectPortalStyles,
                      control: (base: any) => ({ ...base, borderRadius: "0.5rem" }),
                    }
              }
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Cuadrilla</label>
            <input
              type="text"
              name="cuadrilla"
              placeholder="Buscar cuadrilla"
              value={filtros.cuadrilla}
              onChange={handleFiltroInput}
              autoComplete="off"
              className={inputCls}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Coordinador</label>
            <select
              name="coordinador"
              value={filtros.coordinador}
              onChange={handleFiltroInput}
              disabled={coordReadOnly}
              className={inputCls}
            >
              <option value="">{coordReadOnly ? "Mi coordinacion" : "Todos"}</option>
              {opcionesCoordinador.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tipo Orden</label>
            <select name="tipoOrden" value={filtros.tipoOrden} onChange={handleFiltroInput} className={inputCls}>
              <option value="">Todos</option>
              <option value="CONDOMINIO">CONDOMINIO</option>
              <option value="RESIDENCIAL">RESIDENCIAL</option>
            </select>
          </div>

          <div className="flex flex-col gap-1 xl:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Codigo o Cliente</label>
            <input
              type="text"
              name="busqueda"
              placeholder="Buscar codigo o cliente..."
              value={filtros.busqueda}
              onChange={handleFiltroInput}
              className={inputCls}
            />
          </div>

          {/* Checkboxes y botones */}
          <div className="col-span-full mt-1">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {[
                {
                  key: "filtrarPlanGamer" as const,
                  label: "Plan Gamer",
                  cls: "text-violet-700 dark:text-violet-400",
                },
                {
                  key: "filtrarKitWifiPro" as const,
                  label: "Kit Wifi Pro",
                  cls: "text-sky-700 dark:text-sky-400",
                },
                {
                  key: "filtrarCableadoMesh" as const,
                  label: "Cableado Mesh",
                  cls: "text-orange-700 dark:text-orange-400",
                },
                {
                  key: "filtrarObservacion" as const,
                  label: "Con observacion",
                  cls: "text-slate-700 dark:text-slate-300",
                },
              ].map(({ key, label, cls: colorCls }) => (
                <label key={key} className={cls("inline-flex cursor-pointer items-center gap-2 text-sm font-medium select-none", colorCls)}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                    checked={filtros[key]}
                    onChange={(e) => setFiltros((p) => ({ ...p, [key]: e.target.checked }))}
                  />
                  {label}
                </label>
              ))}

              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Cat5e</label>
                <select
                  name="cat5eFiltro"
                  value={filtros.cat5eFiltro}
                  onChange={handleFiltroInput}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="">Todos</option>
                  {[0, 1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>

              <div className="ml-auto">
                <button
                  onClick={() => obtenerInstalaciones({ keepPage: true })}
                  disabled={cargando}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-sky-700 disabled:opacity-50 active:bg-sky-800"
                >
                  <svg className={cls("h-4 w-4", cargando && "animate-spin")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {cargando ? "Actualizando..." : "Refrescar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabla ── */}
      <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-700">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead ref={theadRef} className="bg-slate-50 dark:bg-slate-800">
              <tr className="text-center text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                {colDefs.map((col) => (
                  <th
                    key={col.k}
                    className={cls(
                      "cursor-pointer select-none whitespace-nowrap border-b border-slate-200 px-3 py-3 dark:border-slate-700",
                      col.w,
                      col.k !== "accion" && "hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
                    )}
                    onClick={() => col.k !== "accion" && setSortKey(col.k)}
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>{col.lbl}</span>
                      {col.k !== "accion" && <SortIcon col={col.k} />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 bg-white dark:bg-slate-900">
              {headPinned && (
                <tr aria-hidden>
                  <td colSpan={19} style={{ height: theadH }} />
                </tr>
              )}

              {cargando ? (
                <tr>
                  <td colSpan={19} className="py-16 text-center">
                    <div className="inline-flex flex-col items-center gap-2 text-slate-400 dark:text-slate-500">
                      <svg className="h-8 w-8 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span className="text-sm">Cargando instalaciones...</span>
                    </div>
                  </td>
                </tr>
              ) : pageData.length === 0 ? (
                <tr>
                  <td colSpan={19} className="py-16 text-center">
                    <div className="inline-flex flex-col items-center gap-2 text-slate-400 dark:text-slate-500">
                      <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="text-sm font-medium">Sin resultados</span>
                      <span className="text-xs">No hay registros para los filtros aplicados</span>
                    </div>
                  </td>
                </tr>
              ) : (
                pageData.map((l, rowIdx) => {
                  const f = convertirAFecha(l.fechaInstalacion);
                  const planGamerChecked = (ediciones[l.id]?.planGamer ?? l.planGamer ?? "") !== "";
                  const cableadoChecked = (ediciones[l.id]?.servicioCableadoMesh ?? l.servicioCableadoMesh ?? "") !== "";
                  const cat5 = parseIntSafe(ediciones[l.id]?.cat5e ?? l.cat5e ?? 0);
                  const cat6 = planGamerChecked ? 1 : parseIntSafe(ediciones[l.id]?.cat6 ?? l.cat6 ?? 0);
                  const puntos = cat5 + cat6;
                  const isEven = rowIdx % 2 === 0;

                  return (
                    <tr
                      key={l.id}
                      className={cls(
                        "text-center transition-colors hover:bg-blue-50/40 dark:hover:bg-blue-950/20",
                        isEven ? "bg-white dark:bg-slate-900" : "bg-slate-50/60 dark:bg-slate-800/30"
                      )}
                    >
                      {/* Fecha */}
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400">
                        {formatearFecha(f)}
                      </td>

                      {/* Cuadrilla */}
                      <td className="px-3 py-2.5">
                        {l.cuadrillaNombre ? (
                          <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                            {l.cuadrillaNombre}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* Codigo */}
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-700 dark:text-slate-300">
                        {l.codigoCliente || "-"}
                      </td>

                      {/* Documento */}
                      <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400">
                        {l.documento || "-"}
                      </td>

                      {/* Cliente */}
                      <td className="px-3 py-2.5 text-left text-xs font-medium text-slate-800 dark:text-slate-200">
                        {l.cliente || "-"}
                      </td>

                      {/* R/C */}
                      <td className="px-3 py-2.5">
                        {l.tipoOrden ? (
                          <span
                            className={cls(
                              "inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold",
                              l.tipoOrden === "RESIDENCIAL"
                                ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                                : "bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"
                            )}
                          >
                            {l.tipoOrden === "RESIDENCIAL" ? "RES" : l.tipoOrden === "CONDOMINIO" ? "COND" : l.tipoOrden}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* Plan */}
                      <td
                        className="max-w-[320px] px-2 py-1.5 text-left text-xs dark:border-slate-700"
                        style={{ maxHeight: 60, overflowY: "auto" }}
                        dangerouslySetInnerHTML={{ __html: resaltarPlanHTML(l.plan) }}
                      />

                      {/* SN ONT */}
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-400">
                        {l.snONT || "-"}
                      </td>

                      {/* SN MESH */}
                      <td className="px-2 py-2">
                        {Array.isArray(l.snMESH) && l.snMESH.filter(Boolean).length > 0 ? (
                          <div className="flex flex-wrap justify-center gap-1">
                            {l.snMESH.filter(Boolean).map((sn: string, i: number) => (
                              <span
                                key={i}
                                className="rounded-md bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800"
                              >
                                {sn}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </td>

                      {/* SN BOX */}
                      <td className="px-2 py-2">
                        {Array.isArray(l.snBOX) && l.snBOX.filter(Boolean).length > 0 ? (
                          <div className="flex flex-wrap justify-center gap-1">
                            {l.snBOX.filter(Boolean).map((sn: string, i: number) => (
                              <span
                                key={i}
                                className="rounded-md bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800"
                              >
                                {sn}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </td>

                      {/* SN FONO */}
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-400">
                        {l.snFONO || "-"}
                      </td>

                      {/* Plan Gamer */}
                      <td className="px-3 py-2.5">
                        {coordReadOnly ? (
                          <span
                            className={cls(
                              "inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold",
                              (ediciones[l.id]?.planGamer ?? l.planGamer ?? "") !== ""
                                ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                                : "bg-slate-100 text-slate-400 dark:bg-slate-800"
                            )}
                          >
                            {(ediciones[l.id]?.planGamer ?? l.planGamer ?? "") !== "" ? "Si" : "No"}
                          </span>
                        ) : (
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer rounded accent-violet-600"
                            checked={(ediciones[l.id]?.planGamer ?? l.planGamer ?? "") !== ""}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              handleEdicionChange(l.id, "planGamer", checked ? "GAMER" : "");
                              if (!checked) handleEdicionChange(l.id, "cat6", 0);
                            }}
                          />
                        )}
                      </td>

                      {/* Kit Wifi Pro */}
                      <td className="px-3 py-2.5">
                        {coordReadOnly ? (
                          <span
                            className={cls(
                              "inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold",
                              (ediciones[l.id]?.kitWifiPro ?? l.kitWifiPro ?? "") !== ""
                                ? "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
                                : "bg-slate-100 text-slate-400 dark:bg-slate-800"
                            )}
                          >
                            {(ediciones[l.id]?.kitWifiPro ?? l.kitWifiPro ?? "") !== "" ? "Si" : "No"}
                          </span>
                        ) : (
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer rounded accent-sky-600"
                            checked={(ediciones[l.id]?.kitWifiPro ?? l.kitWifiPro ?? "") !== ""}
                            onChange={(e) =>
                              handleEdicionChange(
                                l.id,
                                "kitWifiPro",
                                e.target.checked ? "KIT WIFI PRO (EN VENTA)" : ""
                              )
                            }
                          />
                        )}
                      </td>

                      {/* Cableado Mesh */}
                      <td className="px-3 py-2.5">
                        {coordReadOnly ? (
                          <span
                            className={cls(
                              "inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold",
                              (ediciones[l.id]?.servicioCableadoMesh ?? l.servicioCableadoMesh ?? "") !== ""
                                ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                                : "bg-slate-100 text-slate-400 dark:bg-slate-800"
                            )}
                          >
                            {(ediciones[l.id]?.servicioCableadoMesh ?? l.servicioCableadoMesh ?? "") !== "" ? "Si" : "No"}
                          </span>
                        ) : (
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer rounded accent-orange-600"
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
                        )}
                      </td>

                      {/* Cat5e */}
                      <td className="px-2 py-2">
                        {coordReadOnly ? (
                          <span className="font-mono text-sm text-slate-700 dark:text-slate-300">
                            {ediciones[l.id]?.cat5e ?? l.cat5e ?? 0}
                          </span>
                        ) : (
                          <input
                            type="number"
                            min={0}
                            step={1}
                            disabled={!cableadoChecked}
                            value={ediciones[l.id]?.cat5e ?? l.cat5e ?? 0}
                            className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-center text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-800"
                            onChange={(e) =>
                              handleEdicionChange(l.id, "cat5e", Math.max(0, parseIntSafe(e.target.value)))
                            }
                          />
                        )}
                      </td>

                      {/* Cat6 */}
                      <td className="px-3 py-2.5 font-mono text-sm text-slate-700 dark:text-slate-300">
                        {cat6}
                      </td>

                      {/* UTP */}
                      <td className="px-3 py-2.5">
                        {puntos > 0 ? (
                          <span className="inline-block rounded-md bg-slate-700 px-2 py-0.5 text-xs font-bold text-white dark:bg-slate-600">
                            {puntos}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">0</span>
                        )}
                      </td>

                      {/* Observacion */}
                      <td className="px-2 py-2">
                        {coordReadOnly ? (
                          <span className="block text-left text-xs text-slate-600 dark:text-slate-400">
                            {ediciones[l.id]?.observacion ?? l.observacion ?? "-"}
                          </span>
                        ) : (
                          <input
                            type="text"
                            value={ediciones[l.id]?.observacion ?? l.observacion ?? ""}
                            className="w-full rounded-lg border border-slate-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            onChange={(e) => handleEdicionChange(l.id, "observacion", e.target.value)}
                          />
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-center gap-1.5">
                          {!coordReadOnly && (
                            <button
                              className={cls(
                                "rounded-lg px-2.5 py-1 text-xs font-medium text-white transition-colors",
                                guardandoFila === l.id
                                  ? "bg-slate-400 cursor-not-allowed"
                                  : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
                              )}
                              disabled={guardandoFila === l.id}
                              onClick={() => guardarFila(l)}
                            >
                              {guardandoFila === l.id ? "..." : "Guardar"}
                            </button>
                          )}
                          <button
                            className="rounded-lg bg-slate-700 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-slate-800 active:bg-slate-900 dark:bg-slate-600 dark:hover:bg-slate-700"
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
      </div>

      {/* ── Paginacion ── */}
      <div className="mt-4 flex items-center justify-between">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          Mostrando{" "}
          <strong className="text-slate-700 dark:text-slate-200">
            {pageData.length > 0 ? (page - 1) * pageSize + 1 : 0}–{(page - 1) * pageSize + pageData.length}
          </strong>{" "}
          de{" "}
          <strong className="text-slate-700 dark:text-slate-200">{instalacionesFiltradas.length}</strong>{" "}
          registros
        </div>
        <div className="flex items-center gap-1">
          <button
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            ‹
          </button>
          <span className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400">
            <strong className="text-slate-800 dark:text-slate-200">{page}</strong>
            <span className="mx-1">/</span>
            {totalPages}
          </span>
          <button
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            ›
          </button>
        </div>
      </div>

      {/* ── Drawer detalle ── */}
      {detalleOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={cerrarDetalle} />
          <div className="absolute right-0 top-0 h-full w-full max-w-[540px] overflow-y-auto bg-white shadow-2xl dark:bg-slate-900">
            {/* Drawer header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-700 dark:bg-slate-900">
              <div>
                <div className="text-base font-semibold text-slate-900 dark:text-white">Detalle de instalacion</div>
                <div className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                  {detalleItem?.codigoCliente || "-"}
                </div>
              </div>
              <button
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                onClick={cerrarDetalle}
              >
                Cerrar
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Resumen */}
              <section>
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Resumen</h3>
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/50 space-y-2.5">
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
              </section>

              {/* Auditoria */}
              <section>
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Auditoria</h3>
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/50 space-y-2.5">
                  {renderLinea(
                    "Liquidado",
                    detalleItem?.liquidadoAt ? formatearFecha(convertirAFecha(detalleItem.liquidadoAt)) : "-"
                  )}
                  {renderLinea("Liquidado por", detalleItem?.liquidadoBy)}
                  {renderLinea(
                    "Corregido",
                    detalleItem?.corregidoAt ? formatearFecha(convertirAFecha(detalleItem.corregidoAt)) : "-"
                  )}
                  {renderLinea("Corregido por", detalleItem?.corregidoBy)}
                  {renderLinea(
                    "Estado",
                    detalleItem?.corregido ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                        CORREGIDA
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                        LIQUIDADA
                      </span>
                    )
                  )}
                </div>
              </section>

              {/* Acta */}
              <section>
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Acta</h3>
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                  <span className="font-mono text-sm text-slate-700 dark:text-slate-300">
                    {detalleItem?.acta || "-"}
                  </span>
                </div>
              </section>

              {/* Equipos */}
              <section>
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Equipos instalados</h3>
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/50 space-y-2">
                  {(() => {
                    const equiposBase = toArray(detalleItem?.equiposInstalados || detalleItem?.equipos || []);
                    const equiposSn = [
                      detalleItem?.snONT ? { tipo: "ONT", sn: detalleItem.snONT } : null,
                      ...(Array.isArray(detalleItem?.snMESH)
                        ? detalleItem.snMESH.filter(Boolean).map((sn: string) => ({ tipo: "MESH", sn }))
                        : []),
                      ...(Array.isArray(detalleItem?.snBOX)
                        ? detalleItem.snBOX.filter(Boolean).map((sn: string) => ({ tipo: "BOX", sn }))
                        : []),
                      detalleItem?.snFONO ? { tipo: "FONO", sn: detalleItem.snFONO } : null,
                    ].filter(Boolean) as any[];
                    const equipos = equiposBase.length ? equiposBase : equiposSn;
                    if (!equipos.length)
                      return <p className="text-xs text-slate-400">Sin equipos registrados</p>;
                    const colorMap: Record<string, string> = {
                      ONT: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-600",
                      MESH: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800",
                      BOX: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800",
                      FONO: "bg-pink-50 text-pink-700 ring-pink-200 dark:bg-pink-900/30 dark:text-pink-300 dark:ring-pink-800",
                    };
                    return equipos.map((e: any, i: number) => {
                      const tipo = (e.tipo || e.kind || "").toUpperCase();
                      return (
                        <div key={i} className={cls("flex items-center gap-2 rounded-lg px-3 py-2 ring-1", colorMap[tipo] || colorMap.ONT)}>
                          <span className="text-xs font-bold">{tipo || "EQUIPO"}</span>
                          {e.sn && <span className="font-mono text-xs">{e.sn}</span>}
                          {e.proid && <span className="ml-auto text-[10px] text-slate-400">(PROID {e.proid})</span>}
                        </div>
                      );
                    });
                  })()}
                </div>
              </section>

              {/* Materiales */}
              <section>
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Materiales consumidos</h3>
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/50 space-y-2">
                  {(() => {
                    const mats = toArray(detalleItem?.materialesConsumidos || detalleItem?.materiales || []);
                    if (!mats.length)
                      return <p className="text-xs text-slate-400">Sin materiales registrados</p>;
                    return mats.map((m: any, i: number) => (
                      <div key={i} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          {m.tipo || m.nombre || "Material"}
                        </span>
                        <div className="flex items-center gap-2">
                          {m.cantidad && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                              x{m.cantidad}
                            </span>
                          )}
                          {m.metros && (
                            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
                              {m.metros}m
                            </span>
                          )}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </section>

              {/* Llamadas */}
              <section>
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Llamadas</h3>
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/50 space-y-2">
                  {(() => {
                    const llamadas = toArray(detalleItem?.llamadas || detalleItem?.llamadasGestoras || []);
                    if (!llamadas.length)
                      return <p className="text-xs text-slate-400">Sin llamadas registradas</p>;
                    return llamadas.map((ll: any, i: number) => (
                      <div key={i} className="rounded-lg bg-white px-3 py-2.5 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
                        <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {ll.gestora || ll.user || ll.estadoLlamada || "Llamada"}
                        </div>
                        <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                          {ll.fecha ? formatearFecha(convertirAFecha(ll.fecha)) : ""}{" "}
                          {ll.resultado ? `· ${ll.resultado}` : ""}
                          {ll.horaInicioLlamada && ll.horaInicioLlamada !== "-" ? ` · ${ll.horaInicioLlamada}` : ""}
                          {ll.horaFinLlamada && ll.horaFinLlamada !== "-" ? ` – ${ll.horaFinLlamada}` : ""}
                        </div>
                        {(ll.observacion || ll.observacionLlamada) && (
                          <div className="mt-1 text-[10px] italic text-slate-500 dark:text-slate-400">
                            {ll.observacion || ll.observacionLlamada}
                          </div>
                        )}
                      </div>
                    ));
                  })()}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
