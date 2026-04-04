"use client";

import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { useAccess } from "@/lib/useAccess";

type EstadoAsistencia =
  | "asistencia"
  | "falta"
  | "suspendida"
  | "descanso"
  | "descanso medico"
  | "vacaciones"
  | "recuperacion"
  | "asistencia compensada";

type CuadrillaRow = {
  id?: string;
  fecha: string;
  cuadrillaId: string;
  cuadrillaNombre?: string;
  zonaId?: string;
  zonaNombre?: string;
  estadoAsistencia?: string;
  observacion?: string;
  gestorUid?: string;
  gestorNombre?: string;
  confirmadoBy?: string;
  confirmadoPorNombre?: string;
  cerradoBy?: string;
  cerradoPorNombre?: string;
  coordinadorUid?: string;
  coordinadorNombre?: string;
};

type TecnicoRow = {
  id?: string;
  fecha: string;
  tecnicoId: string;
  tecnicoNombre?: string;
  cuadrillaId?: string;
  cuadrillaNombre?: string;
  zonaId?: string;
  zonaNombre?: string;
  estadoAsistencia?: string;
  gestorUid?: string;
  gestorNombre?: string;
  confirmadoBy?: string;
  confirmadoPorNombre?: string;
  cerradoBy?: string;
  cerradoPorNombre?: string;
  coordinadorUid?: string;
  coordinadorNombre?: string;
};

type EditPatch = { estadoAsistencia?: string; observacion?: string };
type EditMap = Record<string, EditPatch>;
type ResumenApi = { ok?: boolean; error?: string; cuadrillas?: CuadrillaRow[]; tecnicos?: TecnicoRow[] };
type DetailModal =
  | { type: "cuadrilla"; row: CuadrillaRow }
  | { type: "tecnico"; row: TecnicoRow }
  | null;

const ESTADOS: EstadoAsistencia[] = ["asistencia", "falta", "suspendida", "descanso", "descanso medico", "vacaciones", "recuperacion", "asistencia compensada"];
const cls = (...x: Array<string | false | null | undefined>) => x.filter(Boolean).join(" ");

type MonthlyCuadrillaRow = {
  key: string;
  nombre: string;
  zona: string;
  tecnicos: string[];
  statuses: Record<string, string>;
  observations: Record<string, boolean>;
};

type MonthlyTecnicoRow = {
  key: string;
  nombre: string;
  cuadrilla: string;
  gestor: string;
  confirmadoPor: string;
  cerradoPor: string;
  statuses: Record<string, string>;
};

const estadoToColor = (estado: string) => {
  switch (String(estado || "").toLowerCase()) {
    case "asistencia":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "falta":
      return "bg-rose-50 text-rose-700 ring-rose-200";
    case "suspendida":
      return "bg-amber-50 text-amber-800 ring-amber-200";
    case "descanso":
      return "bg-yellow-50 text-yellow-800 ring-yellow-200";
    case "descanso medico":
      return "bg-sky-50 text-sky-700 ring-sky-200";
    case "vacaciones":
      return "bg-blue-50 text-blue-700 ring-blue-200";
    case "recuperacion":
      return "bg-slate-100 text-slate-700 ring-slate-200";
    case "asistencia compensada":
      return "bg-cyan-50 text-cyan-700 ring-cyan-200";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
};

const estadoToCode = (estado?: string) => {
  switch (String(estado || "").toLowerCase()) {
    case "asistencia":
      return "A";
    case "falta":
      return "F";
    case "suspendida":
      return "S";
    case "descanso":
      return "D";
    case "descanso medico":
      return "DM";
    case "vacaciones":
      return "V";
    case "recuperacion":
      return "R";
    case "asistencia compensada":
      return "AC";
    default:
      return "-";
  }
};

const cuadrillaSortRank = (nombre?: string) => {
  const value = String(nombre || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  if (value.includes("RESIDENCIAL")) return 0;
  if (value.includes("CONDOMINIO") || value.includes("CONDOMINO")) return 1;
  if (value.includes("MOTO")) return 2;
  return 3;
};

const extractCuadrillaIndex = (nombre?: string) => {
  const match = String(nombre || "")
    .toUpperCase()
    .match(/\bK\s*(\d+)\b/);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
};

const compareCuadrillaNombre = (a?: string, b?: string) => {
  const rankDiff = cuadrillaSortRank(a) - cuadrillaSortRank(b);
  if (rankDiff !== 0) return rankDiff;
  const indexDiff = extractCuadrillaIndex(a) - extractCuadrillaIndex(b);
  if (indexDiff !== 0) return indexDiff;
  return String(a || "").localeCompare(String(b || ""), "es", { sensitivity: "base" });
};

function EstadoPill({ estado }: { estado?: string }) {
  return <span className={cls("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset", estadoToColor(estado || ""))}>{estado || "-"}</span>;
}

function Progress({ value = 0 }: { value?: number }) {
  return <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200"><div className="h-2 rounded-full bg-[#27457a] transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

function MetricCard({ label, value, help, tone = "default", progress }: { label: string; value: string; help: string; tone?: "default" | "good" | "warn" | "bad"; progress?: number }) {
  const toneClass = tone === "good" ? "border-emerald-200 bg-emerald-50/70" : tone === "warn" ? "border-amber-200 bg-amber-50/70" : tone === "bad" ? "border-rose-200 bg-rose-50/70" : "border-slate-200 bg-white";
  return (
    <div className={cls("rounded-2xl border p-4 shadow-sm", toneClass)}>
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      <div className="mt-1 text-sm text-slate-600">{help}</div>
      {typeof progress === "number" ? <div className="mt-3"><Progress value={progress} /></div> : null}
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 h-12 w-12 rounded-2xl bg-slate-100" />
        <div className="text-lg font-semibold text-slate-900">{title}</div>
        <div className="mt-2 text-sm text-slate-500">{description}</div>
      </div>
    </div>
  );
}

export default function AsistenciaResumenClient() {
  const { roles: accessRoles, isAdmin } = useAccess();
  const today = dayjs();
  const [desde, setDesde] = useState(today.startOf("month").format("YYYY-MM-DD"));
  const [hasta, setHasta] = useState(today.endOf("month").format("YYYY-MM-DD"));
  const [selectedDay, setSelectedDay] = useState(today.format("YYYY-MM-DD"));
  const [tab, setTab] = useState<"cuadrillas" | "tecnicos">("cuadrillas");
  const [filtroGestor, setFiltroGestor] = useState("");
  const [filtroCoordinador, setFiltroCoordinador] = useState("");
  const [filtroCuadrilla, setFiltroCuadrilla] = useState("");
  const [filtroTecnico, setFiltroTecnico] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [cuadrillas, setCuadrillas] = useState<CuadrillaRow[]>([]);
  const [tecnicos, setTecnicos] = useState<TecnicoRow[]>([]);
  const [editando, setEditando] = useState<EditMap>({});
  const [detailModal, setDetailModal] = useState<DetailModal>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normRole = (s: string) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const roles = (accessRoles || []).map((r: string) => normRole(String(r)));
  const puedeEditar =
    isAdmin ||
    roles.includes("GERENCIA") ||
    roles.includes("JEFATURA") ||
    roles.includes("ALMACEN") ||
    roles.includes("RRHH") ||
    roles.includes("SUPERVISOR") ||
    roles.includes("SEGURIDAD");

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ desde, hasta });
        const res = await fetch(`/api/asistencia/resumen?${qs.toString()}`, { cache: "no-store" });
        const json: ResumenApi = await res.json();
        if (!json?.ok) throw new Error(json?.error || "ERROR");
        setCuadrillas(json.cuadrillas || []);
        setTecnicos(json.tecnicos || []);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "No se pudo cargar el resumen";
        setError(msg);
        setCuadrillas([]);
        setTecnicos([]);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [desde, hasta]);

  useEffect(() => {
    if (selectedDay < desde || selectedDay > hasta) setSelectedDay(desde);
  }, [desde, hasta, selectedDay]);

  const gestoresUnicos = useMemo(() => {
    const set = new Set<string>();
    cuadrillas.forEach((c) => { const v = c.gestorNombre || c.gestorUid || ""; if (v) set.add(v); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [cuadrillas]);

  const coordinadoresUnicos = useMemo(() => {
    const set = new Set<string>();
    cuadrillas.forEach((c) => { const v = c.coordinadorNombre || c.coordinadorUid || ""; if (v) set.add(v); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [cuadrillas]);

  const cuadrillasFiltradas = useMemo(() => {
    const q = (filtroCuadrilla || "").toLowerCase().trim();
    return cuadrillas.filter((c) => {
      const gestor = c.gestorNombre || c.gestorUid || "";
      const coord = c.coordinadorNombre || c.coordinadorUid || "";
      const estado = String(c.estadoAsistencia || "").toLowerCase();
      const texto = [c.cuadrillaNombre, c.zonaNombre, gestor, coord].filter(Boolean).join(" ").toLowerCase();
      return (!filtroGestor || gestor === filtroGestor) && (!filtroCoordinador || coord === filtroCoordinador) && (!filtroEstado || estado === filtroEstado) && (!q || texto.includes(q));
    });
  }, [cuadrillas, filtroGestor, filtroCoordinador, filtroEstado, filtroCuadrilla]);

  const tecnicosFiltrados = useMemo(() => {
    const q = (filtroTecnico || "").toLowerCase().trim();
    return tecnicos.filter((t) => {
      const estado = String(t.estadoAsistencia || "").toLowerCase();
      const nombre = (t.tecnicoNombre || t.tecnicoId || "").toLowerCase();
      const gestor = (t.gestorNombre || t.gestorUid || "").toLowerCase();
      const coord = (t.coordinadorNombre || t.coordinadorUid || "").toLowerCase();
      return (!filtroEstado || estado === filtroEstado) && (!filtroGestor || gestor === filtroGestor.toLowerCase()) && (!filtroCoordinador || coord === filtroCoordinador.toLowerCase()) && (!q || `${nombre} ${gestor} ${coord}`.includes(q));
    });
  }, [tecnicos, filtroEstado, filtroTecnico, filtroGestor, filtroCoordinador]);

  const resumen = useMemo(() => {
    const count = (arr: Array<CuadrillaRow | TecnicoRow>, value: EstadoAsistencia) => arr.reduce((acc, x) => acc + (String(x.estadoAsistencia || "").toLowerCase() === value ? 1 : 0), 0);
    const cTotal = cuadrillasFiltradas.length;
    const tTotal = tecnicosFiltrados.length;
    const cAsis = count(cuadrillasFiltradas, "asistencia");
    const tAsis = count(tecnicosFiltrados, "asistencia");
    const cFalta = count(cuadrillasFiltradas, "falta");
    const tFalta = count(tecnicosFiltrados, "falta");
    return { cTotal, tTotal, cAsis, tAsis, cFalta, tFalta, cPct: cTotal ? Number(((cAsis / cTotal) * 100).toFixed(1)) : 0, tPct: tTotal ? Number(((tAsis / tTotal) * 100).toFixed(1)) : 0 };
  }, [cuadrillasFiltradas, tecnicosFiltrados]);

  const daysInRange = useMemo(() => {
    const list: string[] = [];
    let cursor = dayjs(desde);
    const end = dayjs(hasta);
    while (cursor.isBefore(end) || cursor.isSame(end, "day")) {
      list.push(cursor.format("YYYY-MM-DD"));
      cursor = cursor.add(1, "day");
    }
    return list;
  }, [desde, hasta]);

  const monthlyCuadrillas = useMemo(() => {
    const map = new Map<string, MonthlyCuadrillaRow>();
    cuadrillasFiltradas.forEach((c) => {
      const key = c.cuadrillaId || c.cuadrillaNombre || "";
      const row = map.get(key) || { key, nombre: c.cuadrillaNombre || c.cuadrillaId || "-", zona: c.zonaNombre || c.zonaId || "-", tecnicos: [], statuses: {}, observations: {} };
      row.statuses[c.fecha] = c.estadoAsistencia || "";
      row.observations[c.fecha] = Boolean(String(c.observacion || "").trim());
      map.set(key, row);
    });
    return Array.from(map.values()).sort((a, b) => compareCuadrillaNombre(a.nombre, b.nombre));
  }, [cuadrillasFiltradas]);

  const tecnicosPorCuadrilla = useMemo(() => {
    const map = new Map<string, string[]>();
    tecnicosFiltrados.forEach((t) => {
      const key = t.cuadrillaId || t.cuadrillaNombre || "";
      if (!key) return;
      const current = map.get(key) || [];
      const nombre = t.tecnicoNombre || t.tecnicoId || "";
      if (nombre && !current.includes(nombre)) current.push(nombre);
      map.set(key, current);
    });
    return map;
  }, [tecnicosFiltrados]);

  const monthlyTecnicos = useMemo(() => {
    const map = new Map<string, MonthlyTecnicoRow>();
    tecnicosFiltrados.forEach((t) => {
      const key = t.tecnicoId || t.tecnicoNombre || "";
      const row = map.get(key) || { key, nombre: t.tecnicoNombre || t.tecnicoId || "-", cuadrilla: t.cuadrillaNombre || t.cuadrillaId || "-", gestor: t.gestorNombre || t.gestorUid || "-", confirmadoPor: t.confirmadoPorNombre || t.confirmadoBy || "-", cerradoPor: t.cerradoPorNombre || t.cerradoBy || "-", statuses: {} };
      row.statuses[t.fecha] = t.estadoAsistencia || "";
      map.set(key, row);
    });
    return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [tecnicosFiltrados]);

  const cuadrillasDia = useMemo(() => cuadrillasFiltradas.filter((c) => c.fecha === selectedDay), [cuadrillasFiltradas, selectedDay]);
  const tecnicosDia = useMemo(() => tecnicosFiltrados.filter((t) => t.fecha === selectedDay), [tecnicosFiltrados, selectedDay]);

  const exportarExcel = () => {
    const dayHeaders = daysInRange.map((day) => dayjs(day).format("DD"));
    const cuadrillasMatrixHeader = ["Cuadrilla", "Zona", "Tecnicos", ...dayHeaders];
    const cuadrillasMatrixRows = monthlyCuadrillas.map((row) => [
      row.nombre,
      row.zona,
      (tecnicosPorCuadrilla.get(row.key) || []).join(", "),
      ...daysInRange.map((day) => {
        const estado = row.statuses[day] || "";
        const obs = row.observations[day] ? "*" : "";
        return `${estadoToCode(estado)}${obs}`;
      }),
    ]);
    const tecnicosMatrixHeader = ["Tecnico", "Cuadrilla", ...dayHeaders];
    const tecnicosMatrixRows = monthlyTecnicos.map((row) => [
      row.nombre,
      row.cuadrilla,
      ...daysInRange.map((day) => estadoToCode(row.statuses[day] || "")),
    ]);
    const cuadrillasSheet = cuadrillasFiltradas.map((c) => ({ Fecha: c.fecha, Cuadrilla: c.cuadrillaNombre || c.cuadrillaId || "", Zona: c.zonaNombre || c.zonaId || "", Estado: c.estadoAsistencia || "", Observacion: c.observacion || "", Gestor: c.gestorNombre || c.gestorUid || "", Coordinador: c.coordinadorNombre || c.coordinadorUid || "" }));
    const tecnicosSheet = tecnicosFiltrados.map((t) => ({ Fecha: t.fecha, Tecnico: t.tecnicoNombre || t.tecnicoId || "", Cuadrilla: t.cuadrillaNombre || t.cuadrillaId || "", Estado: t.estadoAsistencia || "", Gestor: t.gestorNombre || t.gestorUid || "", Coordinador: t.coordinadorNombre || t.coordinadorUid || "", Zona: t.zonaNombre || t.zonaId || "" }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cuadrillasMatrixHeader, ...cuadrillasMatrixRows]), "Matriz Cuadrillas");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([tecnicosMatrixHeader, ...tecnicosMatrixRows]), "Matriz Tecnicos");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cuadrillasSheet), "Cuadrillas");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tecnicosSheet), "Tecnicos");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([out], { type: "application/octet-stream" }), `asistencia_${desde}_a_${hasta}.xlsx`);
  };

  const handleEditChange = (id: string, field: keyof EditPatch, value: string) => setEditando((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  const cancelarEdicion = (id: string) => setEditando((prev) => { const cp = { ...prev }; delete cp[id]; return cp; });
  const limpiarFiltros = () => { setFiltroGestor(""); setFiltroCoordinador(""); setFiltroCuadrilla(""); setFiltroTecnico(""); setFiltroEstado(""); };
  const cerrarModal = () => setDetailModal(null);
  const abrirDetalleDesdeCalendario = (type: "cuadrilla" | "tecnico", key: string, day: string) => {
    setSelectedDay(day);
    if (type === "cuadrilla") {
      const row = cuadrillasFiltradas.find((c) => c.fecha === day && String(c.cuadrillaId || c.cuadrillaNombre || "") === key);
      if (!row) return;
      setDetailModal({ type, row });
      return;
    }
    const row = tecnicosFiltrados.find((t) => t.fecha === day && String(t.tecnicoId || t.tecnicoNombre || "") === key);
    if (!row) return;
    setDetailModal({ type, row });
  };

  const guardarCambios = async (c: CuadrillaRow) => {
    const id = c.id || `${c.fecha}_${c.cuadrillaId}`;
    const patch = editando[id];
    if (!patch) return;
    const res = await fetch("/api/asistencia/resumen/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target: "cuadrillas", fecha: c.fecha, cuadrillaId: c.cuadrillaId, patch: { estadoAsistencia: patch.estadoAsistencia, observacion: patch.observacion } }) });
    const json = await res.json();
    if (!json?.ok) return toast.error(json?.error || "No se pudo guardar");
    setCuadrillas((prev) => prev.map((x) => ((x.id || `${x.fecha}_${x.cuadrillaId}`) === id ? { ...x, ...patch } : x)));
    toast.success("Cambios guardados");
    cancelarEdicion(id);
  };

  const guardarCambiosTecnico = async (t: TecnicoRow) => {
    const id = t.id || `${t.fecha}_${t.tecnicoId}`;
    const patch = editando[id];
    if (!patch) return;
    const res = await fetch("/api/asistencia/resumen/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target: "tecnicos", fecha: t.fecha, tecnicoId: t.tecnicoId, patch: { estadoAsistencia: patch.estadoAsistencia } }) });
    const json = await res.json();
    if (!json?.ok) return toast.error(json?.error || "No se pudo guardar");
    setTecnicos((prev) => prev.map((x) => ((x.id || `${x.fecha}_${x.tecnicoId}`) === id ? { ...x, ...patch } : x)));
    toast.success("Cambios guardados");
    cancelarEdicion(id);
  };

  return (
    <div className="space-y-6 text-slate-900">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,#13315c_0%,#254b87_55%,#dbe7fb_55%,#f8fbff_100%)] shadow-sm">
        <div className="grid gap-6 px-5 py-6 lg:grid-cols-[1.4fr_1fr] lg:px-7">
          <div className="text-white">
            <div className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]">Resumen mensual</div>
            <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight">Vista operativa por mes con detalle diario</h2>
            <p className="mt-3 max-w-2xl text-sm text-blue-50/90">Consulta la asistencia por cuadrilla y tecnico en formato calendario. Haz clic en un dia para ver el detalle de esa fecha.</p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs text-blue-50/90">
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">Rango: {desde} a {hasta}</span>
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">Dia activo: {selectedDay}</span>
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">Edicion: {puedeEditar ? "habilitada" : "solo lectura"}</span>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <MetricCard label="Cuadrillas asistiendo" value={`${resumen.cAsis}/${resumen.cTotal}`} help={`${resumen.cPct}% del rango filtrado`} tone="good" progress={resumen.cPct} />
            <MetricCard label="Tecnicos asistiendo" value={`${resumen.tAsis}/${resumen.tTotal}`} help={`${resumen.tPct}% del rango filtrado`} tone="good" progress={resumen.tPct} />
            <MetricCard label="Cuadrillas con falta" value={String(resumen.cFalta)} help="Detectadas segun filtros actuales" tone={resumen.cFalta > 0 ? "bad" : "default"} />
            <MetricCard label="Tecnicos con falta" value={String(resumen.tFalta)} help="Detectados segun filtros actuales" tone={resumen.tFalta > 0 ? "warn" : "default"} />
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm lg:p-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">Filtros de consulta</div>
              <div className="text-sm text-slate-500">La vista carga por defecto el mes actual y permite bajar al detalle por dia.</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => { setDesde(dayjs().startOf("month").format("YYYY-MM-DD")); setHasta(dayjs().endOf("month").format("YYYY-MM-DD")); setSelectedDay(dayjs().format("YYYY-MM-DD")); }} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">Mes actual</button>
              <button onClick={limpiarFiltros} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">Limpiar filtros</button>
              <button onClick={exportarExcel} className="rounded-xl bg-[#254b87] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#1c3a68]">Exportar a Excel</button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <label className="space-y-2"><span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Desde</span><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-[#254b87] focus:ring-2 focus:ring-[#254b87]/15" /></label>
            <label className="space-y-2"><span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Hasta</span><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-[#254b87] focus:ring-2 focus:ring-[#254b87]/15" /></label>
            <label className="space-y-2"><span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Gestor</span><select value={filtroGestor} onChange={(e) => setFiltroGestor(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-[#254b87] focus:ring-2 focus:ring-[#254b87]/15"><option value="">Todos los gestores</option>{gestoresUnicos.map((g) => (<option key={g} value={g}>{g}</option>))}</select></label>
            <label className="space-y-2"><span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Coordinador</span><select value={filtroCoordinador} onChange={(e) => setFiltroCoordinador(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-[#254b87] focus:ring-2 focus:ring-[#254b87]/15"><option value="">Todos los coordinadores</option>{coordinadoresUnicos.map((c) => (<option key={c} value={c}>{c}</option>))}</select></label>
            <label className="space-y-2"><span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Buscar cuadrilla</span><input type="text" placeholder="Cuadrilla, zona o responsable" value={filtroCuadrilla} onChange={(e) => setFiltroCuadrilla(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-[#254b87] focus:ring-2 focus:ring-[#254b87]/15" /></label>
            <label className="space-y-2"><span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Buscar tecnico</span><input type="text" placeholder="Nombre o codigo" value={filtroTecnico} onChange={(e) => setFiltroTecnico(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-[#254b87] focus:ring-2 focus:ring-[#254b87]/15" /></label>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="self-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Estado</span>
            {["", ...ESTADOS].map((estado) => (<button key={estado || "todos"} type="button" onClick={() => setFiltroEstado((prev) => (prev === estado ? "" : estado))} className={cls("rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition", estado ? estadoToColor(estado) : "bg-slate-100 text-slate-700 ring-slate-200", filtroEstado === estado ? "outline outline-2 outline-offset-2 outline-[#254b87]" : "")}>{estado || "Todos"}</button>))}
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-lg font-semibold text-slate-900">Vista calendario por mes</div>
            <div className="text-sm text-slate-500">Cada fila representa una cuadrilla o tecnico. Haz clic en un dia para abrir su detalle.</div>
          </div>
          <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
            <button onClick={() => setTab("cuadrillas")} className={cls("rounded-xl px-4 py-2 text-sm font-medium transition", tab === "cuadrillas" ? "bg-[#254b87] text-white shadow-sm" : "text-slate-600 hover:text-slate-900")}>Cuadrillas</button>
            <button onClick={() => setTab("tecnicos")} className={cls("rounded-xl px-4 py-2 text-sm font-medium transition", tab === "tecnicos" ? "bg-[#254b87] text-white shadow-sm" : "text-slate-600 hover:text-slate-900")}>Tecnicos</button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3 p-5"><div className="h-16 animate-pulse rounded-2xl bg-slate-100" /><div className="h-16 animate-pulse rounded-2xl bg-slate-100" /><div className="h-16 animate-pulse rounded-2xl bg-slate-100" /></div>
        ) : error ? (
          <EmptyState title="No se pudo cargar el resumen" description={error} />
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="bg-slate-900 text-left text-xs font-semibold uppercase tracking-[0.18em] text-white">
                  <th className="sticky left-0 z-20 min-w-[280px] border-r border-slate-700 bg-slate-900 px-4 py-3">{tab === "cuadrillas" ? "Cuadrilla" : "Tecnico"}</th>
                  {daysInRange.map((day) => (<th key={day} className="min-w-[58px] px-2 py-3 text-center"><button type="button" onClick={() => setSelectedDay(day)} className={cls("w-full rounded-lg px-2 py-1 transition", selectedDay === day ? "bg-white text-slate-900" : "hover:bg-white/10")}>{dayjs(day).format("DD")}</button></th>))}
                </tr>
              </thead>
              <tbody>
                {tab === "cuadrillas" ? (
                  monthlyCuadrillas.length === 0 ? (
                    <tr><td colSpan={daysInRange.length + 1}><EmptyState title="No hay cuadrillas para mostrar" description="Prueba ampliando el rango o limpiando los filtros actuales." /></td></tr>
                  ) : monthlyCuadrillas.map((row, idx) => (
                    <tr key={row.key} className={cls("border-b border-slate-200", idx % 2 ? "bg-slate-50/60" : "bg-white")}>
                      <td className="sticky left-0 z-10 min-w-[280px] border-r border-slate-200 bg-inherit px-4 py-3 align-top"><div className="font-medium text-slate-900">{row.nombre}</div><div className="mt-1 text-xs text-slate-500">Zona: {row.zona}</div><div className="mt-2 text-xs text-slate-500">Tecnicos: {(tecnicosPorCuadrilla.get(row.key) || []).length ? (tecnicosPorCuadrilla.get(row.key) || []).join(", ") : "Sin tecnicos registrados"}</div></td>
                      {daysInRange.map((day) => {
                        const estado = row.statuses[day] || "";
                        const hasObservation = Boolean(row.observations[day]);
                        return (
                          <td key={day} className="px-2 py-2 text-center">
                            <button
                              type="button"
                              title={hasObservation ? "Este registro tiene observacion" : undefined}
                              onClick={() => abrirDetalleDesdeCalendario("cuadrilla", row.key, day)}
                              className={cls("relative mx-auto inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg px-2 text-xs font-semibold ring-1 ring-inset transition", estado ? estadoToColor(estado) : "bg-slate-50 text-slate-400 ring-slate-200", selectedDay === day ? "outline outline-2 outline-offset-1 outline-[#254b87]" : "", estado ? "cursor-pointer" : "cursor-default")}
                            >
                              {estadoToCode(estado)}
                              {hasObservation ? <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-slate-900 ring-2 ring-white" /> : null}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                ) : monthlyTecnicos.length === 0 ? (
                  <tr><td colSpan={daysInRange.length + 1}><EmptyState title="No hay tecnicos para mostrar" description="Prueba ampliando el rango o revisando los filtros actuales." /></td></tr>
                ) : monthlyTecnicos.map((row, idx) => (
                  <tr key={row.key} className={cls("border-b border-slate-200", idx % 2 ? "bg-slate-50/60" : "bg-white")}>
                    <td className="sticky left-0 z-10 min-w-[280px] border-r border-slate-200 bg-inherit px-4 py-3 align-top"><div className="font-medium text-slate-900">{row.nombre}</div><div className="mt-1 text-xs text-slate-500">Cuadrilla: {row.cuadrilla}</div><div className="mt-1 text-xs text-slate-500">Gestor responsable: {row.gestor}</div><div className="mt-1 text-xs text-slate-500">Confirmado por: {row.confirmadoPor}</div><div className="mt-1 text-xs text-slate-500">Cerrado por: {row.cerradoPor}</div></td>
                    {daysInRange.map((day) => { const estado = row.statuses[day] || ""; return <td key={day} className="px-2 py-2 text-center"><button type="button" onClick={() => abrirDetalleDesdeCalendario("tecnico", row.key, day)} className={cls("mx-auto inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg px-2 text-xs font-semibold ring-1 ring-inset transition", estado ? estadoToColor(estado) : "bg-slate-50 text-slate-400 ring-slate-200", selectedDay === day ? "outline outline-2 outline-offset-1 outline-[#254b87]" : "", estado ? "cursor-pointer" : "cursor-default")}>{estadoToCode(estado)}</button></td>; })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detailModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onClick={cerrarModal}>
          <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-[28px] bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <div>
                <div className="text-lg font-semibold text-slate-900">
                  {detailModal.type === "cuadrilla" ? "Detalle de cuadrilla" : "Detalle de tecnico"}
                </div>
                <div className="text-sm text-slate-500">
                  {detailModal.type === "cuadrilla"
                    ? `${detailModal.row.cuadrillaNombre || detailModal.row.cuadrillaId} · ${detailModal.row.fecha}`
                    : `${detailModal.row.tecnicoNombre || detailModal.row.tecnicoId} · ${detailModal.row.fecha}`}
                </div>
              </div>
              <button onClick={cerrarModal} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                Cerrar
              </button>
            </div>

            {detailModal.type === "cuadrilla" ? (
              <div className="p-5">
                {(() => {
                  const c = detailModal.row;
                  const rowId = c.id || `${c.fecha}_${c.cuadrillaId}`;
                  const esEditando = !!editando[rowId];
                  const valor = editando[rowId] || c;
                  return (
                    <div className="space-y-5">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Cuadrilla</div><div className="mt-2 font-semibold text-slate-900">{c.cuadrillaNombre || c.cuadrillaId}</div></div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Zona</div><div className="mt-2 font-semibold text-slate-900">{c.zonaNombre || c.zonaId || "-"}</div></div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Gestor responsable</div><div className="mt-2 font-semibold text-slate-900">{c.gestorNombre || c.gestorUid || "-"}</div></div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Coordinador</div><div className="mt-2 font-semibold text-slate-900">{c.coordinadorNombre || c.coordinadorUid || "-"}</div></div>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
                        <div className="space-y-4 rounded-2xl border border-slate-200 p-4">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Estado</div>
                            <div className="mt-2">
                              {esEditando ? (
                                <select value={valor.estadoAsistencia} onChange={(e) => handleEditChange(rowId, "estadoAsistencia", e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-[#254b87] focus:ring-2 focus:ring-[#254b87]/15">
                                  {ESTADOS.map((op) => (<option key={op} value={op}>{op}</option>))}
                                </select>
                              ) : (
                                <EstadoPill estado={c.estadoAsistencia} />
                              )}
                            </div>
                          </div>

                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Fecha</div>
                            <div className="mt-2 text-sm font-medium text-slate-900">{c.fecha}</div>
                          </div>
                        </div>

                        <div className="space-y-4 rounded-2xl border border-slate-200 p-4">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Observacion</div>
                            <div className="mt-2">
                              {esEditando ? (
                                <textarea value={valor.observacion || ""} onChange={(e) => handleEditChange(rowId, "observacion", e.target.value)} rows={4} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-[#254b87] focus:ring-2 focus:ring-[#254b87]/15" />
                              ) : (
                                <div className="min-h-[110px] rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{c.observacion || "Sin observacion"}</div>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {puedeEditar ? (
                              esEditando ? (
                                <>
                                  <button onClick={async () => { await guardarCambios(c); setDetailModal((prev) => (prev && prev.type === "cuadrilla" ? { ...prev, row: { ...prev.row, ...(editando[rowId] || {}) } } : prev)); }} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700">Guardar cambios</button>
                                  <button onClick={() => cancelarEdicion(rowId)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">Cancelar</button>
                                </>
                              ) : (
                                <button onClick={() => setEditando((p) => ({ ...p, [rowId]: c }))} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-600">Editar</button>
                              )
                            ) : (
                              <span className="text-sm text-slate-500">Sin permisos de edicion</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="p-5">
                {(() => {
                  const t = detailModal.row;
                  const rowId = t.id || `${t.fecha}_${t.tecnicoId}`;
                  const esEditando = !!editando[rowId];
                  const valor = editando[rowId] || t;
                  return (
                    <div className="space-y-5">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Tecnico</div><div className="mt-2 font-semibold text-slate-900">{t.tecnicoNombre || t.tecnicoId}</div></div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Cuadrilla</div><div className="mt-2 font-semibold text-slate-900">{t.cuadrillaNombre || t.cuadrillaId || "-"}</div></div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Confirmado por</div><div className="mt-2 font-semibold text-slate-900">{t.confirmadoPorNombre || t.confirmadoBy || "-"}</div></div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Cerrado por</div><div className="mt-2 font-semibold text-slate-900">{t.cerradoPorNombre || t.cerradoBy || "-"}</div></div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 p-4">
                        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Estado</div>
                            <div className="mt-2">
                              {esEditando ? (
                                <select value={valor.estadoAsistencia} onChange={(e) => handleEditChange(rowId, "estadoAsistencia", e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-[#254b87] focus:ring-2 focus:ring-[#254b87]/15">
                                  {ESTADOS.map((op) => (<option key={op} value={op}>{op}</option>))}
                                </select>
                              ) : (
                                <EstadoPill estado={t.estadoAsistencia} />
                              )}
                            </div>
                          </div>

                          <div className="flex items-end gap-2">
                            {puedeEditar ? (
                              esEditando ? (
                                <>
                                  <button onClick={async () => { await guardarCambiosTecnico(t); setDetailModal((prev) => (prev && prev.type === "tecnico" ? { ...prev, row: { ...prev.row, ...(editando[rowId] || {}) } } : prev)); }} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700">Guardar cambios</button>
                                  <button onClick={() => cancelarEdicion(rowId)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">Cancelar</button>
                                </>
                              ) : (
                                <button onClick={() => setEditando((prev) => ({ ...prev, [rowId]: t }))} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-600">Editar</button>
                              )
                            ) : (
                              <span className="text-sm text-slate-500">Sin permisos de edicion</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
