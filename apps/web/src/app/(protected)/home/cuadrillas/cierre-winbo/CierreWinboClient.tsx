"use client";

import { useState } from "react";

type Tipo = "RESIDENCIAL" | "MOTO";

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

const DIAS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

const ERRORES: Record<string, string> = {
  CUADRILLA_NO_ENCONTRADA_WINBO: "La cuadrilla no se encontró en WinBo (puede estar inactiva).",
  CUADRILLA_AMBIGUA_WINBO: "WinBo devolvió más de una cuadrilla para ese nombre. Revisar manualmente.",
  CIERRE_YA_ENVIADO_HOY: "Ya existe una solicitud de cierre enviada o aprobada hoy para esta cuadrilla.",
  WINBO_FUERA_DE_HORARIO: "WinBo no permite cierres en este horario.",
  WINBO_LOGIN_FAILED: "No se pudo iniciar sesión en WinBo.",
  WINBO_REQUEST_TIMEOUT: "WinBo no respondió a tiempo. Intenta de nuevo.",
  FORBIDDEN: "No tienes permiso para usar esta función.",
  UNAUTHENTICATED: "Sesión expirada. Vuelve a iniciar sesión.",
};

export default function CierreWinboClient() {
  const [numero, setNumero] = useState("");
  const [tipo, setTipo] = useState<Tipo>("RESIDENCIAL");
  const [loading, setLoading] = useState<"validar" | "cerrar" | null>(null);
  const [validacion, setValidacion] = useState<DryRunResult | null>(null);
  const [cierre, setCierre] = useState<DryRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cuadrillaId = numero ? `K${Number(numero)}_${tipo}` : "";

  async function llamar(dryRun: boolean) {
    if (!cuadrillaId) return;
    setError(null);
    if (dryRun) {
      setValidacion(null);
      setCierre(null);
    }
    setLoading(dryRun ? "validar" : "cerrar");
    try {
      const res = await fetch("/api/cuadrillas/winbo/cerrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cuadrillaId, dryRun }),
      });
      const data: DryRunResult = await res.json();
      if (!data.ok) {
        setError(ERRORES[data.error ?? ""] ?? `Error: ${data.error ?? res.status}`);
        if (dryRun) setValidacion(data);
        return;
      }
      if (dryRun) setValidacion(data);
      else setCierre(data);
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(null);
    }
  }

  function onCerrar() {
    if (!validacion?.nombreWinbo) return;
    const seguro = window.confirm(
      `¿Cerrar la cuadrilla en WinBo?\n\n${validacion.nombreWinbo}\nDía: ${DIAS[validacion.dia ?? 0] || validacion.dia}\nMotivo: RETIRO DE CAMPO\n\nSe enviará la solicitud al proveedor para aprobación.`
    );
    if (seguro) void llamar(false);
  }

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <h1 className="text-xl font-semibold">Cierre de cuadrillas · WinBo</h1>
      <p className="mt-1 text-sm text-gray-500">
        Envía la solicitud de desactivación del día (motivo RETIRO DE CAMPO) directamente a WinBo. Primero valida, luego
        cierra.
      </p>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-sm">
            <span className="mb-1 font-medium">N° de cuadrilla</span>
            <input
              type="number"
              min={1}
              value={numero}
              onChange={(e) => {
                setNumero(e.target.value);
                setValidacion(null);
                setCierre(null);
                setError(null);
              }}
              placeholder="Ej: 15"
              className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </label>

          <div className="flex flex-col text-sm">
            <span className="mb-1 font-medium">Tipo</span>
            <div className="flex overflow-hidden rounded-lg border border-gray-300">
              {(["RESIDENCIAL", "MOTO"] as Tipo[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setTipo(t);
                    setValidacion(null);
                    setCierre(null);
                    setError(null);
                  }}
                  className={`px-3 py-2 text-sm ${
                    tipo === t ? "bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {t === "RESIDENCIAL" ? "Residencial" : "Moto"}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={!cuadrillaId || loading !== null}
            onClick={() => void llamar(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading === "validar" ? "Consultando WinBo…" : "Validar en WinBo (dry run)"}
          </button>
        </div>

        {cuadrillaId ? (
          <p className="mt-2 text-xs text-gray-400">
            ID interno: <span className="font-mono">{cuadrillaId}</span>
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p>{error}</p>
          {validacion?.candidatos ? (
            <div className="mt-2 text-xs">
              <p className="font-medium">
                WinBo devolvió {validacion.registros ?? validacion.candidatos.length} registro(s) con esa búsqueda:
              </p>
              {validacion.candidatos.length ? (
                <ul className="mt-1 list-inside list-disc font-mono">
                  {validacion.candidatos.map((c, i) => (
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

      {validacion?.ok ? (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700">Cuadrilla encontrada en WinBo</h2>
          <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-gray-400">Nombre WinBo</dt>
              <dd className="font-medium">{validacion.nombreWinbo}</dd>
            </div>
            <div>
              <dt className="text-gray-400">CuadriId</dt>
              <dd className="font-mono">{validacion.cuadriId}</dd>
            </div>
            <div>
              <dt className="text-gray-400">Día a cerrar</dt>
              <dd>
                {DIAS[validacion.dia ?? 0] || validacion.dia} ({validacion.ymd})
              </dd>
            </div>
            <div>
              <dt className="text-gray-400">Horario WinBo</dt>
              <dd>{validacion.horario?.valido ? "✅ Permitido" : "⛔ Fuera de horario"}</dd>
            </div>
          </dl>
          <details className="mt-2 text-xs text-gray-400">
            <summary className="cursor-pointer">Detalle técnico (EsHorarioValido)</summary>
            <pre className="mt-1 whitespace-pre-wrap break-all rounded bg-gray-50 p-2 font-mono">
              {validacion.horario?.raw || "(vacío)"}
            </pre>
          </details>

          {!cierre ? (
            <button
              type="button"
              disabled={loading !== null}
              onClick={onCerrar}
              className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {loading === "cerrar" ? "Enviando solicitud…" : "Cerrar cuadrilla en WinBo"}
            </button>
          ) : null}
        </div>
      ) : null}

      {cierre?.ok ? (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <p className="font-semibold">✅ Solicitud enviada a WinBo</p>
          <p className="mt-1">
            {cierre.nombreWinbo} — queda <span className="font-medium">pendiente de aprobación del proveedor</span>. El
            estado se registró en el sistema (id {cierre.cierreId}).
          </p>
        </div>
      ) : null}
    </div>
  );
}
