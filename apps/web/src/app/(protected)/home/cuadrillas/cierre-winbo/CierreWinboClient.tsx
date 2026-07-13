"use client";

import { useEffect, useMemo, useState } from "react";
import Select from "react-select";

type CuadrillaOption = {
  id: string; // K{n}_MOTO | K{n}_RESIDENCIAL
  nombre: string;
  numeroCuadrilla: number;
  coordinadorUid: string;
};

type Option = { value: string; label: string };

type DryRunResult = {
  ok: boolean;
  dryRun?: boolean;
  error?: string;
  cuadrillaId?: string;
  cuadriId?: string;
  nombreWinbo?: string;
  dia?: number;
  ymd?: string;
  horario?: { valido: boolean; raw: string };
  cierreId?: string;
  estado?: string;
  candidatos?: string[];
  registros?: string;
};

type ResultadoItem = {
  validando?: boolean;
  validacion?: DryRunResult;
  cerrando?: boolean;
  cierre?: DryRunResult;
};

const DIAS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

const ERRORES: Record<string, string> = {
  CUADRILLA_NO_ENCONTRADA_WINBO: "La cuadrilla no se encontró en WinBo (puede estar inactiva).",
  CUADRILLA_AMBIGUA_WINBO: "WinBo devolvió más de una cuadrilla para ese nombre. Revisar manualmente.",
  CIERRE_YA_ENVIADO_HOY: "Ya existe una solicitud de cierre enviada o aprobada hoy para esta cuadrilla.",
  WINBO_LOGIN_FAILED: "No se pudo iniciar sesión en WinBo.",
  WINBO_REQUEST_TIMEOUT: "WinBo no respondió a tiempo. Intenta de nuevo.",
  FORBIDDEN: "No tienes permiso para usar esta función.",
  UNAUTHENTICATED: "Sesión expirada. Vuelve a iniciar sesión.",
};

function mensajeError(data: DryRunResult | undefined): string {
  if (!data) return "";
  return ERRORES[data.error ?? ""] ?? `Error: ${data.error ?? "desconocido"}`;
}

async function llamarWinbo(cuadrillaId: string, dryRun: boolean): Promise<DryRunResult> {
  try {
    const res = await fetch("/api/cuadrillas/winbo/cerrar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cuadrillaId, dryRun }),
    });
    const data: DryRunResult = await res.json();
    return data;
  } catch {
    return { ok: false, error: "NETWORK_ERROR" };
  }
}

export default function CierreWinboClient() {
  const [isDark, setIsDark] = useState(false);

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

  const selectStyles = isDark
    ? {
        menuPortal: (base: any) => ({ ...base, zIndex: 9999 }),
        control: (base: any, state: any) => ({
          ...base,
          backgroundColor: "#020617",
          borderColor: state.isFocused ? "#38bdf8" : "#334155",
          boxShadow: "none",
        }),
        menu: (base: any) => ({ ...base, backgroundColor: "#0f172a", color: "#e2e8f0" }),
        option: (base: any, state: any) => ({
          ...base,
          backgroundColor: state.isSelected ? "#1d4ed8" : state.isFocused ? "#1e293b" : "#0f172a",
          color: "#e2e8f0",
        }),
        input: (base: any) => ({ ...base, color: "#e2e8f0" }),
        placeholder: (base: any) => ({ ...base, color: "#94a3b8" }),
        singleValue: (base: any) => ({ ...base, color: "#e2e8f0" }),
        multiValue: (base: any) => ({ ...base, backgroundColor: "#1e293b" }),
        multiValueLabel: (base: any) => ({ ...base, color: "#e2e8f0" }),
        multiValueRemove: (base: any) => ({ ...base, color: "#cbd5e1" }),
      }
    : {
        menuPortal: (base: any) => ({ ...base, zIndex: 9999 }),
      };

  const selectPortalProps = {
    menuPortalTarget: typeof document !== "undefined" ? document.body : null,
    menuPosition: "fixed" as const,
    styles: selectStyles,
  };

  const [coordinadores, setCoordinadores] = useState<Option[]>([]);
  const [cuadrillas, setCuadrillas] = useState<CuadrillaOption[]>([]);
  const [filtroCoordinador, setFiltroCoordinador] = useState("");
  const [seleccionadas, setSeleccionadas] = useState<string[]>([]);
  const [resultados, setResultados] = useState<Record<string, ResultadoItem>>({});
  const [procesoTipo, setProcesoTipo] = useState<"validar" | "cerrar" | null>(null);
  const [procesoIds, setProcesoIds] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [coordsRes, cuadrillasRes] = await Promise.all([
          fetch("/api/usuarios/by-role?role=COORDINADOR&area=INSTALACIONES", { cache: "no-store" }),
          fetch("/api/cuadrillas/list?area=INSTALACIONES", { cache: "no-store" }),
        ]);
        const coordsData = await coordsRes.json();
        if (coordsRes.ok && coordsData?.ok) {
          const items = Array.isArray(coordsData.items) ? coordsData.items : [];
          setCoordinadores(items.map((u: any) => ({ value: u.uid, label: u.label || u.uid })));
        }
        const cuadrillasData = await cuadrillasRes.json();
        if (cuadrillasRes.ok && cuadrillasData?.ok) {
          const items = Array.isArray(cuadrillasData.items) ? cuadrillasData.items : [];
          setCuadrillas(
            items.map((c: any) => ({
              id: c.id,
              nombre: c.nombre || c.id,
              numeroCuadrilla: Number(c.numeroCuadrilla) || 0,
              coordinadorUid: c.coordinadorUid || "",
            }))
          );
        }
      } catch {
        // los selects quedan vacíos si falla la carga inicial
      }
    })();
  }, []);

  const cuadrillasFiltradas = useMemo(() => {
    if (!filtroCoordinador) return [];
    return cuadrillas
      .filter((c) => c.coordinadorUid === filtroCoordinador)
      .sort((a, b) => a.numeroCuadrilla - b.numeroCuadrilla || a.nombre.localeCompare(b.nombre, "es"));
  }, [cuadrillas, filtroCoordinador]);

  const cuadrillaOptions: Option[] = cuadrillasFiltradas.map((c) => ({ value: c.id, label: c.nombre }));
  const nombrePorId = (id: string) => cuadrillas.find((c) => c.id === id)?.nombre || id;

  const loteEnCurso = procesoTipo !== null;

  function patchResultado(id: string, patch: ResultadoItem) {
    setResultados((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function estadoProceso(id: string): "pendiente" | "en_curso" | "ok" | "error" {
    const r = resultados[id];
    if (procesoTipo === "validar") {
      if (r?.validando) return "en_curso";
      if (r?.validacion) return r.validacion.ok ? "ok" : "error";
      return "pendiente";
    }
    if (procesoTipo === "cerrar") {
      if (r?.cerrando) return "en_curso";
      if (r?.cierre) return r.cierre.ok ? "ok" : "error";
      return "pendiente";
    }
    return "pendiente";
  }

  const procesoCompletados = procesoIds.filter((id) => {
    const e = estadoProceso(id);
    return e === "ok" || e === "error";
  }).length;

  // Secuencial (no Promise.all): WinBo solo admite una sesión activa por cuenta,
  // logins concurrentes pueden invalidarse entre sí (ver docs/contexto/web/winbo-cierre-cuadrilla.md).
  async function validarSeleccion() {
    if (seleccionadas.length === 0) return;
    setProcesoTipo("validar");
    setProcesoIds([...seleccionadas]);
    for (const id of seleccionadas) {
      patchResultado(id, { validando: true, validacion: undefined, cierre: undefined });
      const data = await llamarWinbo(id, true);
      patchResultado(id, { validando: false, validacion: data });
    }
    setProcesoTipo(null);
    setProcesoIds([]);
  }

  async function cerrarValidadas() {
    const pendientes = seleccionadas.filter(
      (id) => resultados[id]?.validacion?.ok && !resultados[id]?.cierre?.ok
    );
    if (pendientes.length === 0) return;
    const listado = pendientes
      .map((id) => `• ${resultados[id]?.validacion?.nombreWinbo || nombrePorId(id)}`)
      .join("\n");
    const seguro = window.confirm(
      `¿Cerrar ${pendientes.length} cuadrilla(s) en WinBo (motivo RETIRO DE CAMPO)?\n\n${listado}\n\nSe enviará la solicitud al proveedor para aprobación de cada una.`
    );
    if (!seguro) return;
    setProcesoTipo("cerrar");
    setProcesoIds(pendientes);
    for (const id of pendientes) {
      patchResultado(id, { cerrando: true });
      const data = await llamarWinbo(id, false);
      patchResultado(id, { cerrando: false, cierre: data });
    }
    setProcesoTipo(null);
    setProcesoIds([]);
  }

  const validadasPendientes = seleccionadas.filter(
    (id) => resultados[id]?.validacion?.ok && !resultados[id]?.cierre?.ok
  );

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6 text-slate-900 dark:text-slate-100">
      <h1 className="text-xl font-semibold">Cierre de cuadrillas · WinBo</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
        Envía la solicitud de desactivación del día (motivo RETIRO DE CAMPO) directamente a WinBo. Primero valida, luego
        cierra. Puedes seleccionar varias cuadrillas del mismo coordinador a la vez.
      </p>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-sm">
            <span className="mb-1 font-medium">Coordinador</span>
            <Select
              classNamePrefix="coordinador-filter"
              placeholder="Selecciona coordinador"
              options={coordinadores}
              isClearable
              isDisabled={loteEnCurso}
              value={coordinadores.find((c) => c.value === filtroCoordinador) || null}
              onChange={(sel) => {
                setFiltroCoordinador(sel?.value || "");
                setSeleccionadas([]);
                setResultados({});
              }}
              className="w-56"
              {...selectPortalProps}
            />
          </label>

          <label className="flex flex-col text-sm">
            <span className="mb-1 font-medium">Cuadrillas</span>
            <Select
              classNamePrefix="cuadrilla-filter"
              placeholder={filtroCoordinador ? "Selecciona una o varias cuadrillas" : "Primero selecciona un coordinador"}
              options={cuadrillaOptions}
              isMulti
              isClearable
              isDisabled={!filtroCoordinador || loteEnCurso}
              value={cuadrillaOptions.filter((c) => seleccionadas.includes(c.value))}
              onChange={(sel) => {
                const ids = (sel || []).map((s) => s.value);
                setSeleccionadas(ids);
                setResultados((prev) => {
                  const next: Record<string, ResultadoItem> = {};
                  for (const id of ids) if (prev[id]) next[id] = prev[id];
                  return next;
                });
              }}
              className="w-80"
              {...selectPortalProps}
            />
          </label>

          <button
            type="button"
            disabled={seleccionadas.length === 0 || loteEnCurso}
            onClick={() => void validarSeleccion()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {procesoTipo === "validar"
              ? "Consultando WinBo…"
              : `Validar ${seleccionadas.length || ""} en WinBo (dry run)`.trim()}
          </button>

          {validadasPendientes.length > 0 ? (
            <button
              type="button"
              disabled={loteEnCurso}
              onClick={() => void cerrarValidadas()}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {procesoTipo === "cerrar" ? "Cerrando…" : `Cerrar ${validadasPendientes.length} validada(s) en WinBo`}
            </button>
          ) : null}
        </div>

        {filtroCoordinador && cuadrillaOptions.length === 0 ? (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            Este coordinador no tiene cuadrillas habilitadas.
          </p>
        ) : null}
      </div>

      <div className="mt-4 space-y-3">
        {seleccionadas.map((id) => {
          const r = resultados[id];
          const nombre = nombrePorId(id);
          return (
            <div
              key={id}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-200">
                  {nombre} <span className="font-mono text-xs text-gray-400 dark:text-slate-500">({id})</span>
                </h2>
                {r?.validando ? (
                  <span className="text-xs text-gray-400 dark:text-slate-500">Validando…</span>
                ) : null}
                {r?.cerrando ? <span className="text-xs text-gray-400 dark:text-slate-500">Cerrando…</span> : null}
              </div>

              {r?.validacion && !r.validacion.ok ? (
                <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                  <p>{mensajeError(r.validacion)}</p>
                  {r.validacion.candidatos ? (
                    <div className="mt-2 text-xs">
                      <p className="font-medium">
                        WinBo devolvió {r.validacion.registros ?? r.validacion.candidatos.length} registro(s) con esa
                        búsqueda:
                      </p>
                      {r.validacion.candidatos.length ? (
                        <ul className="mt-1 list-inside list-disc font-mono">
                          {r.validacion.candidatos.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 italic">(ninguna fila — la búsqueda no arrojó resultados)</p>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {r?.validacion?.ok ? (
                <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-gray-400 dark:text-slate-500">Nombre WinBo</dt>
                    <dd className="font-medium">{r.validacion.nombreWinbo}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-400 dark:text-slate-500">CuadriId</dt>
                    <dd className="font-mono">{r.validacion.cuadriId}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-400 dark:text-slate-500">Día a cerrar</dt>
                    <dd>
                      {DIAS[r.validacion.dia ?? 0] || r.validacion.dia} ({r.validacion.ymd})
                    </dd>
                  </div>
                </dl>
              ) : null}

              {r?.cierre?.ok ? (
                <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <p className="font-semibold">✅ Solicitud enviada a WinBo</p>
                  <p className="mt-1">
                    Queda <span className="font-medium">pendiente de aprobación del proveedor</span>. Id: {r.cierre.cierreId}.
                  </p>
                </div>
              ) : null}

              {r?.cierre && !r.cierre.ok ? (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                  <p>{mensajeError(r.cierre)}</p>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {procesoTipo ? (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <span className="h-5 w-5 flex-shrink-0 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {procesoTipo === "validar" ? "Validando cuadrillas en WinBo…" : "Cerrando cuadrillas en WinBo…"}
              </h2>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
              {procesoCompletados} de {procesoIds.length} procesadas
            </p>

            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
              <div
                className="h-full bg-blue-600 transition-all"
                style={{
                  width: `${procesoIds.length ? (procesoCompletados / procesoIds.length) * 100 : 0}%`,
                }}
              />
            </div>

            <ul className="mt-4 max-h-64 space-y-1.5 overflow-y-auto text-sm">
              {procesoIds.map((id) => {
                const estado = estadoProceso(id);
                return (
                  <li key={id} className="flex items-center gap-2">
                    {estado === "pendiente" ? (
                      <span className="h-3.5 w-3.5 flex-shrink-0 rounded-full border border-gray-300 dark:border-slate-600" />
                    ) : estado === "en_curso" ? (
                      <span className="h-3.5 w-3.5 flex-shrink-0 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                    ) : estado === "ok" ? (
                      <span className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center text-emerald-600 dark:text-emerald-400">
                        ✓
                      </span>
                    ) : (
                      <span className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center text-red-600 dark:text-red-400">
                        ✗
                      </span>
                    )}
                    <span
                      className={
                        estado === "pendiente"
                          ? "text-gray-400 dark:text-slate-500"
                          : "text-slate-700 dark:text-slate-200"
                      }
                    >
                      {nombrePorId(id)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
