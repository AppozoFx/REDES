"use client";

import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import "dayjs/locale/es";
import Select from "react-select";
import { toast } from "sonner";

dayjs.extend(customParseFormat);
dayjs.locale("es");

const parseIntSafe = (v: unknown) => {
  const n = parseInt(String(v), 10);
  return Number.isNaN(n) ? 0 : n;
};

const formatearFecha = (f: any) => (f ? dayjs(f).format("DD/MM/YYYY") : "-");

type Row = {
  id: string;
  orderId?: string;
  codigoCliente: string;
  cliente: string;
  cuadrillaNombre: string;
  fechaInstalacion: string;
  tipoOrden?: string;
  observacion?: string;
  coordinadorUid?: string;
  coordinador?: string;
  coordinadorNombre?: string;
};

type EditMap = Record<
  string,
  {
    tipoOrden?: string;
    coordinadorCuadrilla?: string;
    observacion?: string;
  }
>;

export default function LiquidacionDetalleClient() {
  const [items, setItems] = useState<Row[]>([]);
  const [cargando, setCargando] = useState(false);
  const [ediciones, setEdiciones] = useState<EditMap>({});
  const [guardando, setGuardando] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const [filtros, setFiltros] = useState({
    mes: dayjs().format("YYYY-MM"),
    dia: "",
    busqueda: "",
    cuadrilla: "",
    coordinadorCuadrilla: "",
  });

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
      setPage(1);
    } catch (e: any) {
      toast.error(e?.message || "Error cargando instalaciones");
    } finally {
      if (!silent) setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, [filtros.mes, filtros.dia]);

  const coordinadores = useMemo(() => {
    const opts = Array.from(
      new Map(
        items
          .filter((x) => x.coordinadorUid)
          .map((x) => [
            x.coordinadorUid as string,
            { value: x.coordinadorUid as string, label: x.coordinadorNombre || x.coordinador || x.coordinadorUid || "" },
          ])
      ).values()
    );
    return opts.sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
  }, [items]);

  const filtered = useMemo(() => {
    const q = filtros.busqueda.toLowerCase().trim();
    const cuad = filtros.cuadrilla.toLowerCase().trim();
    const coord = filtros.coordinadorCuadrilla.toLowerCase().trim();
    return items.filter((x) => {
      const hay = `${x.codigoCliente || ""} ${x.orderId || ""} ${x.cliente || ""} ${x.cuadrillaNombre || ""} ${x.id || ""}`.toLowerCase();
      const okQ = q ? hay.includes(q) : true;
      const okCuad = cuad ? String(x.cuadrillaNombre || "").toLowerCase().includes(cuad) : true;
      const okCoord = coord ? String(x.coordinadorUid || "").toLowerCase().includes(coord) : true;
      return okQ && okCuad && okCoord;
    });
  }, [items, filtros.busqueda, filtros.cuadrilla, filtros.coordinadorCuadrilla]);

  const pageData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (page > totalPages) setPage(totalPages);
  }, [filtered.length, page]);

  const setEdit = (id: string, patch: Partial<EditMap[string]>) => {
    setEdiciones((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const guardarCambios = async () => {
    const entries = Object.entries(ediciones);
    if (!entries.length) return toast.message("Sin cambios");
    try {
      setGuardando(true);
      const results = await Promise.allSettled(
        entries.map(async ([id, ch]) => {
          const payload = {
            id,
            tipoOrden: ch.tipoOrden,
            coordinadorCuadrilla: ch.coordinadorCuadrilla,
            observacion: ch.observacion,
          };
          const res = await fetch("/api/instalaciones/detalle/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (!res.ok || !data?.ok) throw new Error(data?.error || "ERROR");
          return { id, ch };
        })
      );
      const okRows = results
        .filter((r): r is PromiseFulfilledResult<{ id: string; ch: EditMap[string] }> => r.status === "fulfilled")
        .map((r) => r.value);
      const failCount = results.length - okRows.length;

      if (okRows.length > 0) {
        const okById = new Map(okRows.map((r) => [r.id, r.ch]));
        setItems((prev) =>
          prev.map((it) => {
            const ch = okById.get(it.id);
            if (!ch) return it;
            return {
              ...it,
              tipoOrden: ch.tipoOrden ?? it.tipoOrden,
              coordinadorUid: ch.coordinadorCuadrilla ?? it.coordinadorUid,
              observacion: ch.observacion ?? it.observacion,
            };
          })
        );
      }

      setEdiciones((prev) => {
        const next = { ...prev };
        for (const r of okRows) delete next[r.id];
        return next;
      });

      if (okRows.length > 0 && failCount === 0) {
        toast.success(`Cambios guardados (${okRows.length})`);
      } else if (okRows.length > 0 && failCount > 0) {
        toast.error(`Se guardaron ${okRows.length}, fallaron ${failCount}. Revisa y reintenta.`);
      } else {
        toast.error("No se pudo guardar ningun cambio");
      }

      void cargar(true);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-3 md:grid-cols-5 flex-1 min-w-[520px]">
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700">Mes</label>
            <input
              type="month"
              name="mes"
              value={filtros.mes}
              onChange={(e) => setFiltros((p) => ({ ...p, mes: e.target.value }))}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700">Dia</label>
            <input
              type="date"
              name="dia"
              value={filtros.dia}
              onChange={(e) => setFiltros((p) => ({ ...p, dia: e.target.value }))}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
            />
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
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700">Coordinador</label>
            <Select
              classNamePrefix="coord-filter"
              options={coordinadores}
              value={
                filtros.coordinadorCuadrilla
                  ? coordinadores.find((c) => c.value === filtros.coordinadorCuadrilla) || null
                  : null
              }
              onChange={(sel) =>
                setFiltros((p) => ({ ...p, coordinadorCuadrilla: sel?.value || "" }))
              }
              placeholder="Seleccionar coordinador"
              isClearable
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700">Codigo o Cliente</label>
            <input
              type="text"
              name="busqueda"
              value={filtros.busqueda}
              onChange={(e) => setFiltros((p) => ({ ...p, busqueda: e.target.value }))}
              placeholder="Orden, codigo o cliente"
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
            />
          </div>
        </div>
        <button
          onClick={guardarCambios}
          disabled={!Object.keys(ediciones).length || guardando}
          className="px-3 py-2 rounded text-sm bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
        >
          {guardando ? "Guardando..." : `Guardar cambios${Object.keys(ediciones).length ? ` (${Object.keys(ediciones).length})` : ""}`}
        </button>
      </div>

      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr className="text-center text-gray-700 font-semibold">
              <th className="p-2 border w-32">Fecha</th>
              <th className="p-2 border w-44">Cuadrilla</th>
              <th className="p-2 border w-56">Coordinador</th>
              <th className="p-2 border w-28">Codigo</th>
              <th className="p-2 border w-56">Cliente</th>
              <th className="p-2 border w-36">Tipo Orden</th>
              <th className="p-2 border min-w-[220px]">Observacion</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-gray-500">
                  Cargando...
                </td>
              </tr>
            ) : pageData.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-gray-500">
                  No hay registros
                </td>
              </tr>
            ) : (
              pageData.map((row) => {
                const coordUid = row.coordinadorUid || "";
                const coordLabel = row.coordinadorNombre || row.coordinador || "";
                return (
                  <tr key={row.id} className="hover:bg-gray-50 text-center">
                    <td className="border p-2">{formatearFecha(row.fechaInstalacion)}</td>
                    <td className="border p-2">{row.cuadrillaNombre || "-"}</td>
                  <td className="border p-2 min-w-[220px]">
                    <Select
                      classNamePrefix="coord"
                      value={
                          (ediciones[row.id]?.coordinadorCuadrilla || coordUid)
                            ? {
                                value: ediciones[row.id]?.coordinadorCuadrilla || coordUid,
                                label:
                                  coordinadores.find(
                                    (c) => c.value === (ediciones[row.id]?.coordinadorCuadrilla || coordUid)
                                  )?.label || coordLabel || coordUid,
                              }
                            : null
                      }
                        onChange={(sel) => setEdit(row.id, { coordinadorCuadrilla: sel?.value || "" })}
                      options={coordinadores}
                      placeholder="Seleccionar coordinador"
                      isClearable
                    />
                    </td>
                    <td className="border p-2">{row.codigoCliente || "-"}</td>
                    <td className="border p-2">{row.cliente || "-"}</td>
                    <td className="border p-2">
                      <select
                        className="border rounded px-2 py-1 text-sm"
                        value={ediciones[row.id]?.tipoOrden ?? row.tipoOrden ?? ""}
                        onChange={(e) => setEdit(row.id, { tipoOrden: e.target.value })}
                      >
                        <option value="">-- Seleccionar --</option>
                        <option value="RESIDENCIAL">RESIDENCIAL</option>
                        <option value="CONDOMINIO">CONDOMINIO</option>
                      </select>
                    </td>
                    <td className="border p-2">
                      <input
                        type="text"
                        className="w-full px-2 py-1 border rounded"
                        value={ediciones[row.id]?.observacion ?? row.observacion ?? ""}
                        onChange={(e) => setEdit(row.id, { observacion: e.target.value })}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="text-sm text-gray-600">
          Mostrando{" "}
          <strong>
            {pageData.length > 0 ? (page - 1) * pageSize + 1 : 0}-{(page - 1) * pageSize + pageData.length}
          </strong>{" "}
          de <strong>{filtered.length}</strong>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1 rounded border bg-white disabled:opacity-40"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            {"<"}
          </button>
          <span className="text-sm">
            Pagina <strong>{page}</strong> / {Math.max(1, Math.ceil(filtered.length / pageSize))}
          </span>
          <button
            className="px-3 py-1 rounded border bg-white disabled:opacity-40"
            onClick={() => setPage((p) => Math.min(Math.max(1, Math.ceil(filtered.length / pageSize)), p + 1))}
            disabled={page >= Math.max(1, Math.ceil(filtered.length / pageSize))}
          >
            {">"}
          </button>
        </div>
      </div>
    </div>
  );
}

