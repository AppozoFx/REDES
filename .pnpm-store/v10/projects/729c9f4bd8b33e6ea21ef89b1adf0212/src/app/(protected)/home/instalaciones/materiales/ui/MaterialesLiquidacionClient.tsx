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
  const [filtros, setFiltros] = useState({
    mes: dayjs().format("YYYY-MM"),
    dia: "",
    busqueda: "",
    coordinador: "",
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
    return items.filter((x) => {
      const hay = `${x.codigoCliente || ""} ${x.cliente || ""} ${x.cuadrillaNombre || ""}`.toLowerCase();
      const okQ = q ? hay.includes(q) : true;
      const okCoord = coord ? String(x.coordinador || "").toLowerCase().includes(coord) : true;
      return okQ && okCoord;
    });
  }, [items, filtros.busqueda, filtros.coordinador]);

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

  const isLiquidado = (row: Row) => {
    const liq = row.materialesLiquidacion || {};
    const acta = String(liq.acta || "").trim();
    if (acta) return true;
    return false;
  };

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

    const payload = {
      id: row.id,
      acta,
      precon,
      bobinaMetros,
      anclajeP: parseIntSafe(f.anclajeP ?? existing.anclajeP),
      templador: parseIntSafe(f.templador ?? existing.templador),
      clevi: parseIntSafe(f.clevi ?? existing.clevi),
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
      toast.error(e?.message || "No se pudo liquidar");
    } finally {
      setGuardandoId(null);
    }
  };

  const [sortKey, setSortKey] = useState<"estado" | "fecha">("fecha");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

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
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="grid gap-3 md:grid-cols-4 flex-1 min-w-[520px]">
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700">Mes</label>
          <input
            type="month"
            name="mes"
            value={filtros.mes}
            onChange={(e) => setFiltros((p) => ({ ...p, mes: e.target.value }))}
            className="border px-2 py-1 rounded text-sm"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700">Dia</label>
          <input
            type="date"
            name="dia"
            value={filtros.dia}
            onChange={(e) => setFiltros((p) => ({ ...p, dia: e.target.value }))}
            className="border px-2 py-1 rounded text-sm"
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
            className="border px-2 py-1 rounded text-sm"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700">Coordinador</label>
          <select
            name="coordinador"
            value={filtros.coordinador}
            onChange={(e) => setFiltros((p) => ({ ...p, coordinador: e.target.value }))}
            className="border px-2 py-1 rounded text-sm"
          >
            <option value="">Todos</option>
            {coordinadores.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        </div>
        <button
          onClick={exportXlsx}
          className="px-3 py-2 rounded text-sm bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          Exportar XLSX
        </button>
      </div>

      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr className="text-center text-gray-700 font-semibold">
              <th
                className="p-2 border w-28 cursor-pointer select-none"
                onClick={() => toggleSort("estado")}
                title="Ordenar por estado"
              >
                Estado {sortKey === "estado" ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
              </th>
              <th
                className="p-2 border w-28 cursor-pointer select-none"
                onClick={() => toggleSort("fecha")}
                title="Ordenar por fecha"
              >
                Fecha {sortKey === "fecha" ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
              </th>
              <th className="p-2 border w-44">Cuadrilla</th>
              <th className="p-2 border w-28">Codigo</th>
              <th className="p-2 border w-56">Cliente</th>
              <th className="p-2 border w-32">SN ONT</th>
              <th className="p-2 border w-56">SN MESH</th>
              <th className="p-2 border w-56">SN BOX</th>
              <th className="p-2 border w-40">SN FONO</th>
              <th className="p-2 border min-w-[560px]">Liquidacion</th>
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
              sorted.map((row) => {
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
                  <tr key={row.id} className="hover:bg-gray-50 align-top">
                    <td className="border p-2 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs border ${liquidado ? "bg-green-100 text-green-800 border-green-300" : "bg-amber-100 text-amber-800 border-amber-300"}`}>
                        {liquidado ? "Liquidado" : "Pendiente"}
                      </span>
                    </td>
                    <td className="border p-2 text-center">{formatearFecha(row.fechaInstalacion)}</td>
                    <td className="border p-2 text-center">{row.cuadrillaNombre || "-"}</td>
                    <td className="border p-2 text-center">{row.codigoCliente || "-"}</td>
                    <td className="border p-2">{row.cliente || "-"}</td>
                    <td className="border p-2 text-center">{row.snONT || "-"}</td>
                    <td className="border p-2">
                      {Array.isArray(row.snMESH) && row.snMESH.filter(Boolean).length > 0 ? (
                        <div className="flex flex-wrap gap-1 justify-center">
                          {row.snMESH.filter(Boolean).map((sn, i) => (
                            <span key={i} className="px-1.5 py-0.5 rounded-full text-xs bg-green-100 text-green-800 border">
                              {sn}
                            </span>
                          ))}
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="border p-2">
                      {Array.isArray(row.snBOX) && row.snBOX.filter(Boolean).length > 0 ? (
                        <div className="flex flex-wrap gap-1 justify-center">
                          {row.snBOX.filter(Boolean).map((sn, i) => (
                            <span key={i} className="px-1.5 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-800 border">
                              {sn}
                            </span>
                          ))}
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="border p-2 text-center">{row.snFONO || "-"}</td>
                    <td className="border p-2">
                      <div
                        className={`rounded-md p-2 ${liquidado ? "border border-green-300 bg-green-50" : "border border-red-300 bg-red-50"}`}
                      >
                        <div className="grid gap-2 md:grid-cols-6">
                        <input
                          type="text"
                          placeholder="ACTA (scan)"
                          className="border rounded px-2 py-1 md:col-span-2"
                          value={formatActa(f.acta ?? existing.acta ?? "")}
                          onChange={(e) => setField(row.id, "acta", formatActa(e.target.value))}
                          disabled={!editing}
                        />

                        <select
                          className="border rounded px-2 py-1"
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
                          className="border rounded px-2 py-1"
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
                              className="border rounded px-2 py-1"
                              value={f.anclajeP ?? existing.anclajeP ?? ""}
                              onChange={(e) => setField(row.id, "anclajeP", e.target.value)}
                              disabled={!editing}
                            />
                            <input
                              type="number"
                              min={0}
                              placeholder="TEMPLADOR"
                              className="border rounded px-2 py-1"
                              value={f.templador ?? existing.templador ?? ""}
                              onChange={(e) => setField(row.id, "templador", e.target.value)}
                              disabled={!editing}
                            />
                            <input
                              type="number"
                              min={0}
                              placeholder="CLEVI"
                              className="border rounded px-2 py-1"
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
                          className={`px-3 py-1 rounded text-white disabled:opacity-60 ${
                            liquidado ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"
                          }`}
                          disabled={saving}
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
                            className="px-3 py-1 rounded border"
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
    </div>
  );
}
