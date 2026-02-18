"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Jornada = {
  ymd: string;
  estadoTurno: "EN_TURNO" | "EN_REFRIGERIO" | "FINALIZADO";
  ingresoAt: string | null;
  salidaAt: string | null;
  refrigerio: {
    inicioAt: string | null;
    finAt: string | null;
    duracionMin: number;
  };
};

type CuadrillaRow = {
  cuadrillaId: string;
  cuadrillaNombre: string;
  estadoRuta: "OPERATIVA" | "EN_CAMPO" | "RUTA_CERRADA";
  ordenes: {
    total: number;
    agendada: number;
    enCamino: number;
    finalizada: number;
    otros: number;
    detallePorEstado: Record<string, number>;
  };
  llamadas: {
    total: number;
    realizadas: number;
    completas: boolean;
  };
};

type InicioData = {
  ok: true;
  jornada: Jornada;
  cuadrillas: CuadrillaRow[];
  ultimaImportacion: {
    at: string | null;
    byUid: string;
    byNombre: string;
    message: string;
  } | null;
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

export function GestorHomeClient() {
  const [data, setData] = useState<InicioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState(false);
  const [savingRouteById, setSavingRouteById] = useState<Record<string, boolean>>({});
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [cuadrillaQuery, setCuadrillaQuery] = useState("");

  const cargar = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/gestor/inicio", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      setData(body as InicioData);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo cargar el inicio del gestor");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        await fetch("/api/gestor/jornada", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "HEARTBEAT" }),
        });
      } catch {}
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const ejecutarJornada = async (action: string) => {
    setBusyAction(true);
    try {
      const res = await fetch("/api/gestor/jornada", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await res.json();
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      await cargar();
      toast.success("Estado actualizado");
    } catch (e: any) {
      toast.error(e?.message || "No se pudo actualizar la jornada");
    } finally {
      setBusyAction(false);
    }
  };

  const actualizarEstadoRuta = async (cuadrillaId: string, estadoRuta: CuadrillaRow["estadoRuta"]) => {
    setSavingRouteById((prev) => ({ ...prev, [cuadrillaId]: true }));
    try {
      const res = await fetch("/api/gestor/cuadrillas/estado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cuadrillaId, estadoRuta }),
      });
      const body = await res.json();
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          cuadrillas: prev.cuadrillas.map((r) =>
            r.cuadrillaId === cuadrillaId ? { ...r, estadoRuta } : r
          ),
        };
      });
      toast.success("Estado de ruta actualizado");
    } catch (e: any) {
      toast.error(e?.message || "No se pudo actualizar el estado de ruta");
    } finally {
      setSavingRouteById((prev) => ({ ...prev, [cuadrillaId]: false }));
    }
  };

  const ponerTodasEnCampo = async () => {
    if (!data) return;
    const target = data.cuadrillas.filter((c) => c.estadoRuta !== "EN_CAMPO");
    if (!target.length) {
      toast.success("Todas tus cuadrillas ya estan en campo");
      return;
    }

    setBulkUpdating(true);
    try {
      const updates = await Promise.all(
        target.map(async (c) => {
          const res = await fetch("/api/gestor/cuadrillas/estado", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cuadrillaId: c.cuadrillaId, estadoRuta: "EN_CAMPO" }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
          return c.cuadrillaId;
        })
      );

      const changed = new Set(updates);
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          cuadrillas: prev.cuadrillas.map((c) =>
            changed.has(c.cuadrillaId) ? { ...c, estadoRuta: "EN_CAMPO" } : c
          ),
        };
      });
      toast.success("Cuadrillas actualizadas a EN CAMPO");
    } catch (e: any) {
      toast.error(e?.message || "No se pudo actualizar todas las cuadrillas");
    } finally {
      setBulkUpdating(false);
    }
  };

  const cuadrillasVisibles = useMemo(() => {
    const list = data?.cuadrillas || [];
    const q = cuadrillaQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => {
      const nombre = String(c.cuadrillaNombre || "").toLowerCase();
      const id = String(c.cuadrillaId || "").toLowerCase();
      return nombre.includes(q) || id.includes(q);
    });
  }, [data, cuadrillaQuery]);

  const resumenGlobal = useMemo(() => {
    const base = {
      totalOrdenes: 0,
      agendada: 0,
      enCamino: 0,
      finalizada: 0,
      otros: 0,
      detallePorEstado: {} as Record<string, number>,
      llamadasTotal: 0,
      llamadasRealizadas: 0,
    };
    if (!cuadrillasVisibles.length) return base;
    for (const c of cuadrillasVisibles) {
      base.totalOrdenes += c.ordenes.total;
      base.agendada += c.ordenes.agendada;
      base.enCamino += c.ordenes.enCamino;
      base.finalizada += c.ordenes.finalizada;
      base.otros += c.ordenes.otros;
      for (const [estado, cantidad] of Object.entries(c.ordenes.detallePorEstado || {})) {
        base.detallePorEstado[estado] = (base.detallePorEstado[estado] || 0) + Number(cantidad || 0);
      }
      base.llamadasTotal += c.llamadas.total;
      base.llamadasRealizadas += c.llamadas.realizadas;
    }
    return base;
  }, [cuadrillasVisibles]);

  const resumenCuadrillas = useMemo(() => {
    const base = { total: 0, operativa: 0, enCampo: 0, rutaCerrada: 0 };
    if (!cuadrillasVisibles.length) return base;
    base.total = cuadrillasVisibles.length;
    for (const c of cuadrillasVisibles) {
      if (c.estadoRuta === "OPERATIVA") base.operativa += 1;
      else if (c.estadoRuta === "EN_CAMPO") base.enCampo += 1;
      else if (c.estadoRuta === "RUTA_CERRADA") base.rutaCerrada += 1;
    }
    return base;
  }, [cuadrillasVisibles]);

  const pendientesLlamada = Math.max(0, resumenGlobal.llamadasTotal - resumenGlobal.llamadasRealizadas);
  const estadosOrdenesDetalle = Object.entries(resumenGlobal.detallePorEstado)
    .sort((a, b) => b[1] - a[1])
    .map(([estado, cantidad]) => `${estado} ${cantidad}`);
  const importLine = data?.ultimaImportacion
    ? `Ordenes actualizadas: ${fmtDateTime(data.ultimaImportacion.at)}, por ${data.ultimaImportacion.byNombre || data.ultimaImportacion.byUid}`
    : "Ordenes: sin registro reciente de actualizacion";

  const routeBadgeClass = (estado: CuadrillaRow["estadoRuta"]) => {
    if (estado === "OPERATIVA") return "border-sky-200 bg-sky-50 text-sky-700";
    if (estado === "EN_CAMPO") return "border-emerald-200 bg-emerald-50 text-emerald-700";
    return "border-rose-200 bg-rose-50 text-rose-700";
  };

  if (loading && !data) {
    return <div className="rounded-lg border p-4 text-sm text-slate-500">Cargando inicio...</div>;
  }

  const jornada = data?.jornada;
  const canIniciarRefrigerio =
    !!jornada &&
    jornada.estadoTurno === "EN_TURNO" &&
    !jornada.refrigerio.inicioAt &&
    !jornada.refrigerio.finAt;
  const canTerminarRefrigerio =
    !!jornada &&
    jornada.estadoTurno === "EN_REFRIGERIO" &&
    !!jornada.refrigerio.inicioAt &&
    !jornada.refrigerio.finAt;
  const canFinalizarTurno = !!jornada && jornada.estadoTurno !== "FINALIZADO";

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-white p-4">
        <h2 className="text-lg font-semibold">Mi jornada de hoy</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <div className="rounded border p-3">
            <div className="text-xs text-slate-500">Estado</div>
            <div className="font-semibold">{jornada?.estadoTurno || "-"}</div>
          </div>
          <div className="rounded border p-3">
            <div className="text-xs text-slate-500">Ingreso</div>
            <div className="font-semibold">{fmtDateTime(jornada?.ingresoAt || null)}</div>
          </div>
          <div className="rounded border p-3">
            <div className="text-xs text-slate-500">Refrigerio</div>
            <div className="font-semibold">
              {jornada?.refrigerio.inicioAt
                ? `${fmtDateTime(jornada.refrigerio.inicioAt)} - ${fmtDateTime(jornada.refrigerio.finAt)}`
                : "No iniciado"}
            </div>
          </div>
          <div className="rounded border p-3">
            <div className="text-xs text-slate-500">Salida</div>
            <div className="font-semibold">{fmtDateTime(jornada?.salidaAt || null)}</div>
          </div>
        </div>
        <div className="mt-3 text-sm text-slate-600">
          Tiempo acumulado en refrigerio: <b>{jornada?.refrigerio.duracionMin || 0} min</b>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => ejecutarJornada("INICIAR_REFRIGERIO")}
            disabled={!canIniciarRefrigerio || busyAction}
            className="rounded bg-amber-600 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Iniciar refrigerio
          </button>
          <button
            onClick={() => ejecutarJornada("TERMINAR_REFRIGERIO")}
            disabled={!canTerminarRefrigerio || busyAction}
            className="rounded bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Terminar refrigerio
          </button>
          <button
            onClick={() => ejecutarJornada("FINALIZAR_TURNO")}
            disabled={!canFinalizarTurno || busyAction}
            className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Finalizar turno
          </button>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4">
        <h2 className="text-lg font-semibold">Resumen operativo</h2>
        <div className="mt-3 space-y-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="font-semibold text-slate-700">Ordenes</div>
            <div className="mt-1 text-slate-700">
              Total <b>{resumenGlobal.totalOrdenes}</b>
              {estadosOrdenesDetalle.length ? ` | ${estadosOrdenesDetalle.join(" | ")}` : " | SIN_ORDENES 0"}
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm">
              <div className="font-semibold text-indigo-700">Cuadrillas</div>
              <div className="mt-1 text-indigo-700">
                Total <b>{resumenCuadrillas.total}</b> | Operativa <b>{resumenCuadrillas.operativa}</b> | En campo <b>{resumenCuadrillas.enCampo}</b> | Ruta cerrada <b>{resumenCuadrillas.rutaCerrada}</b>
              </div>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
              <div className="font-semibold text-amber-700">Llamadas</div>
              <div className="mt-1 text-amber-700">
                Realizadas <b>{resumenGlobal.llamadasRealizadas}</b> de <b>{resumenGlobal.llamadasTotal}</b> | Pendientes <b>{pendientesLlamada}</b>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <h2 className="text-lg font-semibold">Mis cuadrillas</h2>
              <p className="text-xs text-slate-500">{importLine}</p>
            </div>
            <input
              value={cuadrillaQuery}
              onChange={(e) => setCuadrillaQuery(e.target.value)}
              placeholder="Filtrar cuadrilla..."
              className="h-9 min-w-[220px] rounded border px-3 text-sm"
            />
          </div>
          <button
            onClick={ponerTodasEnCampo}
            disabled={bulkUpdating || !data?.cuadrillas.length}
            className="rounded bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {bulkUpdating ? "Actualizando..." : "Poner todas en campo"}
          </button>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="border p-2 text-left">Cuadrilla</th>
                <th className="border p-2 text-left">Ordenes</th>
                <th className="border p-2 text-left">Llamadas</th>
                <th className="border p-2 text-left">Estado ruta</th>
              </tr>
            </thead>
            <tbody>
              {cuadrillasVisibles.map((c) => (
                <tr key={c.cuadrillaId} className={`border ${c.estadoRuta === "RUTA_CERRADA" ? "bg-rose-50/40" : ""}`}>
                  <td className="border p-2">
                    <div className="font-medium">{c.cuadrillaNombre}</div>
                    <div className="text-xs text-slate-500">{c.cuadrillaId}</div>
                  </td>
                  <td className="border p-2">
                    <div>Total: {c.ordenes.total}</div>
                    <div className="text-xs text-slate-500">
                      <span className={c.ordenes.agendada > 0 ? "font-semibold text-slate-800" : ""}>
                        Agendada{" "}
                        <span
                          className={
                            c.ordenes.agendada > 0
                              ? "rounded bg-amber-100 px-1 py-0.5 font-bold text-amber-800"
                              : ""
                          }
                        >
                          {c.ordenes.agendada}
                        </span>
                      </span>{" "}
                      |{" "}
                      <span className={c.ordenes.enCamino > 0 ? "font-semibold text-emerald-700" : ""}>
                        Iniciada{" "}
                        <span
                          className={
                            c.ordenes.enCamino > 0
                              ? "rounded bg-emerald-100 px-1 py-0.5 font-bold text-emerald-800"
                              : ""
                          }
                        >
                          {c.ordenes.enCamino}
                        </span>
                      </span>{" "}
                      | Finalizada {c.ordenes.finalizada}
                    </div>
                  </td>
                  <td className="border p-2">
                    <div>
                      {c.llamadas.realizadas}/{c.llamadas.total}
                    </div>
                    <div className={`text-xs ${c.llamadas.completas ? "text-emerald-700" : "text-amber-700"}`}>
                      {c.llamadas.completas ? "Llamadas completas" : "Pendientes de llamada"}
                    </div>
                  </td>
                  <td className="border p-2">
                    <div className="flex items-center gap-2">
                      <span className={`rounded border px-2 py-1 text-xs font-semibold ${routeBadgeClass(c.estadoRuta)}`}>
                        {c.estadoRuta}
                      </span>
                      <select
                        value={c.estadoRuta}
                        onChange={(e) =>
                          actualizarEstadoRuta(
                            c.cuadrillaId,
                            e.target.value as CuadrillaRow["estadoRuta"]
                          )
                        }
                        disabled={!!savingRouteById[c.cuadrillaId]}
                        className="rounded border px-2 py-1 text-xs"
                      >
                        <option value="OPERATIVA">OPERATIVA</option>
                        <option value="EN_CAMPO">EN CAMPO</option>
                        <option value="RUTA_CERRADA">RUTA CERRADA</option>
                      </select>
                    </div>
                  </td>
                </tr>
              ))}
              {cuadrillasVisibles.length === 0 && (
                <tr>
                  <td className="border p-4 text-center text-slate-500" colSpan={4}>
                    {data?.cuadrillas?.length
                      ? "No hay cuadrillas que coincidan con el filtro."
                      : "No tienes cuadrillas asignadas."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}


