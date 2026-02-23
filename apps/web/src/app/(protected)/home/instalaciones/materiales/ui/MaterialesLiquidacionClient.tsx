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

const parseIntSafe = (v: unknown) => {
  const n = parseInt(String(v), 10);
  return Number.isNaN(n) ? 0 : n;
};

const parseFloatSafe = (v: unknown) => {
  const n = parseFloat(String(v));
  return Number.isNaN(n) ? 0 : n;
};

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
    acta?: string;
    precon?: string;
    bobinaMetros?: number;
    anclajeP?: number;
    templador?: number;
    clevi?: number;
  };
};

type FormState = {
  acta?: string;
  precon?: string;
  bobinaMetros?: string;
  anclajeP?: string;
  templador?: string;
  clevi?: string;
};

export default function MaterialesLiquidacionClient() {
  const [items, setItems] = useState<Row[]>([]);
  const [cargando, setCargando] = useState(false);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [editingRows, setEditingRows] = useState<Record<string, boolean>>({});
  const [actaStatus, setActaStatus] = useState<
    Record<string, { value: string; level: "ok" | "warn" | "error"; message: string }>
  >({});
  const [filtros, setFiltros] = useState({
    mes: dayjs().format("YYYY-MM"),
    dia: "",
    busqueda: "",
    coordinador: "",
    cuadrilla: "",
    estado: "",
  });
  const [forms, setForms] = useState<Record<string, FormState>>({});

  const cargar = async () => {
    setCargando(true);
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
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, [filtros.mes, filtros.dia]);

  const list = useMemo(() => {
    const q = String(filtros.busqueda || "").toLowerCase().trim();
    const coord = String(filtros.coordinador || "").toLowerCase().trim();
    const cuadrilla = String(filtros.cuadrilla || "").toLowerCase().trim();
    const estado = String(filtros.estado || "").toLowerCase().trim();
    return items.filter((x) => {
      const hay = `${x.codigoCliente || ""} ${x.cliente || ""} ${x.cuadrillaNombre || ""}`.toLowerCase();
      const okQ = q ? hay.includes(q) : true;
      const okCoord = coord ? String(x.coordinador || "").toLowerCase().includes(coord) : true;
      const okCuadrilla = cuadrilla ? String(x.cuadrillaNombre || "").toLowerCase().includes(cuadrilla) : true;
      const liquidado = isLiquidado(x);
      const okEstado = estado ? (estado === "liquidado" ? liquidado : !liquidado) : true;
      return okQ && okCoord && okCuadrilla && okEstado;
    });
  }, [items, filtros.busqueda, filtros.coordinador, filtros.cuadrilla, filtros.estado]);

  const coordinadores = useMemo(() => {
    return Array.from(new Set(items.map((x) => String(x.coordinador || "").trim()).filter(Boolean))).sort();
  }, [items]);


  const setField = (id: string, key: keyof FormState, value: string) => {
    setForms((prev) => ({
      ...prev,
      [id]: {
        acta: "",
        precon: "",
        bobinaMetros: "",
        anclajeP: "",
        templador: "",
        clevi: "",
        ...prev[id],
        [key]: value,
      },
    }));
  };

  const validarActa = async (rowId: string, raw: string) => {
    const code = formatActa(raw || "");
    if (!code) {
      setActaStatus((p) => {
        const cp = { ...p };
        delete cp[rowId];
        return cp;
      });
      return;
    }
    const prev = actaStatus[rowId];
    if (prev && prev.value === code) return;
    try {
      const res = await fetch(`/api/actas/validate?code=${encodeURIComponent(code)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "ERROR");
      const estado = String(data?.estado || "").toUpperCase();
      const msg =
        estado === "NO_RECEPCIONADA"
          ? "Acta no recepcionada"
          : "Acta válida";
      const level = estado === "NO_RECEPCIONADA" ? "warn" : "ok";
      setActaStatus((p) => ({
        ...p,
        [rowId]: { value: code, level, message: msg },
      }));
    } catch (e: any) {
      const msg = String(e?.message || "ACTA_INVALIDA");
      const friendly =
        msg.includes("ACTA_NOT_FOUND") ? "Acta no registrada en recepción" :
        msg.includes("ACTA_YA_LIQUIDADA") ? "Acta ya liquidada" :
        "Acta inválida";
      setActaStatus((p) => ({
        ...p,
        [rowId]: { value: code, level: "error", message: friendly },
      }));
    }
  };

  function isLiquidado(row: Row) {
    const liq = row.materialesLiquidacion || {};
    const acta = String(liq.acta || "").trim();
    if (acta) return true;
    return false;
  }

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
      const precons = ["PRECON_50", "PRECON_100", "PRECON_150", "PRECON_200"];
      const hit = precons.find((p) => findUnd(p) > 0);
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
    if (!acta) return toast.error("Ingresa ACTA");
    if (precon && bobinaMetros > 0) return toast.error("Elige PRECON o BOBINA, no ambos");
    if (!precon && bobinaMetros <= 0) return toast.error("Ingresa metros de BOBINA o elige PRECON");

    const needsAuto =
      actaStatus[row.id]?.value === formatActa(acta) &&
      actaStatus[row.id]?.level === "warn";
    if (needsAuto) {
      const clienteTxt = row.cliente || row.codigoCliente || row.id;
      const ok = window.confirm(
        `Acta ${formatActa(acta)} no recepcionada. ¿Deseas recepcionarla y liquidarla ahora?\nCliente: ${clienteTxt}`
      );
      if (!ok) return;
    }

    const payload = {
      id: row.id,
      acta,
      precon,
      bobinaMetros,
      anclajeP: parseIntSafe(f.anclajeP ?? existing.anclajeP),
      templador: parseIntSafe(f.templador ?? existing.templador),
      clevi: parseIntSafe(f.clevi ?? existing.clevi),
      autoRecepcionar: needsAuto,
    };

    const liquidado = isLiquidado(row);
    if (liquidado) {
      const changed =
        acta !== existing.acta ||
        precon !== existing.precon ||
        bobinaMetros !== Number(existing.bobinaMetros || 0) ||
        parseIntSafe(payload.anclajeP) !== Number(existing.anclajeP || 0) ||
        parseIntSafe(payload.templador) !== Number(existing.templador || 0) ||
        parseIntSafe(payload.clevi) !== Number(existing.clevi || 0);
      if (!changed) return toast.message("Sin cambios para actualizar");
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
      toast.success("Liquidacion de materiales registrada");
      await cargar();
      setEditingRows((p) => {
        const cp = { ...p };
        delete cp[row.id];
        return cp;
      });
      setForms((prev) => {
        const cp = { ...prev };
        delete cp[row.id];
        return cp;
      });
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg.includes("ACTA_YA_LIQUIDADA")) {
        toast.error("Esta acta ya fue liquidada para otro cliente");
      } else if (msg.includes("ACTA_NOT_FOUND")) {
        toast.error("Acta no registrada en recepción");
      } else if (msg.includes("ACTA_NO_RECEPCIONADA")) {
        toast.error("Acta no recepcionada");
      } else {
        toast.error(e?.message || "No se pudo liquidar");
      }
    } finally {
      setGuardandoId(null);
    }
  };

  const [sortKey, setSortKey] = useState<"estado" | "fecha">("fecha");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const fieldClass = "rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900";
  const smallFieldClass = "border border-slate-300 rounded px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900";

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const out = [...list];
    out.sort((a, b) => {
      if (sortKey === "estado") {
        const aL = isLiquidado(a) ? 1 : 0;
        const bL = isLiquidado(b) ? 1 : 0;
        if (aL !== bL) return (aL - bL) * dir;
      }
      const ta = dayjs(a.fechaInstalacion).valueOf() || 0;
      const tb = dayjs(b.fechaInstalacion).valueOf() || 0;
      if (ta !== tb) return (ta - tb) * dir;
      return String(a.codigoCliente || "").localeCompare(String(b.codigoCliente || ""));
    });
    return out;
  }, [list, sortKey, sortDir]);

  const toggleSort = (key: "estado" | "fecha") => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const resumen = useMemo(() => {
    const total = sorted.length;
    const liquidadas = sorted.filter((x) => isLiquidado(x)).length;
    const pendientes = total - liquidadas;
    return { total, liquidadas, pendientes };
  }, [sorted]);

  const exportXlsx = () => {
    const headers = ["Estado", "Fecha", "Cuadrilla", "CodigoCliente", "Cliente", "ACTA"];
    const rows = sorted.map((r) => {
      const estado = isLiquidado(r) ? "Liquidado" : "Pendiente";
      const fecha = formatearFecha(r.fechaInstalacion);
      const acta = getExisting(r).acta || "";
      return [estado, fecha, r.cuadrillaNombre || "", r.codigoCliente || "", r.cliente || "", acta];
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Materiales");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([wbout], { type: "application/octet-stream" }), `materiales_${dayjs().format("YYYYMMDD_HHmmss")}.xlsx`);
  };

  return (
    <div className="w-full space-y-4 p-3 md:p-4">
      <div className="sticky top-0 z-20 space-y-3">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-200 p-4 dark:border-slate-700">
            <div className="flex items-end justify-between gap-3 flex-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
              <div className="grid gap-3 md:grid-cols-6 flex-1 min-w-[520px]">
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700">Mes</label>
          <input
            type="month"
            name="mes"
            value={filtros.mes}
            onChange={(e) => setFiltros((p) => ({ ...p, mes: e.target.value }))}
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700">Dia</label>
          <input
            type="date"
            name="dia"
            value={filtros.dia}
            onChange={(e) => setFiltros((p) => ({ ...p, dia: e.target.value }))}
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700">Codigo o Cliente</label>
          <input
            type="text"
            name="busqueda"
            value={filtros.busqueda}
            onChange={(e) => setFiltros((p) => ({ ...p, busqueda: e.target.value }))}
            placeholder="Buscar..."
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700">Coordinador</label>
          <select
            name="coordinador"
            value={filtros.coordinador}
            onChange={(e) => setFiltros((p) => ({ ...p, coordinador: e.target.value }))}
            className={fieldClass}
          >
            <option value="">Todos</option>
            {coordinadores.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700">Cuadrilla</label>
          <input
            type="text"
            name="cuadrilla"
            value={filtros.cuadrilla}
            onChange={(e) => setFiltros((p) => ({ ...p, cuadrilla: e.target.value }))}
            placeholder="Buscar cuadrilla"
            autoComplete="off"
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700">Estado</label>
          <select
            name="estado"
            value={filtros.estado}
            onChange={(e) => setFiltros((p) => ({ ...p, estado: e.target.value }))}
            className={fieldClass}
          >
            <option value="">Todos</option>
            <option value="liquidado">Liquidado</option>
            <option value="pendiente">Pendiente</option>
          </select>
        </div>
              </div>
              <button
                onClick={exportXlsx}
                className="rounded-xl bg-[#30518c] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
              >
                Exportar XLSX
              </button>
            </div>
          </div>
          <div className="p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
                <p className="text-xs">Total registros</p>
                <p className="text-xl font-semibold">{resumen.total}</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">
                <p className="text-xs">Liquidados</p>
                <p className="text-xl font-semibold">{resumen.liquidadas}</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700">
                <p className="text-xs">Pendientes</p>
                <p className="text-xl font-semibold">{resumen.pendientes}</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <div className="overflow-x-auto">
        <table className="min-w-[1450px] w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100">
            <tr className="text-center font-semibold">
              <th
                className="p-2 border-b border-slate-200 w-28 cursor-pointer select-none dark:border-slate-700"
                onClick={() => toggleSort("estado")}
                title="Ordenar por estado"
              >
                Estado {sortKey === "estado" ? (sortDir === "asc" ? "^" : "v") : "<>"}
              </th>
              <th
                className="p-2 border-b border-slate-200 w-28 cursor-pointer select-none dark:border-slate-700"
                onClick={() => toggleSort("fecha")}
                title="Ordenar por fecha"
              >
                Fecha {sortKey === "fecha" ? (sortDir === "asc" ? "^" : "v") : "<>"}
              </th>
              <th className="p-2 border-b border-slate-200 w-44 dark:border-slate-700">Cuadrilla</th>
              <th className="p-2 border-b border-slate-200 w-28 dark:border-slate-700">Codigo</th>
              <th className="p-2 border-b border-slate-200 w-56 dark:border-slate-700">Cliente</th>
              <th className="p-2 border-b border-slate-200 w-32 dark:border-slate-700">SN ONT</th>
              <th className="p-2 border-b border-slate-200 w-56 dark:border-slate-700">SN MESH</th>
              <th className="p-2 border-b border-slate-200 w-56 dark:border-slate-700">SN BOX</th>
              <th className="p-2 border-b border-slate-200 w-40 dark:border-slate-700">SN FONO</th>
              <th className="p-2 border-b border-slate-200 min-w-[560px] dark:border-slate-700">Liquidacion</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr>
                <td colSpan={10} className="p-6 text-center text-gray-500">
                  Cargando...
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-6 text-center text-gray-500">
                  No hay registros
                </td>
              </tr>
            ) : (
              sorted.map((row, idx) => {
                const f = forms[row.id] || {};
                const existing = getExisting(row);
                const residencial = esResidencial(row);
                const clevi = parseIntSafe(f.clevi ?? existing.clevi);
                const hebilla = clevi * 2;
                const cinta = clevi * 1.2;
                const saving = guardandoId === row.id;
                const liquidado = isLiquidado(row);
                const editing = !!editingRows[row.id] || !liquidado;
                const precon = String(f.precon ?? existing.precon ?? "");
                const bobinaDisabled = !!precon;
                const preconDisabled = parseFloatSafe(f.bobinaMetros ?? existing.bobinaMetros ?? 0) > 0;

                return (
                  <tr key={row.id} className={`align-top hover:bg-slate-50/80 dark:hover:bg-slate-800/60 ${idx % 2 ? "bg-slate-50/50 dark:bg-slate-800/40" : "bg-white dark:bg-slate-900"}`}>
                    <td className="border-b border-slate-100 p-2 text-center dark:border-slate-800">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs border ${liquidado ? "bg-green-100 text-green-800 border-green-300" : "bg-amber-100 text-amber-800 border-amber-300"}`}>
                        {liquidado ? "Liquidado" : "Pendiente"}
                      </span>
                    </td>
                    <td className="border-b border-slate-100 p-2 text-center dark:border-slate-800">{formatearFecha(row.fechaInstalacion)}</td>
                    <td className="border-b border-slate-100 p-2 text-center dark:border-slate-800">{row.cuadrillaNombre || "-"}</td>
                    <td className="border-b border-slate-100 p-2 text-center dark:border-slate-800">{row.codigoCliente || "-"}</td>
                    <td className="border-b border-slate-100 p-2 dark:border-slate-800">{row.cliente || "-"}</td>
                    <td className="border-b border-slate-100 p-2 text-center dark:border-slate-800">{row.snONT || "-"}</td>
                    <td className="border-b border-slate-100 p-2 dark:border-slate-800">
                      {Array.isArray(row.snMESH) && row.snMESH.filter(Boolean).length > 0 ? (
                        <div className="flex flex-wrap gap-1 justify-center">
                          {row.snMESH.filter(Boolean).map((sn: string, i: number) => (
                            <span key={i} className="px-1.5 py-0.5 rounded-full text-xs bg-green-100 text-green-800 border">
                              {sn}
                            </span>
                          ))}
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="border-b border-slate-100 p-2 dark:border-slate-800">
                      {Array.isArray(row.snBOX) && row.snBOX.filter(Boolean).length > 0 ? (
                        <div className="flex flex-wrap gap-1 justify-center">
                          {row.snBOX.filter(Boolean).map((sn: string, i: number) => (
                            <span key={i} className="px-1.5 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-800 border">
                              {sn}
                            </span>
                          ))}
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="border-b border-slate-100 p-2 text-center dark:border-slate-800">{row.snFONO || "-"}</td>
                    <td className="border-b border-slate-100 p-2 dark:border-slate-800">
                      <div
                        className={`rounded-md p-2 ${liquidado ? "border border-green-300 bg-green-50" : "border border-red-300 bg-red-50"}`}
                      >
                        <div className="grid gap-2 md:grid-cols-6">
                        <div className="md:col-span-2 flex flex-col">
                          <input
                            type="text"
                            placeholder="ACTA (scan)"
                            className={smallFieldClass}
                            value={formatActa(f.acta ?? existing.acta ?? "")}
                            onChange={(e) => setField(row.id, "acta", formatActa(e.target.value))}
                            onBlur={() => validarActa(row.id, String(f.acta ?? existing.acta ?? ""))}
                            disabled={!editing}
                          />
                          {actaStatus[row.id] && (
                            <div
                              className={`mt-1 text-xs ${
                                actaStatus[row.id].level === "ok"
                                  ? "text-emerald-700"
                                  : actaStatus[row.id].level === "warn"
                                  ? "text-amber-600"
                                  : "text-red-600"
                              }`}
                            >
                              {actaStatus[row.id].message}
                            </div>
                          )}
                        </div>

                        <select
                          className={smallFieldClass}
                          value={f.precon ?? existing.precon ?? ""}
                          onChange={(e) => setField(row.id, "precon", e.target.value)}
                          disabled={!editing || preconDisabled}
                        >
                          <option value="">PRECON</option>
                          <option value="PRECON_50">PRECON_50</option>
                          <option value="PRECON_100">PRECON_100</option>
                          <option value="PRECON_150">PRECON_150</option>
                          <option value="PRECON_200">PRECON_200</option>
                        </select>

                        <input
                          type="number"
                          min={0}
                          step="0.1"
                          placeholder="BOBINA (m)"
                          className={smallFieldClass}
                          value={f.bobinaMetros ?? existing.bobinaMetros ?? ""}
                          onChange={(e) => setField(row.id, "bobinaMetros", e.target.value)}
                          disabled={!editing || bobinaDisabled}
                        />

                        {residencial ? (
                          <>
                            <input
                              type="number"
                              min={0}
                              placeholder="ANCLAJE_P"
                              className={smallFieldClass}
                              value={f.anclajeP ?? existing.anclajeP ?? ""}
                              onChange={(e) => setField(row.id, "anclajeP", e.target.value)}
                              disabled={!editing}
                            />
                            <input
                              type="number"
                              min={0}
                              placeholder="TEMPLADOR"
                              className={smallFieldClass}
                              value={f.templador ?? existing.templador ?? ""}
                              onChange={(e) => setField(row.id, "templador", e.target.value)}
                              disabled={!editing}
                            />
                            <input
                              type="number"
                              min={0}
                              placeholder="CLEVI"
                              className={smallFieldClass}
                              value={f.clevi ?? existing.clevi ?? ""}
                              onChange={(e) => setField(row.id, "clevi", e.target.value)}
                              disabled={!editing}
                            />
                            <div className="text-xs text-gray-600 md:col-span-3">
                              TARUGOS_P: {parseIntSafe(f.anclajeP)} | HEBILLA_1_2: {hebilla} | CINTA_BANDI_1_2:{" "}
                              {cinta.toFixed(2)} m
                            </div>
                          </>
                        ) : (
                          <div className="md:col-span-3 text-xs text-gray-500">Residencial: no</div>
                        )}
                      </div>

                      <div className="mt-2 flex items-center justify-between">
                        {liquidado && !editing ? (
                          <div className="text-xs text-gray-600">ACTA: {existing.acta || "-"}</div>
                        ) : (
                          <div className="text-xs text-gray-500">Completa los campos para liquidar.</div>
                        )}
                        <button
                          className={`rounded-lg px-3 py-1 text-white disabled:opacity-60 ${
                            liquidado ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"
                          }`}
                          disabled={saving || (actaStatus[row.id]?.level === "error")}
                          onClick={() => {
                            if (liquidado && !editing) {
                              setEditingRows((p) => ({ ...p, [row.id]: true }));
                              return;
                            }
                            guardar(row);
                          }}
                        >
                          {saving ? "Guardando..." : liquidado ? "Actualizar" : "Liquidar"}
                        </button>
                        {editing && liquidado ? (
                          <button
                            className="rounded-lg border border-slate-300 px-3 py-1 dark:border-slate-600"
                            onClick={() => {
                              setEditingRows((p) => {
                                const cp = { ...p };
                                delete cp[row.id];
                                return cp;
                              });
                              setForms((p) => {
                                const cp = { ...p };
                                delete cp[row.id];
                                return cp;
                              });
                            }}
                          >
                            Cancelar
                          </button>
                        ) : null}
                      </div>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>
      </section>
    </div>
  );
}




