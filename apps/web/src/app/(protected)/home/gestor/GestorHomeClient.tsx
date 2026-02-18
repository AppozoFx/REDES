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

  const resumenGlobal = useMemo(() => {
    const base = {
      totalOrdenes: 0,
      agendada: 0,
      enCamino: 0,
      finalizada: 0,
      otros: 0,
      llamadasTotal: 0,
      llamadasRealizadas: 0,
    };
    if (!data) return base;
    for (const c of data.cuadrillas) {
      base.totalOrdenes += c.ordenes.total;
      base.agendada += c.ordenes.agendada;
      base.enCamino += c.ordenes.enCamino;
      base.finalizada += c.ordenes.finalizada;
      base.otros += c.ordenes.otros;
      base.llamadasTotal += c.llamadas.total;
      base.llamadasRealizadas += c.llamadas.realizadas;
    }
    return base;
  }, [data]);

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
        <div className="mt-3 grid gap-3 md:grid-cols-6">
          <div className="rounded border p-2 text-sm">Total: <b>{resumenGlobal.totalOrdenes}</b></div>
          <div className="rounded border p-2 text-sm">Agendada: <b>{resumenGlobal.agendada}</b></div>
          <div className="rounded border p-2 text-sm">En camino: <b>{resumenGlobal.enCamino}</b></div>
          <div className="rounded border p-2 text-sm">Finalizada: <b>{resumenGlobal.finalizada}</b></div>
          <div className="rounded border p-2 text-sm">Otros: <b>{resumenGlobal.otros}</b></div>
          <div className="rounded border p-2 text-sm">
            Llamadas: <b>{resumenGlobal.llamadasRealizadas}/{resumenGlobal.llamadasTotal}</b>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4">
        <h2 className="text-lg font-semibold">Mis cuadrillas</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="p-2 text-left">Cuadrilla</th>
                <th className="p-2 text-left">Órdenes</th>
                <th className="p-2 text-left">Llamadas</th>
                <th className="p-2 text-left">Estado ruta</th>
              </tr>
            </thead>
            <tbody>
              {(data?.cuadrillas || []).map((c) => (
                <tr key={c.cuadrillaId} className="border-t">
                  <td className="p-2">
                    <div className="font-medium">{c.cuadrillaNombre}</div>
                    <div className="text-xs text-slate-500">{c.cuadrillaId}</div>
                  </td>
                  <td className="p-2">
                    <div>Total: {c.ordenes.total}</div>
                    <div className="text-xs text-slate-500">
                      Agendada {c.ordenes.agendada} | En camino {c.ordenes.enCamino} | Finalizada {c.ordenes.finalizada}
                    </div>
                  </td>
                  <td className="p-2">
                    <div>
                      {c.llamadas.realizadas}/{c.llamadas.total}
                    </div>
                    <div className={`text-xs ${c.llamadas.completas ? "text-emerald-700" : "text-amber-700"}`}>
                      {c.llamadas.completas ? "Llamadas completas" : "Pendientes de llamada"}
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <select
                        value={c.estadoRuta}
                        onChange={(e) =>
                          actualizarEstadoRuta(
                            c.cuadrillaId,
                            e.target.value as CuadrillaRow["estadoRuta"]
                          )
                        }
                        disabled={!!savingRouteById[c.cuadrillaId]}
                        className="rounded border px-2 py-1"
                      >
                        <option value="OPERATIVA">OPERATIVA</option>
                        <option value="EN_CAMPO">EN CAMPO</option>
                        <option value="RUTA_CERRADA">RUTA CERRADA</option>
                      </select>
                    </div>
                  </td>
                </tr>
              ))}
              {(data?.cuadrillas || []).length === 0 && (
                <tr>
                  <td className="p-4 text-center text-slate-500" colSpan={4}>
                    No tienes cuadrillas asignadas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4">
        <h2 className="text-lg font-semibold">Última importación de órdenes</h2>
        {!data?.ultimaImportacion && (
          <p className="mt-2 text-sm text-slate-500">No hay registros recientes de importación.</p>
        )}
        {data?.ultimaImportacion && (
          <div className="mt-2 space-y-1 text-sm">
            <div>
              Órdenes actualizadas: <b>{fmtDateTime(data.ultimaImportacion.at)}</b>
            </div>
            <div>
              Por: <b>{data.ultimaImportacion.byNombre || data.ultimaImportacion.byUid}</b>
            </div>
            <div className="text-slate-600">{data.ultimaImportacion.message}</div>
          </div>
        )}
      </section>
    </div>
  );
}
