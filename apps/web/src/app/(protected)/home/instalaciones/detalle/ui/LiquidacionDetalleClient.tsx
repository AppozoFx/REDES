"use client";

import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import "dayjs/locale/es";
import Select from "react-select";
import { toast } from "sonner";

dayjs.extend(customParseFormat);
dayjs.locale("es");

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
  tipoCuadrilla?: string;
  orden?: {
    tipoCuadirlla?: string;
    tipoCuadrilla?: string;
    tipoOrden?: string;
  };
};

type EditMap = Record<
  string,
  {
    tipoOrden?: string;
    coordinadorCuadrilla?: string;
    observacion?: string;
  }
>;

type SelectOption = {
  value: string;
  label: string;
};

const CUADRILLA_SEGMENTOS = ["MOTO", "RESIDENCIAL"] as const;

const getCuadrillaSegmento = (row: Row): string => {
  const raw = `${row.cuadrillaNombre || ""} ${row.tipoCuadrilla || ""} ${row.orden?.tipoCuadirlla || row.orden?.tipoCuadrilla || ""}`
    .toUpperCase()
    .trim();
  if (raw.includes("MOTO")) return "MOTO";
  if (raw.includes("RESIDENCIAL")) return "RESIDENCIAL";
  return "";
};

export default function LiquidacionDetalleClient() {
  const [isDark, setIsDark] = useState(false);
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
    ordenTipoCuadrilla: "",
    ordenTipoOrden: "",
  });

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
    void cargar();
  }, [filtros.mes, filtros.dia]);

  const coordinadores = useMemo<SelectOption[]>(() => {
    const opts = Array.from(
      new Map(
        items
          .filter((x) => x.coordinadorUid)
          .map((x) => [
            x.coordinadorUid as string,
            {
              value: x.coordinadorUid as string,
              label: x.coordinadorNombre || x.coordinador || x.coordinadorUid || "",
            },
          ])
      ).values()
    );
    return opts.sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
  }, [items]);

  const ordenTipoCuadrillaOptions = useMemo(() => {
    return [...CUADRILLA_SEGMENTOS];
  }, []);

  const ordenTipoOrdenOptions = useMemo(() => {
    return Array.from(
      new Set(
        items
          .map((x) => String(x.orden?.tipoOrden || x.tipoOrden || "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  }, [items]);

  const filtered = useMemo(() => {
    const q = filtros.busqueda.toLowerCase().trim();
    const cuad = filtros.cuadrilla.toLowerCase().trim();
    const coord = filtros.coordinadorCuadrilla.toLowerCase().trim();
    const ordenTipoCuadrilla = filtros.ordenTipoCuadrilla.toLowerCase().trim();
    const ordenTipoOrden = filtros.ordenTipoOrden.toLowerCase().trim();
    return items.filter((x) => {
      const hay = `${x.codigoCliente || ""} ${x.orderId || ""} ${x.cliente || ""} ${x.cuadrillaNombre || ""} ${x.id || ""}`.toLowerCase();
      const okQ = q ? hay.includes(q) : true;
      const okCuad = cuad ? String(x.cuadrillaNombre || "").toLowerCase().includes(cuad) : true;
      const okCoord = coord ? String(x.coordinadorUid || "").toLowerCase().includes(coord) : true;
      const rowOrdenTipoCuadrilla = getCuadrillaSegmento(x).toLowerCase().trim();
      const rowOrdenTipoOrden = String(x.orden?.tipoOrden || x.tipoOrden || "").toLowerCase().trim();
      const okOrdenTipoCuadrilla = ordenTipoCuadrilla ? rowOrdenTipoCuadrilla === ordenTipoCuadrilla : true;
      const okOrdenTipoOrden = ordenTipoOrden ? rowOrdenTipoOrden === ordenTipoOrden : true;
      return okQ && okCuad && okCoord && okOrdenTipoCuadrilla && okOrdenTipoOrden;
    });
  }, [
    items,
    filtros.busqueda,
    filtros.cuadrilla,
    filtros.coordinadorCuadrilla,
    filtros.ordenTipoCuadrilla,
    filtros.ordenTipoOrden,
  ]);

  const pageData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filtered.length / pageSize)), [filtered.length]);
  const pendingChanges = Object.keys(ediciones).length;

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const selectPortalProps = {
    menuPortalTarget: typeof document !== "undefined" ? document.body : undefined,
    menuPosition: "fixed" as const,
  };

  const selectStyles = useMemo(() => {
    const base = {
      menuPortal: (style: any) => ({ ...style, zIndex: 9999 }),
    };

    if (!isDark) return base;

    return {
      ...base,
      control: (style: any, state: any) => ({
        ...style,
        backgroundColor: "#0f172a",
        borderColor: state.isFocused ? "#3b82f6" : "#334155",
        boxShadow: "none",
      }),
      menu: (style: any) => ({ ...style, backgroundColor: "#0f172a", color: "#e2e8f0" }),
      option: (style: any, state: any) => ({
        ...style,
        backgroundColor: state.isSelected ? "#1d4ed8" : state.isFocused ? "#1e293b" : "#0f172a",
        color: "#e2e8f0",
      }),
      input: (style: any) => ({ ...style, color: "#e2e8f0" }),
      placeholder: (style: any) => ({ ...style, color: "#94a3b8" }),
      singleValue: (style: any) => ({ ...style, color: "#e2e8f0" }),
    };
  }, [isDark]);

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
    <div className="space-y-4 text-slate-900 dark:text-slate-100">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-r from-[#f8fbff] via-[#eef5ff] to-[#f2f9ff] shadow-sm dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Liquidacion detalle</h1>
            <p className="max-w-2xl text-sm text-slate-600 dark:text-slate-300">
              Gestiona tipo de orden, coordinador y observacion de instalaciones desde una sola vista.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void cargar()}
              disabled={cargando}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {cargando ? "Actualizando..." : "Actualizar"}
            </button>
            <button
              type="button"
              onClick={guardarCambios}
              disabled={!pendingChanges || guardando}
              className="rounded-xl bg-[#30518c] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
            >
              {guardando ? "Guardando..." : `Guardar cambios${pendingChanges ? ` (${pendingChanges})` : ""}`}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Filtros</h2>
          <button
            type="button"
            onClick={() =>
              setFiltros((prev) => ({
                ...prev,
                dia: "",
                busqueda: "",
                cuadrilla: "",
                coordinadorCuadrilla: "",
                ordenTipoCuadrilla: "",
                ordenTipoOrden: "",
              }))
            }
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Limpiar filtros
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Mes</label>
            <input
              type="month"
              name="mes"
              value={filtros.mes}
              onChange={(e) => setFiltros((p) => ({ ...p, mes: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Dia</label>
            <input
              type="date"
              name="dia"
              value={filtros.dia}
              onChange={(e) => setFiltros((p) => ({ ...p, dia: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Cuadrilla</label>
            <input
              type="text"
              name="cuadrilla"
              value={filtros.cuadrilla}
              onChange={(e) => setFiltros((p) => ({ ...p, cuadrilla: e.target.value }))}
              placeholder="Buscar cuadrilla"
              autoComplete="off"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Coordinador</label>
            <Select
              classNamePrefix="coord-filter"
              options={coordinadores}
              value={
                filtros.coordinadorCuadrilla
                  ? coordinadores.find((c) => c.value === filtros.coordinadorCuadrilla) || null
                  : null
              }
              onChange={(sel) => setFiltros((p) => ({ ...p, coordinadorCuadrilla: sel?.value || "" }))}
              placeholder="Seleccionar coordinador"
              isClearable
              {...selectPortalProps}
              styles={selectStyles}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Codigo o cliente</label>
            <input
              type="text"
              name="busqueda"
              value={filtros.busqueda}
              onChange={(e) => setFiltros((p) => ({ ...p, busqueda: e.target.value }))}
              placeholder="Orden, codigo o cliente"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Segmento cuadrilla</label>
            <select
              name="ordenTipoCuadrilla"
              value={filtros.ordenTipoCuadrilla}
              onChange={(e) => setFiltros((p) => ({ ...p, ordenTipoCuadrilla: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
            >
              <option value="">Todos</option>
              {ordenTipoCuadrillaOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">orden.tipoOrden</label>
            <select
              name="ordenTipoOrden"
              value={filtros.ordenTipoOrden}
              onChange={(e) => setFiltros((p) => ({ ...p, ordenTipoOrden: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
            >
              <option value="">Todos</option>
              {ordenTipoOrdenOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="min-w-[1080px] w-full text-sm">
            <thead className="ui-thead sticky top-0 z-10">
              <tr className="text-left text-xs uppercase tracking-wide">
                <th className="w-32 px-3 py-3">Fecha</th>
                <th className="w-48 px-3 py-3">Cuadrilla</th>
                <th className="w-64 px-3 py-3">Coordinador</th>
                <th className="w-36 px-3 py-3">Codigo</th>
                <th className="w-72 px-3 py-3">Cliente</th>
                <th className="w-44 px-3 py-3">Tipo orden</th>
                <th className="min-w-[260px] px-3 py-3">Observacion</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500 dark:text-slate-400">
                    Cargando...
                  </td>
                </tr>
              ) : pageData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500 dark:text-slate-400">
                    No hay registros para los filtros seleccionados
                  </td>
                </tr>
              ) : (
                pageData.map((row) => {
                  const coordUid = row.coordinadorUid || "";
                  const coordLabel = row.coordinadorNombre || row.coordinador || "";
                  const hasPendingRow = Boolean(ediciones[row.id]);
                  return (
                    <tr
                      key={row.id}
                      className={`border-t border-slate-200 align-top dark:border-slate-700 ${
                        hasPendingRow
                          ? "bg-amber-50/60 dark:bg-amber-900/10"
                          : "odd:bg-white even:bg-slate-50/60 dark:odd:bg-slate-900 dark:even:bg-slate-800/30"
                      }`}
                    >
                      <td className="px-3 py-2.5 font-medium text-slate-700 dark:text-slate-300">{formatearFecha(row.fechaInstalacion)}</td>
                      <td className="px-3 py-2.5">{row.cuadrillaNombre || "-"}</td>
                      <td className="px-3 py-2.5">
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
                          {...selectPortalProps}
                          styles={selectStyles}
                        />
                      </td>
                      <td className="px-3 py-2.5 font-medium">{row.codigoCliente || "-"}</td>
                      <td className="px-3 py-2.5">{row.cliente || "-"}</td>
                      <td className="px-3 py-2.5">
                        <select
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          value={ediciones[row.id]?.tipoOrden ?? row.tipoOrden ?? ""}
                          onChange={(e) => setEdit(row.id, { tipoOrden: e.target.value })}
                        >
                          <option value="">-- Seleccionar --</option>
                          <option value="RESIDENCIAL">RESIDENCIAL</option>
                          <option value="CONDOMINIO">CONDOMINIO</option>
                        </select>
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="text"
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="text-sm text-slate-600 dark:text-slate-400">
          Mostrando <strong>{pageData.length > 0 ? (page - 1) * pageSize + 1 : 0}-{(page - 1) * pageSize + pageData.length}</strong> de <strong>{filtered.length}</strong>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Anterior
          </button>
          <span className="text-sm text-slate-700 dark:text-slate-300">
            Pagina <strong>{page}</strong> / {totalPages}
          </span>
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Siguiente
          </button>
        </div>
      </section>
    </div>
  );
}
