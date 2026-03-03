"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Row = {
  uid: string;
  nombre: string;
  online: boolean;
  lastSeenAt: string | null;
  jornada: {
    estadoTurno: string;
    ingresoAt: string | null;
    salidaAt: string | null;
    refrigerioInicioAt: string | null;
    refrigerioFinAt: string | null;
    refrigerioMin: number;
  };
  cuadrillas: { total: number; operativa: number; enCampo: number; rutaCerrada: number };
  ordenes: { total: number; agendada: number; iniciada: number; finalizada: number };
  llamadas: { total: number; realizadas: number; pendientes: number };
};

type InicioGerenciaData = {
  ok: true;
  ymd: string;
  resumen: {
    gestoresTotal: number;
    gestoresOnline: number;
    gestoresEnTurno: number;
    gestoresEnRefrigerio: number;
    gestoresFinalizados: number;
    gestoresSinIngreso: number;
    cuadrillasTotal: number;
    cuadrillasOperativa: number;
    cuadrillasEnCampo: number;
    cuadrillasRutaCerrada: number;
    ordenesTotal: number;
    ordenesAgendada: number;
    ordenesIniciada: number;
    ordenesFinalizada: number;
    ordenesOtros: number;
    llamadasTotal: number;
    llamadasRealizadas: number;
    llamadasPendientes: number;
  };
  gestores: Row[];
  ultimaImportacion: {
    at: string | null;
    byUid: string;
    byNombre: string;
  } | null;
};

type GestorDetalle = {
  ok: true;
  ymd: string;
  gestorUid: string;
  cuadrillas: Array<{
    cuadrillaId: string;
    cuadrillaNombre: string;
    estadoRuta: "OPERATIVA" | "EN_CAMPO" | "RUTA_CERRADA";
    ordenes: { total: number; agendada: number; iniciada: number; finalizada: number };
    llamadas: { total: number; realizadas: number; pendientes: number };
  }>;
  ordenes: Array<{
    id: string;
    cuadrillaId: string;
    cuadrillaNombre: string;
    tramo: string;
    cliente: string;
    estado: string;
    estadoLlamada: string;
    observacionLlamada: string;
  }>;
};

function fmtDateTime(v: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("es-PE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Lima",
  }).format(d);
}

export function GerenciaHomeClient() {
  const [data, setData] = useState<InicioGerenciaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<null | {
    type: "cuadrillas" | "ordenes" | "llamadas";
    gestorUid: string;
    gestorNombre: string;
  }>(null);
  const [detalle, setDetalle] = useState<GestorDetalle | null>(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/gerencia/inicio", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      setData(body as InicioGerenciaData);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo cargar el inicio de gerencia");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const abrirDetalleGestor = async (
    type: "cuadrillas" | "ordenes" | "llamadas",
    r: Row
  ) => {
    setModal({ type, gestorUid: r.uid, gestorNombre: r.nombre });
    setDetalle(null);
    setLoadingDetalle(true);
    try {
      const ymd = data?.ymd || "";
      const res = await fetch(
        `/api/gerencia/gestor-detalle?gestorUid=${encodeURIComponent(r.uid)}&ymd=${encodeURIComponent(ymd)}`,
        { cache: "no-store" }
      );
      const body = await res.json();
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      setDetalle(body as GestorDetalle);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo cargar el detalle del gestor");
      setDetalle(null);
    } finally {
      setLoadingDetalle(false);
    }
  };

  const rows = useMemo(() => {
    const list = data?.gestores || [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => `${r.nombre} ${r.uid}`.toLowerCase().includes(q));
  }, [data, query]);

  const importLine = data?.ultimaImportacion
    ? `Ordenes actualizadas: ${fmtDateTime(data.ultimaImportacion.at)}, por ${data.ultimaImportacion.byNombre || data.ultimaImportacion.byUid}`
    : "Ordenes: sin registro reciente de actualizacion";

  const estadoTurnoClass = (v: string) => {
    if (v === "EN_TURNO") return "border-sky-200 bg-sky-50 text-sky-700";
    if (v === "EN_REFRIGERIO") return "border-amber-200 bg-amber-50 text-amber-700";
    if (v === "FINALIZADO") return "border-slate-200 bg-slate-100 text-slate-700";
    return "border-rose-200 bg-rose-50 text-rose-700";
  };

  const routeBadgeClass = (
    estado: "OPERATIVA" | "EN_CAMPO" | "RUTA_CERRADA"
  ) => {
    if (estado === "OPERATIVA") return "border-sky-200 bg-sky-50 text-sky-700";
    if (estado === "EN_CAMPO") return "border-emerald-200 bg-emerald-50 text-emerald-700";
    return "border-rose-200 bg-rose-50 text-rose-700";
  };

  const groupedOrdenes = useMemo(() => {
    if (!detalle) return [] as Array<{
      cuadrillaId: string;
      cuadrillaNombre: string;
      items: GestorDetalle["ordenes"];
    }>;
    return detalle.cuadrillas
      .map((c) => ({
        cuadrillaId: c.cuadrillaId,
        cuadrillaNombre: c.cuadrillaNombre,
        items: detalle.ordenes.filter((o) => o.cuadrillaId === c.cuadrillaId),
      }))
      .filter((g) => g.items.length > 0);
  }, [detalle]);

  if (loading && !data) {
    return (
      <div className="rounded-lg border p-4 text-sm text-slate-500">
        Cargando inicio de gerencia...
      </div>
    );
  }

  return (
    <div className="space-y-4 text-slate-900 dark:text-slate-100">
      <section className="rounded-xl border bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="grid gap-2 md:grid-cols-2">
          <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            Gestores: <b>{data?.resumen.gestoresTotal ?? 0}</b> | Online{" "}
            <b>{data?.resumen.gestoresOnline ?? 0}</b> | En turno{" "}
            <b>{data?.resumen.gestoresEnTurno ?? 0}</b> | Refrigerio{" "}
            <b>{data?.resumen.gestoresEnRefrigerio ?? 0}</b>
          </div>
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            Llamadas: Realizadas <b>{data?.resumen.llamadasRealizadas ?? 0}</b> de{" "}
            <b>{data?.resumen.llamadasTotal ?? 0}</b> | Pendientes{" "}
            <b>{data?.resumen.llamadasPendientes ?? 0}</b>
          </div>
          <div className="rounded border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-700 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
            Cuadrillas: <b>{data?.resumen.cuadrillasTotal ?? 0}</b> | Operativa{" "}
            <b>{data?.resumen.cuadrillasOperativa ?? 0}</b> | En campo{" "}
            <b>{data?.resumen.cuadrillasEnCampo ?? 0}</b> | Ruta cerrada{" "}
            <b>{data?.resumen.cuadrillasRutaCerrada ?? 0}</b>
          </div>
          <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            Ordenes: <b>{data?.resumen.ordenesTotal ?? 0}</b> | Agendada{" "}
            <b>{data?.resumen.ordenesAgendada ?? 0}</b> | Iniciada{" "}
            <b>{data?.resumen.ordenesIniciada ?? 0}</b> | Finalizada{" "}
            <b>{data?.resumen.ordenesFinalizada ?? 0}</b>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Estado de gestores</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{importLine}</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar gestor..."
              className="h-9 min-w-[220px] rounded border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <button onClick={cargar} className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:text-slate-200">
              Actualizar
            </button>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <tr>
                <th className="border p-2 text-left">Gestor</th>
                <th className="border p-2 text-left">Jornada</th>
                <th className="border p-2 text-left">Cuadrillas</th>
                <th className="border p-2 text-left">Ordenes</th>
                <th className="border p-2 text-left">Llamadas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.uid} className="border border-slate-200 dark:border-slate-700">
                  <td className="border p-2">
                    <div className="font-medium">{r.nombre}</div>
                    <div
                      className={`mt-1 inline-flex rounded border px-2 py-0.5 text-xs ${
                        r.online
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200"
                          : "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-200"
                      }`}
                    >
                      {r.online ? "Online" : "Offline"}
                    </div>
                  </td>
                  <td className="border p-2">
                    <div
                      className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold ${estadoTurnoClass(r.jornada.estadoTurno)}`}
                    >
                      {r.jornada.estadoTurno}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Ingreso {fmtDateTime(r.jornada.ingresoAt)} | Salida{" "}
                      {fmtDateTime(r.jornada.salidaAt)}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Refrigerio acumulado: {r.jornada.refrigerioMin || 0} min
                    </div>
                  </td>
                  <td className="border p-2 text-xs">
                    <button
                      type="button"
                      onClick={() => abrirDetalleGestor("cuadrillas", r)}
                      className="w-full rounded border border-transparent px-1 py-1 text-left transition hover:border-indigo-200 hover:bg-indigo-50 dark:hover:border-indigo-700 dark:hover:bg-indigo-900/30"
                    >
                      Total <b>{r.cuadrillas.total}</b> | Operativa{" "}
                      <b>{r.cuadrillas.operativa}</b> | En campo{" "}
                      <b>{r.cuadrillas.enCampo}</b> | Ruta cerrada{" "}
                      <b>{r.cuadrillas.rutaCerrada}</b>
                    </button>
                  </td>
                  <td className="border p-2 text-xs">
                    <button
                      type="button"
                      onClick={() => abrirDetalleGestor("ordenes", r)}
                      className="w-full rounded border border-transparent px-1 py-1 text-left transition hover:border-emerald-200 hover:bg-emerald-50 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/30"
                    >
                      Total <b>{r.ordenes.total}</b> |{" "}
                      <span className={r.ordenes.agendada > 0 ? "font-semibold text-slate-800 dark:text-slate-100" : ""}>
                        Agendada{" "}
                        <span
                          className={
                            r.ordenes.agendada > 0
                              ? "rounded bg-amber-100 px-1 py-0.5 font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                              : ""
                          }
                        >
                          {r.ordenes.agendada}
                        </span>
                      </span>{" "}
                      |{" "}
                      <span className={r.ordenes.iniciada > 0 ? "font-semibold text-emerald-700" : ""}>
                        Iniciada{" "}
                        <span
                          className={
                            r.ordenes.iniciada > 0
                              ? "rounded bg-emerald-100 px-1 py-0.5 font-bold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                              : ""
                          }
                        >
                          {r.ordenes.iniciada}
                        </span>
                      </span>{" "}
                      | Finalizada{" "}
                      <b>{r.ordenes.finalizada}</b>
                    </button>
                  </td>
                  <td className="border p-2 text-xs">
                    <button
                      type="button"
                      onClick={() => abrirDetalleGestor("llamadas", r)}
                      className="w-full rounded border border-transparent px-1 py-1 text-left transition hover:border-amber-200 hover:bg-amber-50 dark:hover:border-amber-700 dark:hover:bg-amber-900/30"
                    >
                      {r.llamadas.realizadas}/{r.llamadas.total} | Pendientes{" "}
                      <b>{r.llamadas.pendientes}</b>
                    </button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td className="border p-4 text-center text-slate-500" colSpan={5}>
                    No hay gestores que coincidan con el filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => {
            setModal(null);
            setDetalle(null);
          }}
        >
          <div
            className="max-h-[85vh] w-full max-w-6xl overflow-hidden rounded-xl border bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b p-3 dark:border-slate-700">
              <h3 className="text-base font-semibold">
                {modal.type === "cuadrillas"
                  ? `Cuadrillas de ${modal.gestorNombre}`
                  : modal.type === "ordenes"
                  ? `Ordenes de ${modal.gestorNombre}`
                  : `Llamadas de ${modal.gestorNombre}`}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setModal(null);
                  setDetalle(null);
                }}
                className="rounded border border-slate-300 px-3 py-1 text-sm dark:border-slate-700 dark:text-slate-200"
              >
                Cerrar
              </button>
            </div>
            <div className="max-h-[72vh] overflow-auto p-3">
              {loadingDetalle && (
                <div className="rounded border p-3 text-sm text-slate-500">
                  Cargando detalle...
                </div>
              )}
              {!loadingDetalle && !detalle && (
                <div className="rounded border p-3 text-sm text-slate-500">
                  No hay detalle disponible.
                </div>
              )}
              {!loadingDetalle && !!detalle && (
                <table className="min-w-full border-collapse text-sm">
                  <thead className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    <tr>
                      {modal.type === "cuadrillas" && (
                        <>
                          <th className="border p-2 text-left">Cuadrilla</th>
                          <th className="border p-2 text-left">Estado ruta</th>
                          <th className="border p-2 text-left">Ordenes</th>
                          <th className="border p-2 text-left">Llamadas</th>
                        </>
                      )}
                      {(modal.type === "ordenes" || modal.type === "llamadas") && (
                        <>
                          <th className="border p-2 text-left">Tramo</th>
                          <th className="border p-2 text-left">Cliente</th>
                          <th className="border p-2 text-left">
                            {modal.type === "ordenes" ? "Estado" : "Estado llamada"}
                          </th>
                          {modal.type === "llamadas" && (
                            <th className="border p-2 text-left">Observacion</th>
                          )}
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {modal.type === "cuadrillas" &&
                      detalle.cuadrillas.map((c) => (
                        <tr key={c.cuadrillaId} className="border border-slate-200 dark:border-slate-700">
                          <td className="border p-2">
                            <div className="font-medium">{c.cuadrillaNombre}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">{c.cuadrillaId}</div>
                          </td>
                          <td className="border p-2">
                            <span
                              className={`rounded border px-2 py-1 text-xs font-semibold ${routeBadgeClass(c.estadoRuta)}`}
                            >
                              {c.estadoRuta}
                            </span>
                          </td>
                          <td className="border p-2 text-xs">
                            Total <b>{c.ordenes.total}</b> |{" "}
                            <span className={c.ordenes.agendada > 0 ? "font-semibold text-slate-800 dark:text-slate-100" : ""}>
                              Agendada{" "}
                              <span
                                className={
                                  c.ordenes.agendada > 0
                                    ? "rounded bg-amber-100 px-1 py-0.5 font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                                    : ""
                                }
                              >
                                {c.ordenes.agendada}
                              </span>
                            </span>{" "}
                            |{" "}
                            <span className={c.ordenes.iniciada > 0 ? "font-semibold text-emerald-700" : ""}>
                              Iniciada{" "}
                              <span
                                className={
                                  c.ordenes.iniciada > 0
                                    ? "rounded bg-emerald-100 px-1 py-0.5 font-bold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                                    : ""
                                }
                              >
                                {c.ordenes.iniciada}
                              </span>
                            </span>{" "}
                            | Finalizada{" "}
                            <b>{c.ordenes.finalizada}</b>
                          </td>
                          <td className="border p-2 text-xs">
                            {c.llamadas.realizadas}/{c.llamadas.total} | Pendientes{" "}
                            <b>{c.llamadas.pendientes}</b>
                          </td>
                        </tr>
                      ))}
                    {(modal.type === "ordenes" || modal.type === "llamadas") &&
                      groupedOrdenes.flatMap((g) => [
                        <tr key={`h-${modal.type}-${g.cuadrillaId}`} className="border bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                          <td
                            className="border p-2 font-semibold"
                            colSpan={modal.type === "ordenes" ? 3 : 5}
                          >
                            {g.cuadrillaNombre}
                          </td>
                        </tr>,
                        ...g.items
                          .filter((o) =>
                            modal.type === "ordenes" ? true : !!String(o.estadoLlamada || "").trim()
                          )
                          .map((o) => (
                            <tr key={`${modal.type}-${o.id}-${o.cuadrillaId}`} className="border border-slate-200 dark:border-slate-700">
                              <td className="border p-2">{o.tramo || "-"}</td>
                              <td className="border p-2">{o.cliente || "-"}</td>
                              <td className="border p-2">
                                {modal.type === "ordenes"
                                  ? o.estado || "-"
                                  : o.estadoLlamada || "-"}
                              </td>
                              {modal.type === "llamadas" && (
                                <td className="border p-2">{o.observacionLlamada || "-"}</td>
                              )}
                            </tr>
                          )),
                      ])}
                    {((modal.type === "cuadrillas" && detalle.cuadrillas.length === 0) ||
                      (modal.type === "ordenes" && groupedOrdenes.length === 0) ||
                      (modal.type === "llamadas" &&
                        groupedOrdenes.every(
                          (g) =>
                            g.items.filter((o) => !!String(o.estadoLlamada || "").trim()).length === 0
                        ))) && (
                      <tr>
                        <td
                          className="border p-4 text-center text-slate-500"
                          colSpan={modal.type === "cuadrillas" ? 4 : 4}
                        >
                          No hay registros para mostrar.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
