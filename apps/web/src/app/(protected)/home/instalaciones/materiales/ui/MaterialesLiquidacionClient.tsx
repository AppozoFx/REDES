"use client";
import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import "dayjs/locale/es";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

dayjs.extend(customParseFormat);
dayjs.locale("es");

const parseIntSafe = (v: unknown) => { const n = parseInt(String(v), 10); return Number.isNaN(n) ? 0 : n; };
const parseFloatSafe = (v: unknown) => { const n = parseFloat(String(v)); return Number.isNaN(n) ? 0 : n; };
const formatearFecha = (f: any) => (f ? dayjs(f).format("DD/MM/YYYY") : "-");
const formatActa = (v: string) => {
  const digits = String(v || "").replace(/[^\d]/g, "");
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
};
const esResidencial = (row: any) => String(row?.tipoOrden || "").trim().toUpperCase() === "RESIDENCIAL";

type Row = {
  id: string;
  codigoCliente: string;
  cliente: string;
  cuadrillaNombre: string;
  fechaInstalacion: string;
  fechaOrdenYmd?: string;
  tipoOrden?: string;
  acta?: string;
  coordinador?: string;
  materialesConsumidos?: Array<{ materialId: string; und?: number; metros?: number }>;
  snONT?: string;
  snMESH?: string[];
  snBOX?: string[];
  snFONO?: string;
  materialesLiquidacion?: {
    acta?: string; precon?: string; bobinaMetros?: number;
    anclajeP?: number; templador?: number; clevi?: number;
  };
};

type FormState = {
  acta?: string; precon?: string; bobinaMetros?: string;
  anclajeP?: string; templador?: string; clevi?: string;
};

const VDivider = () => <span className="mx-1.5 h-6 w-px shrink-0 self-start mt-1 bg-slate-200 dark:bg-slate-700" />;

export default function MaterialesLiquidacionClient() {
  const [items, setItems] = useState<Row[]>([]);
  const [cargando, setCargando] = useState(false);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [editingRows, setEditingRows] = useState<Record<string, boolean>>({});
  const [actaStatus, setActaStatus] = useState<Record<string, { value: string; level: "ok" | "warn" | "error"; message: string }>>({});
  const [filtros, setFiltros] = useState({ mes: dayjs().format("YYYY-MM"), dia: "", busqueda: "", coordinador: "", cuadrilla: "", estado: "" });
  const [forms, setForms] = useState<Record<string, FormState>>({});
  const [sortKey, setSortKey] = useState<"estado" | "fecha">("fecha");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const cargar = async (silent = false) => {
    if (!silent) setCargando(true);
    try {
      const params = new URLSearchParams();
      if (filtros.dia) params.set("ymd", filtros.dia);
      else params.set("ym", filtros.mes);
      const res = await fetch(`/api/instalaciones/list?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "ERROR");
      setItems(data.items || []);
    } catch (e: any) {
      toast.error(e?.message || "Error cargando instalaciones");
    } finally {
      if (!silent) setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, [filtros.mes, filtros.dia]);

  const list = useMemo(() => {
    const q = String(filtros.busqueda || "").toLowerCase().trim();
    const coord = String(filtros.coordinador || "").toLowerCase().trim();
    const cuadrilla = String(filtros.cuadrilla || "").toLowerCase().trim();
    const estado = String(filtros.estado || "").toLowerCase().trim();
    return items.filter((x) => {
      const hay = `${x.codigoCliente || ""} ${x.cliente || ""} ${x.cuadrillaNombre || ""}`.toLowerCase();
      const liquidado = isLiquidado(x);
      return (
        (q ? hay.includes(q) : true) &&
        (coord ? String(x.coordinador || "").toLowerCase().includes(coord) : true) &&
        (cuadrilla ? String(x.cuadrillaNombre || "").toLowerCase().includes(cuadrilla) : true) &&
        (estado ? (estado === "liquidado" ? liquidado : !liquidado) : true)
      );
    });
  }, [items, filtros.busqueda, filtros.coordinador, filtros.cuadrilla, filtros.estado]);

  const coordinadores = useMemo(() =>
    Array.from(new Set(items.map((x) => String(x.coordinador || "").trim()).filter(Boolean))).sort()
  , [items]);

  const setField = (id: string, key: keyof FormState, value: string) => {
    setForms((prev) => ({
      ...prev,
      [id]: { acta: "", precon: "", bobinaMetros: "", anclajeP: "", templador: "", clevi: "", ...prev[id], [key]: value },
    }));
  };

  const validarActa = async (rowId: string, raw: string) => {
    const code = formatActa(raw || "");
    if (!code) { setActaStatus((p) => { const cp = { ...p }; delete cp[rowId]; return cp; }); return; }
    if (actaStatus[rowId]?.value === code) return;
    try {
      const res = await fetch(`/api/actas/validate?code=${encodeURIComponent(code)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "ERROR");
      const estado = String(data?.estado || "").toUpperCase();
      const noRecep = estado === "NO_RECEPCIONADA";
      setActaStatus((p) => ({
        ...p,
        [rowId]: {
          value: code,
          level: noRecep ? "warn" : "ok",
          message: noRecep
            ? "Acta no recepcionada — al liquidar se recepcionará automáticamente"
            : "Acta válida y recepcionada",
        },
      }));
    } catch (e: any) {
      const msg = String(e?.message || "");
      const friendly =
        msg.includes("ACTA_NOT_FOUND") ? "Acta no encontrada en recepción — verifica el número" :
        msg.includes("ACTA_YA_LIQUIDADA") ? "Acta ya usada en otra liquidación" :
        "Número de acta inválido";
      setActaStatus((p) => ({ ...p, [rowId]: { value: code, level: "error", message: friendly } }));
    }
  };

  function isLiquidado(row: Row) { return !!String(row.materialesLiquidacion?.acta || "").trim(); }

  const getExisting = (row: Row) => {
    const liq = row.materialesLiquidacion || {};
    const acta = String(liq.acta || row.acta || "").trim();
    let precon = String(liq.precon || "").trim();
    let bobinaMetros = Number(liq.bobinaMetros || 0);
    const anclajeP = Number(liq.anclajeP || 0);
    const templador = Number(liq.templador || 0);
    const clevi = Number(liq.clevi || 0);
    if (!precon && bobinaMetros <= 0) {
      const mats = Array.isArray(row.materialesConsumidos) ? row.materialesConsumidos : [];
      const findUnd = (id: string) => Math.floor(Number(mats.find((m) => m.materialId === id)?.und || 0));
      const findM = (id: string) => Number(mats.find((m) => m.materialId === id)?.metros || 0);
      const hit = ["PRECON_50", "PRECON_100", "PRECON_150", "PRECON_200"].find((p) => findUnd(p) > 0);
      if (hit) precon = hit;
      bobinaMetros = findM("BOBINA");
    }
    return { acta, precon, bobinaMetros, anclajeP, templador, clevi };
  };

  const guardar = async (row: Row) => {
    const f = forms[row.id] || {};
    const existing = getExisting(row);
    const acta = String(f.acta ?? existing.acta ?? "").trim();
    const precon = String(f.precon ?? existing.precon ?? "").trim();
    const bobinaMetros = parseFloatSafe(f.bobinaMetros ?? existing.bobinaMetros ?? 0);
    if (!acta) return toast.error("Ingresa el número de ACTA");
    if (precon && bobinaMetros > 0) return toast.error("Elige DROP o PRECON, no ambos");
    if (!precon && bobinaMetros <= 0) return toast.error("Ingresa los metros de DROP o elige PRECON");

    const needsAuto = actaStatus[row.id]?.value === formatActa(acta) && actaStatus[row.id]?.level === "warn";
    if (needsAuto) {
      const ok = window.confirm(`El acta ${formatActa(acta)} no está recepcionada.\n¿Deseas recepcionarla y liquidar ahora?\n\nCliente: ${row.cliente || row.codigoCliente}`);
      if (!ok) return;
    }

    const payload = {
      id: row.id, acta, precon, bobinaMetros,
      anclajeP: parseIntSafe(f.anclajeP ?? existing.anclajeP),
      templador: parseIntSafe(f.templador ?? existing.templador),
      clevi: parseIntSafe(f.clevi ?? existing.clevi),
      autoRecepcionar: needsAuto,
    };

    if (isLiquidado(row)) {
      const changed =
        acta !== existing.acta || precon !== existing.precon ||
        bobinaMetros !== Number(existing.bobinaMetros || 0) ||
        parseIntSafe(payload.anclajeP) !== Number(existing.anclajeP || 0) ||
        parseIntSafe(payload.templador) !== Number(existing.templador || 0) ||
        parseIntSafe(payload.clevi) !== Number(existing.clevi || 0);
      if (!changed) return toast.message("Sin cambios para guardar");
    }

    try {
      setGuardandoId(row.id);
      const res = await fetch("/api/instalaciones/materiales/liquidar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "ERROR");
      toast.success("Liquidación de materiales registrada correctamente");
      setItems((prev) => prev.map((it) =>
        it.id !== row.id ? it : {
          ...it,
          materialesLiquidacion: {
            ...(it.materialesLiquidacion || {}),
            acta, precon, bobinaMetros,
            anclajeP: parseIntSafe(payload.anclajeP),
            templador: parseIntSafe(payload.templador),
            clevi: parseIntSafe(payload.clevi),
          },
        }
      ));
      setEditingRows((p) => { const cp = { ...p }; delete cp[row.id]; return cp; });
      setForms((p) => { const cp = { ...p }; delete cp[row.id]; return cp; });
      if (String(filtros.estado || "").toLowerCase() !== "pendiente") void cargar(true);
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg.includes("ACTA_YA_LIQUIDADA")) toast.error("Este acta ya fue usada en otra liquidación");
      else if (msg.includes("ACTA_YA_ASIGNADA")) toast.error("Este acta ya está asignada a otra instalación");
      else if (msg.includes("ACTA_NOT_FOUND")) toast.error("Acta no encontrada en el sistema");
      else if (msg.includes("ACTA_NO_RECEPCIONADA")) toast.error("El acta no está recepcionada");
      else if (msg.includes("STOCK_INSUFICIENTE")) toast.error("Stock insuficiente en cuadrilla: " + (msg.split("STOCK_INSUFICIENTE_CUADRILLA ")[1] || ""));
      else toast.error(e?.message || "Error al liquidar");
    } finally {
      setGuardandoId(null);
    }
  };

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === "estado") {
        const diff = (isLiquidado(a) ? 1 : 0) - (isLiquidado(b) ? 1 : 0);
        if (diff !== 0) return diff * dir;
      }
      const ta = dayjs(a.fechaInstalacion).valueOf() || 0;
      const tb = dayjs(b.fechaInstalacion).valueOf() || 0;
      if (ta !== tb) return (ta - tb) * dir;
      return String(a.codigoCliente || "").localeCompare(String(b.codigoCliente || ""));
    });
  }, [list, sortKey, sortDir]);

  const toggleSort = (key: "estado" | "fecha") => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const resumen = useMemo(() => {
    const liquidadas = sorted.filter((x) => isLiquidado(x)).length;
    return { total: sorted.length, liquidadas, pendientes: sorted.length - liquidadas };
  }, [sorted]);

  const exportXlsx = () => {
    const rows = sorted.map((r) => {
      const ex = getExisting(r);
      const cable = ex.precon ? ex.precon : ex.bobinaMetros > 0 ? String(ex.bobinaMetros) : "";
      return {
        Estado: isLiquidado(r) ? "Liquidado" : "Pendiente",
        Fecha: formatearFecha(r.fechaInstalacion),
        Coordinador: r.coordinador || "", Cuadrilla: r.cuadrillaNombre || "",
        CodigoCliente: r.codigoCliente || "", Cliente: r.cliente || "",
        ACTA: ex.acta || "",
        Cable: cable,
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Materiales");
    saveAs(new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })], { type: "application/octet-stream" }), `Materiales_${dayjs().format("YYYYMMDD_HHmmss")}.xlsx`);
  };

  const filterInput = "h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-sm dark:border-slate-600 dark:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-[#30518c]";
  const SortArrow = ({ active, dir }: { active: boolean; dir: "asc" | "desc" }) =>
    <span className={`ml-1 text-[11px] ${active ? "text-[#30518c]" : "text-slate-300"}`}>{active ? (dir === "asc" ? "▲" : "▼") : "⇅"}</span>;

  return (
    <div className="w-full pb-8">
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-30 bg-slate-50 dark:bg-slate-950">
        <div className="border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Materiales · Liquidacion</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Registra el consumo de materiales por instalacion.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => cargar()} disabled={cargando || !!guardandoId}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
                <svg className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" /></svg>
                {cargando ? "Cargando..." : "Refrescar"}
              </button>
              <button onClick={exportXlsx} className="rounded-lg bg-[#30518c] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
                Exportar XLSX
              </button>
            </div>
          </div>

          {/* Filtros */}
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              { label: "Mes", el: <input type="month" value={filtros.mes} onChange={(e) => setFiltros((p) => ({ ...p, mes: e.target.value }))} className={filterInput + " w-36"} /> },
              { label: "Día", el: <input type="date" value={filtros.dia} onChange={(e) => setFiltros((p) => ({ ...p, dia: e.target.value }))} className={filterInput + " w-36"} /> },
            ].map(({ label, el }) => (
              <div key={label} className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</label>
                {el}
              </div>
            ))}
            <div className="flex flex-1 flex-col gap-1 min-w-40">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Buscar</label>
              <input type="text" value={filtros.busqueda} onChange={(e) => setFiltros((p) => ({ ...p, busqueda: e.target.value }))} placeholder="Código o cliente..." className={filterInput + " w-full"} />
            </div>
            <div className="flex flex-col gap-1 min-w-36">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Coordinador</label>
              <select value={filtros.coordinador} onChange={(e) => setFiltros((p) => ({ ...p, coordinador: e.target.value }))} className={filterInput + " w-full"}>
                <option value="">Todos</option>
                {coordinadores.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1 min-w-36">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Cuadrilla</label>
              <input type="text" value={filtros.cuadrilla} onChange={(e) => setFiltros((p) => ({ ...p, cuadrilla: e.target.value }))} placeholder="Filtrar..." autoComplete="off" className={filterInput + " w-full"} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Estado</label>
              <select value={filtros.estado} onChange={(e) => setFiltros((p) => ({ ...p, estado: e.target.value }))} className={filterInput + " w-32"}>
                <option value="">Todos</option>
                <option value="liquidado">Liquidado</option>
                <option value="pendiente">Pendiente</option>
              </select>
            </div>
          </div>
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-3 divide-x divide-slate-200 border-b border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900">
          <div className="px-4 py-2.5"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Total</p><p className="text-2xl font-bold text-slate-700 dark:text-slate-200">{resumen.total}</p></div>
          <div className="px-4 py-2.5"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Liquidados</p><p className="text-2xl font-bold text-emerald-600">{resumen.liquidadas}</p></div>
          <div className="px-4 py-2.5"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Pendientes</p><p className="text-2xl font-bold text-amber-600">{resumen.pendientes}</p></div>
        </div>
      </div>

      {/* ── Tabla ── */}
      <div className="overflow-x-auto bg-white dark:bg-slate-900">
        <table className="min-w-[1380px] w-full text-sm border-collapse">
          <thead className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="border-b border-slate-200 p-2.5 text-center text-xs font-semibold uppercase tracking-wide dark:border-slate-700 w-24 cursor-pointer select-none" onClick={() => toggleSort("estado")}>Estado<SortArrow active={sortKey === "estado"} dir={sortDir} /></th>
              <th className="border-b border-slate-200 p-2.5 text-center text-xs font-semibold uppercase tracking-wide dark:border-slate-700 w-24 cursor-pointer select-none" onClick={() => toggleSort("fecha")}>Fecha<SortArrow active={sortKey === "fecha"} dir={sortDir} /></th>
              <th className="border-b border-slate-200 p-2.5 text-left text-xs font-semibold uppercase tracking-wide dark:border-slate-700 w-36">Cuadrilla</th>
              <th className="border-b border-slate-200 p-2.5 text-left text-xs font-semibold uppercase tracking-wide dark:border-slate-700 w-24">Código</th>
              <th className="border-b border-slate-200 p-2.5 text-left text-xs font-semibold uppercase tracking-wide dark:border-slate-700 w-55">Cliente</th>
              <th className="border-b border-slate-200 p-2.5 text-center text-xs font-semibold uppercase tracking-wide dark:border-slate-700 w-28">ONT</th>
              <th className="border-b border-slate-200 p-2.5 text-center text-xs font-semibold uppercase tracking-wide dark:border-slate-700 w-40">MESH</th>
              <th className="border-b border-slate-200 p-2.5 text-center text-xs font-semibold uppercase tracking-wide dark:border-slate-700 w-40">BOX</th>
              <th className="border-b border-slate-200 p-2.5 text-center text-xs font-semibold uppercase tracking-wide dark:border-slate-700 w-28">FONO</th>
              <th className="border-b border-slate-200 p-2.5 text-left text-xs font-semibold uppercase tracking-wide dark:border-slate-700 w-270">Liquidación de materiales</th>
              <th className="border-b border-slate-200 p-2.5 text-center text-xs font-semibold uppercase tracking-wide dark:border-slate-700 w-28">Acción</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr><td colSpan={11} className="p-10 text-center text-slate-400">
                <div className="flex items-center justify-center gap-2 text-sm">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  Cargando instalaciones...
                </div>
              </td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={11} className="p-10 text-center text-sm text-slate-400">No hay registros para los filtros actuales.</td></tr>
            ) : sorted.map((row, idx) => {
              const f = forms[row.id] || {};
              const existing = getExisting(row);
              const residencial = esResidencial(row);
              const saving = guardandoId === row.id;
              const liquidado = isLiquidado(row);
              const editing = !!editingRows[row.id] || !liquidado;
              const precon = String(f.precon ?? existing.precon ?? "");
              const bobinaVal = String(f.bobinaMetros ?? (existing.bobinaMetros > 0 ? existing.bobinaMetros : "") ?? "");
              const bobinaNum = parseFloatSafe(bobinaVal);
              const isDropMode = !precon;
              const actas = actaStatus[row.id];
              const clevi = parseIntSafe(f.clevi ?? existing.clevi);

              const actaBorderCls = actas
                ? actas.level === "ok"   ? "border-emerald-400 ring-1 ring-emerald-200 dark:border-emerald-600"
                : actas.level === "warn" ? "border-amber-400 ring-1 ring-amber-200 dark:border-amber-600"
                :                          "border-red-400 ring-1 ring-red-200 dark:border-red-600"
                : "border-slate-300 dark:border-slate-600";

              return (
                <tr key={row.id} className={`align-middle border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 ${idx % 2 ? "bg-slate-50/30 dark:bg-slate-800/20" : "bg-white dark:bg-slate-900"}`}>

                  {/* Estado */}
                  <td className="p-2.5 text-center">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${liquidado ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400" : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${liquidado ? "bg-emerald-500" : "bg-amber-500"}`} />
                      {liquidado ? "Liquidado" : "Pendiente"}
                    </span>
                  </td>

                  {/* Fecha */}
                  <td className="p-2.5 text-center text-slate-600 dark:text-slate-300">{formatearFecha(row.fechaInstalacion)}</td>

                  {/* Cuadrilla */}
                  <td className="p-2.5 font-medium text-slate-800 dark:text-slate-100">{row.cuadrillaNombre || "-"}</td>

                  {/* Código */}
                  <td className="p-2.5 font-mono text-slate-600 dark:text-slate-300">{row.codigoCliente || "-"}</td>

                  {/* Cliente */}
                  <td className="p-2.5 text-slate-700 dark:text-slate-200">{row.cliente || "-"}</td>

                  {/* SN ONT */}
                  <td className="p-2.5 text-center font-mono text-xs text-slate-500 dark:text-slate-400">{row.snONT || <span className="text-slate-200 dark:text-slate-700">—</span>}</td>

                  {/* SN MESH */}
                  <td className="p-2.5">
                    {Array.isArray(row.snMESH) && row.snMESH.filter(Boolean).length > 0
                      ? <div className="flex flex-wrap justify-center gap-0.5">{row.snMESH.filter(Boolean).map((sn, i) => <span key={i} className="rounded border border-emerald-200 bg-emerald-50 px-1 font-mono text-[11px] text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">{sn}</span>)}</div>
                      : <span className="block text-center text-slate-200 dark:text-slate-700">—</span>}
                  </td>

                  {/* SN BOX */}
                  <td className="p-2.5">
                    {Array.isArray(row.snBOX) && row.snBOX.filter(Boolean).length > 0
                      ? <div className="flex flex-wrap justify-center gap-0.5">{row.snBOX.filter(Boolean).map((sn, i) => <span key={i} className="rounded border border-amber-200 bg-amber-50 px-1 font-mono text-[11px] text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">{sn}</span>)}</div>
                      : <span className="block text-center text-slate-200 dark:text-slate-700">—</span>}
                  </td>

                  {/* SN FONO */}
                  <td className="p-2.5 text-center font-mono text-xs text-slate-500 dark:text-slate-400">{row.snFONO || <span className="text-slate-200 dark:text-slate-700">—</span>}</td>

                  {/* ── Liquidación (solo el form) ── */}
                  <td className="p-2.5">
                    {liquidado && !editing ? (
                      /* Modo lectura */
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-slate-700 dark:text-slate-200">ACTA {existing.acta || "-"}</span>
                          <VDivider />
                          <span className="text-sm text-slate-600 dark:text-slate-300">
                            {existing.precon ? existing.precon.replace("_", " ") : existing.bobinaMetros > 0 ? `DROP ${existing.bobinaMetros} m` : "-"}
                          </span>
                          {!existing.precon && existing.bobinaMetros > 0 && (
                            <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300">+1 CONECTOR</span>
                          )}
                        </div>
                        {residencial && (existing.anclajeP > 0 || existing.templador > 0 || existing.clevi > 0) && (
                          <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-2.5 dark:border-violet-800 dark:bg-violet-950/10">
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">
                              Materiales adicionales — Instalación residencial
                            </p>
                            <div className="grid grid-cols-3 gap-2 text-sm">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[11px] font-medium text-slate-500">Anclaje en Pared</span>
                                <span className="font-semibold text-slate-700 dark:text-slate-200">{existing.anclajeP} und.</span>
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[11px] font-medium text-slate-500">Templador</span>
                                <span className="font-semibold text-slate-700 dark:text-slate-200">{existing.templador} und.</span>
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[11px] font-medium text-slate-500">Clevi</span>
                                <span className="font-semibold text-slate-700 dark:text-slate-200">{existing.clevi} und.</span>
                              </div>
                            </div>
                            {existing.clevi > 0 && (
                              <div className="mt-2 grid grid-cols-3 gap-2 rounded border border-violet-100 bg-white/70 px-2.5 py-1.5 text-xs text-slate-600 dark:border-violet-900/30 dark:bg-slate-900/50 dark:text-slate-300">
                                <span><span className="font-medium text-violet-600 dark:text-violet-400">Tarugos P:</span> {existing.anclajeP} und.</span>
                                <span><span className="font-medium text-violet-600 dark:text-violet-400">Hebilla 1/2:</span> {existing.clevi * 2} und.</span>
                                <span><span className="font-medium text-violet-600 dark:text-violet-400">Cinta Bandi 1/2:</span> {(existing.clevi * 1.2).toFixed(1)} m</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Modo edición — solo el form, sin botones */
                      <div className="flex flex-col gap-2">
                        {/* Controles principales */}
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">N° Acta</label>
                            <input type="text" placeholder="000-0000"
                              className={`h-8 w-28 rounded-lg border px-2.5 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[#30518c] dark:bg-slate-900 ${actaBorderCls}`}
                              value={formatActa(f.acta ?? existing.acta ?? "")}
                              onChange={(e) => setField(row.id, "acta", formatActa(e.target.value))}
                              onBlur={() => validarActa(row.id, String(f.acta ?? existing.acta ?? ""))}
                              disabled={!editing} />
                          </div>
                          <VDivider />
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Tipo de cable</label>
                            <div className="flex h-8 overflow-hidden rounded-lg border border-slate-300 text-sm font-semibold dark:border-slate-600">
                              <button type="button" disabled={!editing}
                                onClick={() => setField(row.id, "precon", "")}
                                className={`px-3 transition-colors ${isDropMode ? "bg-[#30518c] text-white" : "bg-white text-slate-500 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400"}`}>
                                DROP
                              </button>
                              <button type="button" disabled={!editing}
                                onClick={() => { setField(row.id, "precon", "PRECON_50"); setField(row.id, "bobinaMetros", ""); }}
                                className={`border-l border-slate-300 px-3 transition-colors dark:border-slate-600 ${!isDropMode ? "bg-[#30518c] text-white" : "bg-white text-slate-500 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400"}`}>
                                PRECON
                              </button>
                            </div>
                          </div>
                          {isDropMode && (
                            <div className="flex flex-col gap-0.5">
                              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Metros de DROP</label>
                              <div className="flex h-8 items-center gap-1.5">
                                <input type="number" min={0} step="0.1" placeholder="0.0 m"
                                  className="h-8 w-24 rounded-lg border border-slate-300 bg-white px-2.5 text-sm dark:border-slate-600 dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-[#30518c]"
                                  value={bobinaVal}
                                  onChange={(e) => setField(row.id, "bobinaMetros", e.target.value)}
                                  disabled={!editing} />
                                {bobinaNum > 0 && (
                                  <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300" title="Se descuenta 1 CONECTOR del stock">
                                    +1 CONECTOR
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                          {!isDropMode && (
                            <div className="flex flex-col gap-0.5">
                              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Variante PRECON</label>
                              <select className="h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-sm dark:border-slate-600 dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-[#30518c]"
                                value={precon} onChange={(e) => setField(row.id, "precon", e.target.value)} disabled={!editing}>
                                <option value="PRECON_50">PRECON 50 m</option>
                                <option value="PRECON_100">PRECON 100 m</option>
                                <option value="PRECON_150">PRECON 150 m</option>
                                <option value="PRECON_200">PRECON 200 m</option>
                              </select>
                            </div>
                          )}
                        </div>
                        {/* Validación ACTA */}
                        {actas && (
                          <div className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
                            actas.level === "ok"   ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" :
                            actas.level === "warn" ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300" :
                                                     "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"
                          }`}>
                            <span className="shrink-0 text-base leading-none">{actas.level === "ok" ? "✓" : actas.level === "warn" ? "⚠" : "✕"}</span>
                            <span>{actas.message}</span>
                          </div>
                        )}
                        {/* Residencial */}
                        {residencial && (
                          <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-2.5 dark:border-violet-800 dark:bg-violet-950/10">
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">
                              Materiales adicionales — Instalación residencial
                            </p>
                            <div className="flex flex-wrap gap-3">
                              <div className="flex flex-col gap-0.5">
                                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Anclaje en Pared</label>
                                <input type="number" min={0} placeholder="0"
                                  className="h-8 w-20 rounded-lg border border-slate-300 bg-white px-2.5 text-sm dark:border-slate-600 dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-[#30518c]"
                                  value={f.anclajeP ?? existing.anclajeP ?? ""}
                                  onChange={(e) => setField(row.id, "anclajeP", e.target.value)} disabled={!editing} />
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Templador</label>
                                <input type="number" min={0} placeholder="0"
                                  className="h-8 w-20 rounded-lg border border-slate-300 bg-white px-2.5 text-sm dark:border-slate-600 dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-[#30518c]"
                                  value={f.templador ?? existing.templador ?? ""}
                                  onChange={(e) => setField(row.id, "templador", e.target.value)} disabled={!editing} />
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Clevi</label>
                                <input type="number" min={0} placeholder="0"
                                  className="h-8 w-20 rounded-lg border border-slate-300 bg-white px-2.5 text-sm dark:border-slate-600 dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-[#30518c]"
                                  value={f.clevi ?? existing.clevi ?? ""}
                                  onChange={(e) => setField(row.id, "clevi", e.target.value)} disabled={!editing} />
                              </div>
                            </div>
                            {clevi > 0 && (
                              <div className="mt-2 grid grid-cols-3 gap-2 rounded border border-violet-100 bg-white/70 px-2.5 py-1.5 text-xs text-slate-600 dark:border-violet-900/30 dark:bg-slate-900/50 dark:text-slate-300">
                                <span><span className="font-medium text-violet-600 dark:text-violet-400">Tarugos P:</span> {parseIntSafe(f.anclajeP ?? existing.anclajeP)} und.</span>
                                <span><span className="font-medium text-violet-600 dark:text-violet-400">Hebilla 1/2:</span> {clevi * 2} und.</span>
                                <span><span className="font-medium text-violet-600 dark:text-violet-400">Cinta Bandi 1/2:</span> {(clevi * 1.2).toFixed(1)} m</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </td>

                  {/* ── Acción (columna propia para los botones) ── */}
                  <td className="p-2.5 text-center align-middle">
                    {liquidado && !editing ? (
                      <button type="button"
                        onClick={() => setEditingRows((p) => ({ ...p, [row.id]: true }))}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300">
                        Editar
                      </button>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <button type="button"
                          disabled={saving || actas?.level === "error"}
                          onClick={() => guardar(row)}
                          className={`h-8 w-full rounded-lg px-3 text-sm font-semibold text-white transition disabled:opacity-50 ${liquidado ? "bg-emerald-600 hover:bg-emerald-700" : "bg-[#30518c] hover:opacity-90"}`}>
                          {saving ? "..." : liquidado ? "Actualizar" : "Liquidar"}
                        </button>
                        {editing && liquidado && (
                          <button type="button"
                            onClick={() => { setEditingRows((p) => { const cp = { ...p }; delete cp[row.id]; return cp; }); setForms((p) => { const cp = { ...p }; delete cp[row.id]; return cp; }); }}
                            className="h-8 w-full rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300">
                            Cancelar
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
