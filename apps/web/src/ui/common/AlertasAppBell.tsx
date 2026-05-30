"use client";

import * as React from "react";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { listenAlertasAppHoy, type AlertaAppDoc } from "@/domain/alertas-app/repo";

function timeAgo(ts: any) {
  if (!ts) return "";
  const d =
    typeof ts?.toDate === "function"
      ? ts.toDate()
      : typeof ts?.seconds === "number"
      ? new Date(ts.seconds * 1000)
      : null;
  if (!d) return "";
  const diffMs = Date.now() - d.getTime();
  const sec = Math.max(1, Math.floor(diffMs / 1000));
  if (sec < 60) return "hace unos segundos";
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return `hace ${h} h`;
}

function tipoLabel(tipo: string) {
  if (tipo === "CERRAR_RUTA") return "Solicitud de cierre de ruta";
  if (tipo === "REQUIERE_ATENCION") return "Requiere atención";
  return tipo;
}

function playNotifSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch {}
}

async function responder(alertaId: string, accion: "ACEPTAR" | "RECHAZAR") {
  const res = await fetch(`/api/alertas-app/${alertaId}/responder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accion }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
}

function EstadoBadge({ estado }: { estado: string }) {
  if (estado === "ACEPTADA") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
        ✓ Aceptada
      </span>
    );
  }
  if (estado === "RECHAZADA") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
        ✕ Rechazada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
      ⏳ Pendiente
    </span>
  );
}

export function AlertasAppBell({ uid, userRoles }: { uid: string; userRoles: string[] }) {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<AlertaAppDoc[]>([]);
  const [authReady, setAuthReady] = React.useState(false);
  const [loadingById, setLoadingById] = React.useState<Record<string, boolean>>({});
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) setAuthReady(true);
    });
    return () => unsub();
  }, []);

  React.useEffect(() => {
    if (!authReady) return;
    // listenAlertasAppHoy: escucha TODOS los alertas del día (pendientes + historial)
    const unsub = listenAlertasAppHoy(setItems);
    return () => unsub();
  }, [authReady]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (ev: MouseEvent) => {
      if (!rootRef.current?.contains(ev.target as Node)) setOpen(false);
    };
    const onEsc = (ev: KeyboardEvent) => { if (ev.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const handleResponder = async (alertaId: string, accion: "ACEPTAR" | "RECHAZAR") => {
    setLoadingById((prev) => ({ ...prev, [alertaId]: true }));
    try {
      await responder(alertaId, accion);
    } catch (err) {
      console.error("[AlertasAppBell] responder error", err);
    } finally {
      setLoadingById((prev) => ({ ...prev, [alertaId]: false }));
    }
  };

  const pendientes = items.filter((i) => i.estado === "PENDIENTE");
  const historial = items.filter((i) => i.estado !== "PENDIENTE");
  const countPendiente = pendientes.length;
  const prevCountRef = React.useRef(0);

  // Sonido + efecto cuando llega una nueva alerta pendiente
  React.useEffect(() => {
    if (countPendiente > prevCountRef.current && prevCountRef.current >= 0) {
      playNotifSound();
    }
    prevCountRef.current = countPendiente;
  }, [countPendiente]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`relative rounded-md px-3 py-2 text-sm transition-colors hover:bg-white/10 ${
          countPendiente > 0 ? "ring-2 ring-amber-400/60 ring-offset-1 ring-offset-transparent" : ""
        }`}
        title="Alertas de la app"
      >
        <span className={`font-medium ${countPendiente > 0 ? "text-amber-300" : ""}`}>
          Alertas APP
        </span>
        {countPendiente > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white shadow animate-bounce">
            {countPendiente}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[420px] max-w-[95vw] rounded-xl border border-slate-200 bg-white shadow-xl z-50 overflow-hidden dark:border-slate-700 dark:bg-slate-900">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-700">
            <div>
              <span className="text-sm font-semibold text-slate-900 dark:text-white">Alertas APP</span>
              {countPendiente > 0 && (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  {countPendiente} pendiente{countPendiente !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <button
              type="button"
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
              onClick={() => setOpen(false)}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="max-h-[480px] overflow-y-auto">
            {/* Sección pendientes */}
            {pendientes.length > 0 && (
              <div className="p-3 space-y-2">
                <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-amber-600">
                  Requieren acción
                </p>
                {pendientes.map((alerta) => (
                  <div
                    key={alerta.id}
                    className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-900/10"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-white leading-tight">
                          {tipoLabel(alerta.tipo)}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {alerta.cuadrillaNombre}
                          </span>
                          {" · "}
                          {alerta.emisorNombre}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-400">
                          {timeAgo(alerta.creadoAt)}
                        </div>
                      </div>
                      <EstadoBadge estado={alerta.estado} />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={loadingById[alerta.id]}
                        onClick={() => handleResponder(alerta.id, "ACEPTAR")}
                        className="flex-1 rounded-md bg-green-600 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                      >
                        {loadingById[alerta.id] ? "Procesando..." : "✓ Aceptar"}
                      </button>
                      <button
                        type="button"
                        disabled={loadingById[alerta.id]}
                        onClick={() => handleResponder(alerta.id, "RECHAZAR")}
                        className="flex-1 rounded-md border border-red-200 bg-red-50 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors"
                      >
                        {loadingById[alerta.id] ? "..." : "✕ Rechazar"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Sección historial */}
            {historial.length > 0 && (
              <div className={`p-3 space-y-2 ${pendientes.length > 0 ? "border-t border-slate-100 dark:border-slate-700" : ""}`}>
                <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Historial de hoy
                </p>
                {historial.map((alerta) => (
                  <div
                    key={alerta.id}
                    className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-700 dark:text-slate-300 leading-tight">
                          {tipoLabel(alerta.tipo)}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          <span className="font-medium">{alerta.cuadrillaNombre}</span>
                          {" · "}
                          {alerta.emisorNombre}
                        </div>
                        {alerta.respondidoPorRol && (
                          <div className="mt-0.5 text-[11px] text-slate-400">
                            Por: {alerta.respondidoPorRol} · {timeAgo(alerta.respondidoAt)}
                          </div>
                        )}
                      </div>
                      <EstadoBadge estado={alerta.estado} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Sin alertas */}
            {items.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <svg className="mb-2 h-8 w-8 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <p className="text-sm">Sin alertas hoy.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
