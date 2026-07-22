"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";

type OptionItem = { uid: string; nombre: string };

type IcCallDetail = {
  id: string;
  usuaruioInconcert: string;
  inicioLlamadaInconcert: string;
  entraLlamadaInconcert: string;
  finLlamadaInconcert: string;
  duracion: string;
  duracionSeg: number;
  corta: boolean;
  bo: string;
  observacionInconcert: string;
};

type Row = {
  id: string;
  ordenId: string;
  cliente: string;
  codigoCliente: string;
  documento: string;
  telefono: string;
  telNorm: string;
  fSoliYmd: string;
  cuadrillaNombre: string;
  tipoServicio: string;
  tramo: string;
  estado: string;
  horaEnCamino: string;
  horaInicio: string;
  horaFin: string;
  gestorUid: string;
  gestorNombre: string;
  coordinadorUid: string;
  coordinadorNombre: string;
  estadoLlamada: string;
  horaInicioLlamada: string;
  horaFinLlamada: string;
  observacionLlamada: string;
  icCount: number;
  icCortas: number;
  icLatest: IcCallDetail | null;
  icList: IcCallDetail[];
};

type Filters = {
  gestor: string;
  coordinador: string;
  cuadrilla: string;
  estado: string;
  alerta: string;
  estadoLlamada: string;
  tramo: string;
  acciones: "" | "con" | "sin";
};

type Mode = "dia" | "mes";

const initialFilters: Filters = {
  gestor: "",
  coordinador: "",
  cuadrilla: "",
  estado: "",
  alerta: "",
  estadoLlamada: "",
  tramo: "",
  acciones: "",
};

function currentLimaHms() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

function monthFromYmd(ymd: string) {
  return String(ymd || "").slice(0, 7);
}

function soloHora(value?: string | null) {
  const s = String(value || "").trim();
  if (!s || s === "-") return s || "-";
  const m = s.match(/(\d{2}:\d{2}:\d{2})/);
  return m ? m[1] : s;
}

const inputCls =
  "h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-blue-900/40";
const selectCls = inputCls + " appearance-none pr-8 cursor-pointer";
const labelCls = "block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";

function CalendarIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function cortaBarColor(pct: number) {
  if (pct >= 50) return "#ef4444";
  if (pct >= 25) return "#f59e0b";
  return "#10b981";
}

function CortasTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2 text-xs shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
      <div className="font-semibold">{d.nombre}</div>
      <div>{d.cortas}/{d.total} llamadas cortas ({d.pct}%)</div>
    </div>
  );
}

export function GerenciaInconcertClient({ initialYmd }: { initialYmd: string }) {
  const [mode, setMode] = useState<Mode>("dia");
  const [ymd, setYmd] = useState(initialYmd);
  const [month, setMonth] = useState(monthFromYmd(initialYmd));
  const [clock, setClock] = useState(currentLimaHms());
  const [rows, setRows] = useState<Row[]>([]);
  const [gestores, setGestores] = useState<OptionItem[]>([]);
  const [coordinadores, setCoordinadores] = useState<OptionItem[]>([]);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showRanking, setShowRanking] = useState(false);
  const [showCortasChart, setShowCortasChart] = useState(false);
  const [modal, setModal] = useState<{ tel: string; list: any[] } | null>(null);
  const [umbralCorta, setUmbralCorta] = useState<number>(11);

  useEffect(() => {
    const t = setInterval(() => setClock(currentLimaHms()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    async function load() {
      setLoading(true);
      setError("");
      try {
        const qs = mode === "mes" ? `month=${encodeURIComponent(month)}` : `ymd=${encodeURIComponent(ymd)}`;
        const res = await fetch(`/api/inconcert/gerencia/list?${qs}`, {
          cache: "no-store",
          signal: ctrl.signal,
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) throw new Error(String(data?.error || "ERROR"));
        if (!cancelled) {
          setRows(Array.isArray(data.items) ? data.items : []);
          setGestores(Array.isArray(data?.options?.gestores) ? data.options.gestores : []);
          setCoordinadores(Array.isArray(data?.options?.coordinadores) ? data.options.coordinadores : []);
        }
      } catch (e: any) {
        if (!cancelled) {
          setRows([]);
          setError(String(e?.message || "ERROR"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [mode, ymd, month]);

  function outsideTolerance(inst: Row) {
    if (!inst.horaEnCamino || !inst.tramo || inst.tramo === "-") return false;
    const tramoHour =
      inst.tramo === "Primer Tramo" ? "08:00" : inst.tramo === "Segundo Tramo" ? "12:00" : inst.tramo === "Tercer Tramo" ? "16:00" : "";
    if (!tramoHour) return false;
    const ref = Date.parse(`2000-01-01T${tramoHour}:00`);
    const val = Date.parse(`2000-01-01T${inst.horaEnCamino}:00`);
    if (Number.isNaN(ref) || Number.isNaN(val)) return false;
    return val > ref + 15 * 60 * 1000;
  }

  function noGestion(inst: Row) {
    return inst.horaEnCamino === "-" && inst.horaInicio === "-" && inst.horaFin === "-";
  }

  function hasAccion(inst: Row) {
    return (inst.icCount || 0) > 0;
  }

  function esCorta(seg: number) {
    return (seg || 0) < umbralCorta;
  }

  function icCortasReal(inst: Row) {
    return (inst.icList || []).filter((c) => esCorta(c.duracionSeg)).length;
  }

  // Cuenta llamadas reales sin duplicar: cuando un cliente tiene mas de una
  // orden el mismo dia, el mismo bloque de llamadas queda pegado a cada orden.
  // Aca se deduplica por el id real de la llamada en InConcert.
  function uniqueCalls(list: Row[]) {
    const map = new Map<string, number>();
    for (const r of list) {
      for (const c of r.icList || []) {
        if (!c.id || map.has(c.id)) continue;
        map.set(c.id, c.duracionSeg);
      }
    }
    return map;
  }

  const filtered = useMemo(() => {
    const cuad = filters.cuadrilla.toLowerCase();
    return rows.filter((r) => {
      const byGestor = !filters.gestor || r.gestorUid === filters.gestor;
      const byCoord = !filters.coordinador || r.coordinadorUid === filters.coordinador;
      const byCuad = !cuad || r.cuadrillaNombre.toLowerCase().includes(cuad);
      const byEstado = !filters.estado || r.estado === filters.estado;
      const byTramo = !filters.tramo || r.tramo === filters.tramo;
      const byEstadoLlamada =
        !filters.estadoLlamada ||
        (filters.estadoLlamada === "noLlamo" && (r.estadoLlamada === "-" || !r.estadoLlamada)) ||
        r.estadoLlamada === filters.estadoLlamada;
      const byAccion =
        !filters.acciones ||
        (filters.acciones === "con" && hasAccion(r)) ||
        (filters.acciones === "sin" && !hasAccion(r));
      const byAlerta =
        !filters.alerta ||
        (filters.alerta === "tolerancia" && outsideTolerance(r)) ||
        (filters.alerta === "sinaction" && noGestion(r)) ||
        (filters.alerta === "cortas" && icCortasReal(r) > 0);
      return byGestor && byCoord && byCuad && byEstado && byTramo && byEstadoLlamada && byAccion && byAlerta;
    });
  }, [rows, filters, umbralCorta]);

  const rankingData = useMemo(() => {
    const map = new Map<string, { gestor: string; nombre: string; total: number; con: number; sin: number; pct: number }>();
    for (const r of filtered) {
      const key = r.gestorUid || "SIN_GESTOR";
      const hit = map.get(key) || { gestor: key, nombre: r.gestorNombre || key, total: 0, con: 0, sin: 0, pct: 0 };
      hit.total += 1;
      if (hasAccion(r)) hit.con += 1;
      else hit.sin += 1;
      map.set(key, hit);
    }
    return Array.from(map.values())
      .map((x) => ({ ...x, pct: x.total ? Math.round((x.con * 100) / x.total) : 0 }))
      .sort((a, b) => b.pct - a.pct || b.con - a.con);
  }, [filtered]);

  // % de llamadas cortas por gestor: llamadas deduplicadas por id dentro de las
  // ordenes de cada gestor (si el gestor tiene 2 ordenes el mismo dia con el
  // mismo cliente, no se cuenta doble).
  const cortasPorGestor = useMemo(() => {
    const map = new Map<string, { nombre: string; callsById: Map<string, number> }>();
    for (const r of filtered) {
      const key = r.gestorUid || "SIN_GESTOR";
      const hit = map.get(key) || { nombre: r.gestorNombre || key, callsById: new Map<string, number>() };
      for (const c of r.icList || []) {
        if (c.id && !hit.callsById.has(c.id)) hit.callsById.set(c.id, c.duracionSeg);
      }
      map.set(key, hit);
    }
    return Array.from(map.values())
      .map((h) => {
        const total = h.callsById.size;
        const cortas = Array.from(h.callsById.values()).filter(esCorta).length;
        return { nombre: h.nombre, total, cortas, pct: total ? Math.round((cortas * 100) / total) : 0 };
      })
      .filter((x) => x.total > 0)
      .sort((a, b) => b.pct - a.pct || b.cortas - a.cortas);
  }, [filtered, umbralCorta]);

  // % de llamadas cortas por usuario de InConcert (el agente que marco la llamada).
  // Aca cada llamada tiene un unico dueno (el usuario que la hizo), asi que se
  // deduplica globalmente por id sin ambiguedad.
  const cortasPorUsuario = useMemo(() => {
    const map = new Map<string, { nombre: string; total: number; cortas: number }>();
    const seen = new Set<string>();
    for (const r of filtered) {
      for (const c of r.icList || []) {
        if (!c.id || seen.has(c.id)) continue;
        seen.add(c.id);
        const usuario = c.usuaruioInconcert && c.usuaruioInconcert !== "-" ? c.usuaruioInconcert : "SIN_USUARIO";
        const hit = map.get(usuario) || { nombre: usuario, total: 0, cortas: 0 };
        hit.total += 1;
        if (esCorta(c.duracionSeg)) hit.cortas += 1;
        map.set(usuario, hit);
      }
    }
    return Array.from(map.values())
      .map((h) => ({ ...h, pct: h.total ? Math.round((h.cortas * 100) / h.total) : 0 }))
      .sort((a, b) => b.pct - a.pct || b.cortas - a.cortas);
  }, [filtered, umbralCorta]);

  const totalConAccion = filtered.filter(hasAccion).length;
  const totalSinAccion = filtered.length - totalConAccion;
  const totalFueraTolerancia = filtered.filter(outsideTolerance).length;
  const totalSinGestion = filtered.filter(noGestion).length;
  const totalLlamadasCortas = useMemo(() => {
    let count = 0;
    for (const seg of uniqueCalls(filtered).values()) if (esCorta(seg)) count++;
    return count;
  }, [filtered, umbralCorta]);
  const pctConAccion = filtered.length ? Math.round((totalConAccion * 100) / filtered.length) : 0;

  async function openCalls(row: Row) {
    if (!row.telNorm) return;
    const res = await fetch(`/api/inconcert/gerencia/calls?tel=${encodeURIComponent(row.telNorm)}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok || !data?.ok) return;
    setModal({ tel: row.telefono || row.telNorm, list: Array.isArray(data.list) ? data.list : [] });
  }

  function exportExcel() {
    const detail = filtered.map((r) => ({
      Fecha: r.fSoliYmd || (mode === "mes" ? month : ymd),
      Cliente: r.cliente,
      CodigoCliente: r.codigoCliente,
      Documento: r.documento,
      Telefono: r.telefono,
      Cuadrilla: r.cuadrillaNombre,
      TipoServicio: r.tipoServicio,
      Tramo: r.tramo,
      Estado: r.estado,
      HoraEnCamino: r.horaEnCamino,
      HoraInicio: r.horaInicio,
      HoraFin: r.horaFin,
      Gestor: r.gestorNombre,
      EstadoLlamada: r.estadoLlamada,
      InicioLlamada: r.horaInicioLlamada,
      FinLlamada: r.horaFinLlamada,
      ObservacionLlamada: r.observacionLlamada,
      INC_Usuario: r.icLatest?.usuaruioInconcert || "",
      INC_Inicio: soloHora(r.icLatest?.inicioLlamadaInconcert),
      INC_Entra: soloHora(r.icLatest?.entraLlamadaInconcert),
      INC_Fin: soloHora(r.icLatest?.finLlamadaInconcert),
      INC_Duracion: r.icLatest?.duracion || "",
      INC_BO: r.icLatest?.bo || "",
      INC_Observacion: r.icLatest?.observacionInconcert || "",
      INC_LlamadasDia: r.icCount,
      INC_LlamadasCortasDia: icCortasReal(r),
      TieneAccionIC: hasAccion(r) ? "Si" : "No",
      EfectivaDelDia: r.icCount - icCortasReal(r) > 0 ? "Si" : "No",
    }));
    const ranking = rankingData.map((r) => ({
      GestorRef: r.gestor,
      Gestor: r.nombre,
      Total: r.total,
      ConLlamadas: r.con,
      SinLlamadas: r.sin,
      Porcentaje: `${r.pct}%`,
    }));
    // Una fila por llamada individual (no solo la ultima), para poder sustentar ante
    // el cliente casos donde hubo intentos cortos pero SI hubo una llamada efectiva.
    const detalleLlamadas = filtered.flatMap((r) =>
      (r.icList || []).map((c, idx) => ({
        Fecha: r.fSoliYmd || (mode === "mes" ? month : ymd),
        Cliente: r.cliente,
        Telefono: r.telefono,
        Gestor: r.gestorNombre,
        Cuadrilla: r.cuadrillaNombre,
        NroLlamadaDelDia: idx + 1,
        TotalLlamadasDelDia: r.icList.length,
        HoraInicio: soloHora(c.inicioLlamadaInconcert),
        HoraEntra: soloHora(c.entraLlamadaInconcert),
        HoraFin: soloHora(c.finLlamadaInconcert),
        Duracion: c.duracion,
        DuracionSeg: c.duracionSeg,
        LlamadaCorta: esCorta(c.duracionSeg) ? "Si" : "No",
        Usuario: c.usuaruioInconcert,
        Disposicion: c.observacionInconcert,
        BO: c.bo,
      }))
    );

    // Resumen agrupado por cliente (telefono) a lo largo de todo el periodo filtrado,
    // para ver cuantas veces se llama a un mismo cliente y detectar por que.
    // Las llamadas se deduplican por su id real de InConcert: si el cliente tuvo
    // mas de una orden el mismo dia, el mismo bloque de llamadas queda pegado a
    // cada orden y no debe contarse dos veces aca.
    const porCliente = new Map<
      string,
      {
        cliente: string;
        telefono: string;
        dias: Set<string>;
        callsById: Map<string, number>;
        gestores: Set<string>;
        coordinadores: Set<string>;
        usuariosInc: Set<string>;
      }
    >();
    for (const r of filtered) {
      const key = r.telNorm || r.telefono;
      if (!key || key === "-") continue;
      const fecha = r.fSoliYmd || (mode === "mes" ? month : ymd);
      const hit = porCliente.get(key) || {
        cliente: r.cliente,
        telefono: r.telefono,
        dias: new Set<string>(),
        callsById: new Map<string, number>(),
        gestores: new Set<string>(),
        coordinadores: new Set<string>(),
        usuariosInc: new Set<string>(),
      };
      hit.dias.add(fecha);
      if (r.gestorNombre) hit.gestores.add(r.gestorNombre);
      if (r.coordinadorNombre) hit.coordinadores.add(r.coordinadorNombre);
      for (const c of r.icList || []) {
        if (c.id && !hit.callsById.has(c.id)) hit.callsById.set(c.id, c.duracionSeg);
        const u = String(c.usuaruioInconcert || "").trim();
        if (u && u !== "-") hit.usuariosInc.add(u);
      }
      porCliente.set(key, hit);
    }
    const resumenCliente = Array.from(porCliente.values())
      .map((h) => {
        const totalCortas = Array.from(h.callsById.values()).filter(esCorta).length;
        return {
          Cliente: h.cliente,
          Telefono: h.telefono,
          OrdenesODias: h.dias.size,
          TotalLlamadas: h.callsById.size,
          TotalCortas: totalCortas,
          TotalEfectivas: h.callsById.size - totalCortas,
          Gestores: Array.from(h.gestores).join(", "),
          Coordinadores: Array.from(h.coordinadores).join(", "),
          INC_Usuarios: Array.from(h.usuariosInc).join(", "),
          Fechas: Array.from(h.dias).sort().join(", "),
        };
      })
      .sort((a, b) => b.TotalLlamadas - a.TotalLlamadas);

    // Igual que "Resumen por Cliente" pero separado por gestor y por dia, para ver
    // puntualmente si un mismo cliente fue llamado el mismo dia por mas de un gestor,
    // o cuantas veces lo llamo cada gestor en cada dia especifico.
    const porClienteGestorDia = new Map<
      string,
      {
        fecha: string;
        cliente: string;
        telefono: string;
        gestor: string;
        coordinador: string;
        callsById: Map<string, number>;
        usuariosInc: Set<string>;
      }
    >();
    for (const r of filtered) {
      const tel = r.telNorm || r.telefono;
      if (!tel || tel === "-") continue;
      const fecha = r.fSoliYmd || (mode === "mes" ? month : ymd);
      const key = `${tel}|${fecha}|${r.gestorUid || "SIN_GESTOR"}`;
      const hit = porClienteGestorDia.get(key) || {
        fecha,
        cliente: r.cliente,
        telefono: r.telefono,
        gestor: r.gestorNombre,
        coordinador: r.coordinadorNombre,
        callsById: new Map<string, number>(),
        usuariosInc: new Set<string>(),
      };
      for (const c of r.icList || []) {
        if (c.id && !hit.callsById.has(c.id)) hit.callsById.set(c.id, c.duracionSeg);
        const u = String(c.usuaruioInconcert || "").trim();
        if (u && u !== "-") hit.usuariosInc.add(u);
      }
      porClienteGestorDia.set(key, hit);
    }
    const detalleClienteGestorDia = Array.from(porClienteGestorDia.values())
      .map((h) => {
        const totalCortas = Array.from(h.callsById.values()).filter(esCorta).length;
        return {
          Fecha: h.fecha,
          Cliente: h.cliente,
          Telefono: h.telefono,
          Gestor: h.gestor,
          Coordinador: h.coordinador,
          TotalLlamadas: h.callsById.size,
          TotalCortas: totalCortas,
          TotalEfectivas: h.callsById.size - totalCortas,
          INC_Usuarios: Array.from(h.usuariosInc).join(", "),
        };
      })
      .sort(
        (a, b) =>
          a.Cliente.localeCompare(b.Cliente) || a.Fecha.localeCompare(b.Fecha) || a.Gestor.localeCompare(b.Gestor)
      );

    const cortasGestorSheet = cortasPorGestor.map((g) => ({
      Gestor: g.nombre,
      TotalLlamadas: g.total,
      LlamadasCortas: g.cortas,
      PorcentajeCortas: `${g.pct}%`,
    }));
    const cortasUsuarioSheet = cortasPorUsuario.map((u) => ({
      UsuarioInConcert: u.nombre,
      TotalLlamadas: u.total,
      LlamadasCortas: u.cortas,
      PorcentajeCortas: `${u.pct}%`,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), "Reporte Gerencia");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ranking), "Auditoria Gestor");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalleLlamadas), "Detalle Llamadas");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumenCliente), "Resumen por Cliente");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalleClienteGestorDia), "Cliente-Gestor-Dia");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cortasGestorSheet), "Cortas por Gestor");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cortasUsuarioSheet), "Cortas por Usuario IC");
    const suffix = mode === "mes" ? month : ymd;
    XLSX.writeFile(wb, `REPORTE-GERENCIA-${suffix}.xlsx`);
  }

  const periodoLabel = mode === "mes" ? `Mes: ${month || "—"}` : `Día: ${ymd || "—"}`;

  return (
    <div className="w-full space-y-4 text-slate-900 dark:text-slate-100">
      <div className="text-center">
        <h1 className="text-xl font-semibold">InConcert - Vista Gerencial</h1>
        <p className="text-sm text-muted-foreground dark:text-slate-400">Hora actual Lima: {clock}</p>
      </div>

      {/* ── Panel de control ── */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-700">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className={labelCls}>Vista</label>
              <div className="inline-flex rounded-xl border border-slate-200 p-1 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setMode("dia")}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    mode === "dia" ? "bg-slate-800 text-white dark:bg-slate-600" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  Día
                </button>
                <button
                  type="button"
                  onClick={() => setMode("mes")}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    mode === "mes" ? "bg-slate-800 text-white dark:bg-slate-600" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  Mes
                </button>
              </div>
            </div>

            {mode === "dia" ? (
              <div className="space-y-1">
                <label className={labelCls}>Fecha (Lima)</label>
                <input type="date" value={ymd} onChange={(e) => setYmd(e.target.value)} className={inputCls} />
              </div>
            ) : (
              <div className="space-y-1">
                <label className={labelCls}>Mes (Lima)</label>
                <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls} />
              </div>
            )}

            <div className="min-w-40 space-y-1">
              <label className={labelCls}>Gestor</label>
              <div className="relative">
                <select value={filters.gestor} onChange={(e) => setFilters((f) => ({ ...f, gestor: e.target.value }))} className={selectCls + " w-full"}>
                  <option value="">Todos</option>
                  {gestores.map((g) => (
                    <option key={g.uid} value={g.uid}>{g.nombre}</option>
                  ))}
                </select>
                <ChevronIcon />
              </div>
            </div>

            <div className="min-w-40 space-y-1">
              <label className={labelCls}>Coordinador</label>
              <div className="relative">
                <select value={filters.coordinador} onChange={(e) => setFilters((f) => ({ ...f, coordinador: e.target.value }))} className={selectCls + " w-full"}>
                  <option value="">Todos</option>
                  {coordinadores.map((c) => (
                    <option key={c.uid} value={c.uid}>{c.nombre}</option>
                  ))}
                </select>
                <ChevronIcon />
              </div>
            </div>

            <div className="min-w-36 space-y-1">
              <label className={labelCls}>Tramo</label>
              <div className="relative">
                <select value={filters.tramo} onChange={(e) => setFilters((f) => ({ ...f, tramo: e.target.value }))} className={selectCls + " w-full"}>
                  <option value="">Todos</option>
                  <option value="Primer Tramo">Primer Tramo</option>
                  <option value="Segundo Tramo">Segundo Tramo</option>
                  <option value="Tercer Tramo">Tercer Tramo</option>
                </select>
                <ChevronIcon />
              </div>
            </div>

            <div className="min-w-36 space-y-1">
              <label className={labelCls}>Estado</label>
              <div className="relative">
                <select value={filters.estado} onChange={(e) => setFilters((f) => ({ ...f, estado: e.target.value }))} className={selectCls + " w-full"}>
                  <option value="">Todos</option>
                  <option value="Agendada">Agendada</option>
                  <option value="En camino">En camino</option>
                  <option value="Cancelada">Cancelada</option>
                  <option value="Finalizada">Finalizada</option>
                  <option value="Reprogramada">Reprogramada</option>
                  <option value="Iniciada">Iniciada</option>
                  <option value="Regestion">Regestion</option>
                  <option value="Regestión">Regestion (con tilde)</option>
                </select>
                <ChevronIcon />
              </div>
            </div>

            <div className="min-w-44 space-y-1">
              <label className={labelCls}>Estado llamada</label>
              <div className="relative">
                <select value={filters.estadoLlamada} onChange={(e) => setFilters((f) => ({ ...f, estadoLlamada: e.target.value }))} className={selectCls + " w-full"}>
                  <option value="">Todos</option>
                  <option value="Contesto">Contesto</option>
                  <option value="No Contesto">No Contesto</option>
                  <option value="No se Registro">No se Registro</option>
                  <option value="noLlamo">No se llamo</option>
                </select>
                <ChevronIcon />
              </div>
            </div>

            <div className="min-w-44 space-y-1">
              <label className={labelCls}>Acciones IC</label>
              <div className="relative">
                <select value={filters.acciones} onChange={(e) => setFilters((f) => ({ ...f, acciones: e.target.value as any }))} className={selectCls + " w-full"}>
                  <option value="">Todas</option>
                  <option value="con">Con llamadas</option>
                  <option value="sin">Sin llamadas</option>
                </select>
                <ChevronIcon />
              </div>
            </div>

            <div className="min-w-40 space-y-1">
              <label className={labelCls}>Alertas</label>
              <div className="relative">
                <select value={filters.alerta} onChange={(e) => setFilters((f) => ({ ...f, alerta: e.target.value }))} className={selectCls + " w-full"}>
                  <option value="">Todas</option>
                  <option value="tolerancia">Fuera de tolerancia</option>
                  <option value="sinaction">Sin gestion</option>
                  <option value="cortas">{`Con llamadas cortas (<${umbralCorta}s)`}</option>
                </select>
                <ChevronIcon />
              </div>
            </div>

            <div className="min-w-44 space-y-1">
              <label className={labelCls}>Buscar cuadrilla</label>
              <input
                value={filters.cuadrilla}
                onChange={(e) => setFilters((f) => ({ ...f, cuadrilla: e.target.value }))}
                placeholder="Nombre de cuadrilla"
                className={inputCls + " w-full"}
              />
            </div>

            <div className="w-32 space-y-1">
              <label className={labelCls}>Umbral corta (seg)</label>
              <input
                type="number"
                min={1}
                value={umbralCorta}
                onChange={(e) => setUmbralCorta(Math.max(1, Number(e.target.value) || 1))}
                className={inputCls + " w-full"}
              />
            </div>

            <button
              type="button"
              onClick={exportExcel}
              className="h-9 rounded-xl bg-emerald-600 px-3 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700"
            >
              Exportar Excel
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-4 py-3 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
            <CalendarIcon />
            {periodoLabel}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {filtered.length} registro{filtered.length !== 1 ? "s" : ""}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            No incluye ordenes de garantia
          </span>
        </div>
      </section>

      {/* ── KPIs ── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Total</div>
            <div className="text-lg font-bold">{filtered.length}</div>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
            <div className="text-[11px] font-semibold uppercase tracking-wide">Fuera tolerancia</div>
            <div className="text-lg font-bold">{totalFueraTolerancia}</div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            <div className="text-[11px] font-semibold uppercase tracking-wide">Sin gestion</div>
            <div className="text-lg font-bold">{totalSinGestion}</div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            <div className="text-[11px] font-semibold uppercase tracking-wide">Con llamadas (IC)</div>
            <div className="text-lg font-bold">{totalConAccion}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Sin llamadas (IC)</div>
            <div className="text-lg font-bold">{totalSinAccion}</div>
          </div>
          <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-700 dark:border-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
            <div className="text-[11px] font-semibold uppercase tracking-wide">{`Llamadas cortas (<${umbralCorta}s, sin duplicar)`}</div>
            <div className="text-lg font-bold">{totalLlamadasCortas}</div>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs font-semibold mb-1">
            <span>Porcentaje con llamadas reales (INCONCERT)</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowRanking((v) => !v)}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-white transition hover:bg-slate-700 dark:bg-slate-700"
              >
                {showRanking ? "Ocultar auditoria por gestor" : "Ver auditoria por gestor"}
              </button>
              <button
                type="button"
                onClick={() => setShowCortasChart((v) => !v)}
                className="rounded-lg bg-orange-600 px-3 py-1.5 text-white transition hover:bg-orange-700"
              >
                {showCortasChart ? "Ocultar llamadas cortas por gestor/usuario" : "Ver llamadas cortas por gestor/usuario"}
              </button>
              <span>{pctConAccion}% ({totalConAccion}/{filtered.length || 0})</span>
            </div>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div className="h-full bg-gradient-to-r from-slate-700 to-orange-500" style={{ width: `${pctConAccion}%` }} />
          </div>
        </div>
      </section>

      {/* ── Auditoria por gestor ── */}
      {showRanking ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Auditoria por gestor — {periodoLabel} <span className="font-normal text-slate-400">(basado en llamadas reales de INCONCERT)</span>
          </h2>
          <div className="space-y-2">
            {rankingData.length === 0 ? (
              <div className="text-xs text-muted-foreground dark:text-slate-400">No hay datos para auditoria.</div>
            ) : (
              rankingData.map((g) => (
                <div key={g.gestor} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{g.nombre}</span>
                      <span className="rounded-full bg-white px-2 py-0.5 dark:bg-slate-900">{g.con}/{g.total} con llamadas</span>
                    </div>
                    <span className="font-bold">{g.pct}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div className="h-full bg-gradient-to-r from-emerald-500 to-blue-500" style={{ width: `${g.pct}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}

      {/* ── Llamadas cortas por gestor / usuario ── */}
      {showCortasChart ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
            {`Llamadas cortas (<${umbralCorta}s) por Gestor y Usuario InConcert — ${periodoLabel}`}{" "}
            <span className="font-normal text-slate-400">(llamadas unicas, sin duplicar por orden)</span>
          </h2>
          <div className="grid gap-6 xl:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Por Gestor</h3>
              {cortasPorGestor.length === 0 ? (
                <div className="text-xs text-muted-foreground dark:text-slate-400">No hay datos.</div>
              ) : (
                <div style={{ height: Math.max(160, cortasPorGestor.length * 34) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cortasPorGestor} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                      <XAxis type="number" domain={[0, 100]} unit="%" />
                      <YAxis type="category" dataKey="nombre" width={130} tick={{ fontSize: 11 }} />
                      <Tooltip content={<CortasTooltip />} />
                      <Bar dataKey="pct" name="% cortas" radius={[0, 6, 6, 0]}>
                        {cortasPorGestor.map((d, i) => (
                          <Cell key={i} fill={cortaBarColor(d.pct)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Por Usuario InConcert</h3>
              {cortasPorUsuario.length === 0 ? (
                <div className="text-xs text-muted-foreground dark:text-slate-400">No hay datos.</div>
              ) : (
                <div style={{ height: Math.max(160, cortasPorUsuario.length * 34) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cortasPorUsuario} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                      <XAxis type="number" domain={[0, 100]} unit="%" />
                      <YAxis type="category" dataKey="nombre" width={130} tick={{ fontSize: 11 }} />
                      <Tooltip content={<CortasTooltip />} />
                      <Bar dataKey="pct" name="% cortas" radius={[0, 6, 6, 0]}>
                        {cortasPorUsuario.map((d, i) => (
                          <Cell key={i} fill={cortaBarColor(d.pct)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {error ? <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
      {loading ? <div className="text-center text-sm text-muted-foreground dark:text-slate-400">Cargando datos...</div> : null}

      {/* ── Detalle ── */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="relative max-h-[70vh] overflow-auto">
          <table className="w-full text-xs md:text-sm min-w-[2100px]">
            <thead className="sticky top-0 bg-slate-800 text-white z-10">
              <tr>
                {[
                  "Fecha","Cliente","Codigo","Documento","Telefono","Cuadrilla","Tipo Servicio","Tramo","Estado",
                  "En Camino","Inicio","Fin","Gestor","Estado Llamada","Inicio Llamada","Fin Llamada","Observacion",
                  "INC Usuario","INC Inicio","INC Entra","INC Fin","INC Duracion","INC BO","INC Observacion","Acciones",
                ].map((h) => (
                  <th key={h} className="p-2 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className={`border-b border-slate-200 dark:border-slate-700 ${r.icCount > 0 ? "" : "bg-yellow-50 dark:bg-yellow-900/20"}`}>
                  <td className="p-2 whitespace-nowrap">{r.fSoliYmd || "-"}</td>
                  <td className="p-2">{r.cliente}</td>
                  <td className="p-2">{r.codigoCliente}</td>
                  <td className="p-2">{r.documento}</td>
                  <td className="p-2">{r.telefono}</td>
                  <td className="p-2">{r.cuadrillaNombre}</td>
                  <td className="p-2">{r.tipoServicio}</td>
                  <td className="p-2">{r.tramo}</td>
                  <td className="p-2">{r.estado}</td>
                  <td className="p-2">{r.horaEnCamino}</td>
                  <td className="p-2">{r.horaInicio}</td>
                  <td className="p-2">{r.horaFin}</td>
                  <td className="p-2">{r.gestorNombre}</td>
                  <td className="p-2">{r.estadoLlamada}</td>
                  <td className="p-2">{r.horaInicioLlamada}</td>
                  <td className="p-2">{r.horaFinLlamada}</td>
                  <td className="p-2">{r.observacionLlamada}</td>
                  <td className="p-2">{r.icLatest?.usuaruioInconcert || "-"}</td>
                  <td className="p-2">{soloHora(r.icLatest?.inicioLlamadaInconcert)}</td>
                  <td className="p-2">{soloHora(r.icLatest?.entraLlamadaInconcert)}</td>
                  <td className="p-2">{soloHora(r.icLatest?.finLlamadaInconcert)}</td>
                  <td className="p-2">{r.icLatest?.duracion || "-"}</td>
                  <td className="p-2">{r.icLatest?.bo || "-"}</td>
                  <td className="p-2">{r.icLatest?.observacionInconcert || "-"}</td>
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openCalls(r)}
                        disabled={!r.icCount}
                        className={`rounded-lg px-2 py-1 text-white transition ${r.icCount ? "bg-indigo-700 hover:bg-indigo-800" : "bg-indigo-400"}`}
                      >
                        Ver llamadas ({r.icCount})
                      </button>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${r.icCount ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"}`}>
                        {r.icCount ? "Con llamadas" : "Sin llamadas"}
                      </span>
                      {icCortasReal(r) > 0 ? (
                        <span
                          title={`Llamadas de menos de ${umbralCorta} segundos ese dia`}
                          className="rounded-full bg-orange-100 px-2 py-1 text-[10px] font-semibold text-orange-800 dark:bg-orange-900/30 dark:text-orange-300"
                        >
                          {icCortasReal(r)} corta{icCortasReal(r) !== 1 ? "s" : ""}
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 ? (
                <tr>
                    <td colSpan={25} className="py-4 text-center text-muted-foreground dark:text-slate-400">No hay resultados con los filtros aplicados</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {modal ? (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="mx-4 w-full max-w-5xl rounded-2xl bg-white shadow-2xl dark:bg-slate-900 dark:text-slate-100">
            <div className="flex items-center justify-between border-b p-4 dark:border-slate-700">
              <div>
                <h3 className="text-lg font-semibold">Llamadas InConcert - Tel: <span className="font-mono">{modal.tel}</span></h3>
                <p className="text-xs text-muted-foreground dark:text-slate-400">
                  {`Filas en naranja: duracion menor a ${umbralCorta} segundos (posible intento sin contacto real)`}
                </p>
              </div>
              <button type="button" className="rounded-lg bg-slate-700 px-3 py-1 text-white transition hover:bg-slate-800" onClick={() => setModal(null)}>
                Cerrar
              </button>
            </div>
            <div className="p-4 overflow-auto max-h-[70vh]">
              <table className="w-full border text-xs md:text-sm dark:border-slate-700">
                <thead className="bg-slate-100 dark:bg-slate-800 dark:text-slate-200">
                  <tr>
                    {["Fecha","Usuario","Inicio","Entra","Fin","Duracion","Espera","Timbrado","Atencion","BO","Observacion"].map((h) => (
                      <th key={h} className="p-2 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {modal.list.map((r: any) => (
                    <tr key={r.id} className={`border-b border-slate-200 dark:border-slate-700 ${esCorta(r.duracionSeg) ? "bg-orange-50 dark:bg-orange-900/20" : ""}`}>
                      <td className="p-2 whitespace-nowrap">{r.fecha || "-"}</td>
                      <td className="p-2">{r.usuaruioInconcert || "-"}</td>
                      <td className="p-2">{soloHora(r.inicioLlamadaInconcert)}</td>
                      <td className="p-2">{soloHora(r.entraLlamadaInconcert)}</td>
                      <td className="p-2">{soloHora(r.finLlamadaInconcert)}</td>
                      <td className="p-2">{r.duracion || "-"}</td>
                      <td className="p-2">{r.espera || "-"}</td>
                      <td className="p-2">{r.timbrado || "-"}</td>
                      <td className="p-2">{r.atencion || "-"}</td>
                      <td className="p-2">{r.bo || "-"}</td>
                      <td className="p-2">{r.observacionInconcert || "-"}</td>
                    </tr>
                  ))}
                  {!modal.list.length ? (
                    <tr>
                      <td colSpan={11} className="p-4 text-center text-muted-foreground dark:text-slate-400">Sin llamadas</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
