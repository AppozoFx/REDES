"use client";

import React, { useEffect, useMemo, useRef, useState, startTransition } from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import { despacharInstalacionesAction } from "../../server-actions";

/**
 * Mantiene tu lógica:
 * - Server Action: despacharInstalacionesAction
 * - Payload: { cuadrillaId, equipos, materiales, bobinasResidenciales? }
 * - Print area: usa lastPayload + result
 *
 * Replica la forma del otro:
 * - Paso 1: buscar/seleccionar cuadrilla + card info + (opcional) stock
 * - Paso 2: scanner SN + lista/tabla + bobinas + grid materiales
 * - Modal Preview: confirmar/cancelar antes de enviar
 * - ClickGuard: anti doble click/submits
 */

const MATS_INST = [
  "PRECON_50",
  "PRECON_100",
  "PRECON_150",
  "PRECON_200",
  "ACTA",
  "BOBINA", // residencial con códigos (WIN-XXXX o lo que uses)
  "BOBINA(CONDOMINIO)",
  "CONECTOR",
  "ROSETA",
  "ACOPLADOR",
  "PACHCORD",
  "CINTILLO_30",
  "CINTILLO_10",
  "CINTILLO_BANDERA",
  "CINTA_AISLANTE",
  "TEMPLADOR",
  "ANCLAJE_P",
  "TARUGO_P",
  "CLEVI",
  "HEBILLA_1_2",
  "CINTA_BANDI_1_2",
  "CAJA_GRAPAS",
] as const;

type Segmento = "RESIDENCIAL" | "CONDOMINIO";
type Tipo = "REGULAR" | "ALTO_VALOR";

type CuadrillaListItem = {
  id: string;
  nombre: string;
  r_c?: string;
  categoria?: string;
  zonaId?: string;
  tipoZona?: string;
  vehiculo?: string;
  numeroCuadrilla?: string;
};
type CuadrillaInfo = {
  nombre?: string;
  coordinadorUid?: string;
  coordinadorNombre?: string;
  tecnicosUids?: string[];
  tecnicosNombres?: string[];
  tipo?: string;
  segmento?: string;
  r_c?: string;
  categoria?: string;
  tipoZona?: string;
  zonaId?: string;
  vehiculo?: string;
};

type StockItem = { id: string; nombre?: string; cantidad?: number; metros?: number; tipo?: string };
type CuadrillaStock = {
  materiales?: StockItem[];
  equipos?: StockItem[];
  bobinas?: StockItem[];
};

// -----------------------
// Hook: click guard
// -----------------------
function useClickGuard(defaultCooldownMs = 700) {
  const untilRef = useRef(0);
  return (fn: () => void | Promise<void>, ms = defaultCooldownMs) => {
    if (Date.now() < untilRef.current) return;
    untilRef.current = Date.now() + ms;
    try {
      const r = fn();
      // no await: guard solo bloquea el doble click; pending cubre lo demás
      return r as any;
    } finally {
      setTimeout(() => {
        if (Date.now() >= untilRef.current) untilRef.current = 0;
      }, ms);
    }
  };
}

function uniqLines(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set(lines));
}

function numOr0(v: string | undefined) {
  const n = Number((v ?? "").toString().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

// -----------------------
// Componente
// -----------------------
export default function DespachoClient() {
  const guard = useClickGuard(700);

  const [step, setStep] = useState<1 | 2>(1);

  // Paso 1
  const [cuadrillaId, setCuadrillaId] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [cuadrillas, setCuadrillas] = useState<CuadrillaListItem[]>([]);
  const [cuadrillasLoading, setCuadrillasLoading] = useState(false);
  const [comboOpen, setComboOpen] = useState(false);
  const [cuadrillaNombre, setCuadrillaNombre] = useState("");
  const [coordinador, setCoordinador] = useState("");
  const [tecnicos, setTecnicos] = useState("");
  const [tipo, setTipo] = useState<Tipo>("REGULAR");
  const [segmento, setSegmento] = useState<Segmento>("RESIDENCIAL");
  const [zonaId, setZonaId] = useState("");
  const [infoLoaded, setInfoLoaded] = useState(false);

  // (Opcional) Stock
  const [stock, setStock] = useState<CuadrillaStock | null>(null);
  const [stockLoading, setStockLoading] = useState(false);

  // Paso 2 - Equipos (modo scanner + modo bulk)
  const [snInput, setSnInput] = useState("");
  const [equipos, setEquipos] = useState<string[]>([]);

  // Paso 2 - Bobinas / Materiales
  const [bobinaCodesText, setBobinaCodesText] = useState(""); // residencial (códigos crudos)
  const [bobinaCondominioMetros, setBobinaCondominioMetros] = useState<string>("300");
  const [matUnd, setMatUnd] = useState<Record<string, string>>({});
  const [matMetros, setMatMetros] = useState<Record<string, string>>({});

  // Preview modal
  const [showPreview, setShowPreview] = useState(false);

  // Server action
  const [result, run, pending] = useActionState(despacharInstalacionesAction as any, null as any);
  const [lastPayload, setLastPayload] = useState<any>(null);

  // -----------------------
  // Cargar lista de cuadrillas (opcional)
  // No rompe si no existe endpoint: queda vacío y todo funciona con ID manual.
  // -----------------------
  useEffect(() => {
    (async () => {
      try {
        // Si tienes un endpoint diferente, cámbialo aquí.
        setCuadrillasLoading(true);
        const res = await fetch("/api/cuadrillas/list?area=INSTALACIONES", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        // Espera: { ok:true, items:[{id,nombre}] }
        const items: CuadrillaListItem[] = data?.items || data?.cuadrillas || [];
        if (Array.isArray(items)) setCuadrillas(items);
      } catch {
        // silencioso: no rompe nada
      } finally {
        setCuadrillasLoading(false);
      }
    })();
  }, []);

  // -----------------------
  // Resultado del server action
  // -----------------------
  useEffect(() => {
    if (!result) return;
    if ((result as any).ok) {
      const r: any = result;
      toast.success("Despacho generado", { description: `Guía: ${r.guia}` });
      if (r.resumen?.warnings?.length) {
        toast.message("Avisos", { description: r.resumen.warnings.join("; ") });
      }
      // Cierra preview al éxito
      setShowPreview(false);
    } else {
      const msg = (result as any)?.error?.formErrors?.join(", ") || "Error en despacho";
      toast.error(msg);
    }
  }, [result]);

  // -----------------------
  // Helpers Paso 1
  // -----------------------
  async function cargarInfoCuadrillaById(id: string) {
    const res = await fetch(`/api/cuadrillas/info?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    const data = await res.json();
    if (!data?.ok) throw new Error(data?.error || "No se pudo obtener info de la cuadrilla");

    const info: CuadrillaInfo = data;
    setCuadrillaNombre(info.nombre || "");
    const coordName = info.coordinadorNombre || info.coordinadorUid || "";
    const techNames = Array.isArray(info.tecnicosNombres)
      ? info.tecnicosNombres
      : Array.isArray(info.tecnicosUids)
      ? info.tecnicosUids
      : [];
    setCoordinador(coordName);
    setTecnicos(techNames.join(", "));
    const rawTipo = String(info.tipoZona || info.tipo || "").trim().toUpperCase();
    const nextTipo: Tipo = rawTipo === "ALTO_VALOR" ? "ALTO_VALOR" : "REGULAR";
    const rawSegmento = String(info.segmento || info.r_c || info.categoria || "")
      .trim()
      .toUpperCase();
    const nextSegmento: Segmento = rawSegmento === "CONDOMINIO" ? "CONDOMINIO" : "RESIDENCIAL";
    setTipo(nextTipo);
    setSegmento(nextSegmento);
    setZonaId(info.zonaId || "");
    setInfoLoaded(true);
  }

  async function cargarStockCuadrillaById(id: string, seg: Segmento) {
    setStockLoading(true);
    try {
      // Si no tienes endpoint de stock todavía, esto no rompe: queda en null.
      const res = await fetch(`/api/cuadrillas/stock?id=${encodeURIComponent(id)}&segmento=${encodeURIComponent(seg)}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.ok) setStock(data.stock || data.data || null);
    } catch {
      // silencioso
    } finally {
      setStockLoading(false);
    }
  }

  const buscarYSeleccionarCuadrilla = () =>
    guard(async () => {
      const q = busqueda.trim();
      if (!q) return;

      // match exact (case-insensitive). Si quieres, luego se mejora a contains.
      const found =
        cuadrillas.find((c) => c.id === q) ||
        cuadrillas.find((c) => c.nombre?.trim().toLowerCase() === q.toLowerCase());

      if (!found?.id) {
        toast.error("Cuadrilla no encontrada o no está habilitada.");
        return;
      }

      setCuadrillaId(found.id);
      try {
        await cargarInfoCuadrillaById(found.id);
        await cargarStockCuadrillaById(found.id, segmento);
        toast.success("Cuadrilla cargada");
        setComboOpen(false);
      } catch (e: any) {
        toast.error(e?.message || "Error cargando cuadrilla");
      }
    });

  const filteredCuadrillas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return cuadrillas.slice(0, 50);
    return cuadrillas
      .filter((c) => c.nombre?.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
      .slice(0, 50);
  }, [busqueda, cuadrillas]);

  const handleCargarInfo = () =>
    guard(async () => {
      if (!cuadrillaId) return;
      try {
        await cargarInfoCuadrillaById(cuadrillaId);
        await cargarStockCuadrillaById(cuadrillaId, segmento);
        toast.success("Info cargada");
      } catch (e: any) {
        toast.error(e?.message || "Error consultando cuadrilla");
      }
    });

  // -----------------------
  // Paso 2: Equipos (scanner + bulk)
  // -----------------------
  const resumenEquipos = useMemo(() => {
    // aquí solo tienes SN. Si luego guardas tipo, lo mejoras.
    return `${equipos.length} SN`;
  }, [equipos.length]);

  const handleAddSN = () =>
    guard(() => {
      const sn = snInput.trim().toUpperCase();
      if (!sn) return;
      if (equipos.includes(sn)) {
        toast.error("Este SN ya fue agregado");
        setSnInput("");
        return;
      }
      setEquipos((p) => [...p, sn]);
      setSnInput("");
      toast.success("SN agregado");
    });

  const handleRemoveSN = (sn: string) => setEquipos((p) => p.filter((x) => x !== sn));


  // -----------------------
  // Construcción payload (MISMA lógica que tú ya tienes)
  // -----------------------
  function buildPayload() {
    const materiales: any[] = [];

    for (const id of MATS_INST) {
      if (id === "BOBINA") continue;
      if (id === "BOBINA(CONDOMINIO)") continue;

      const und = Math.max(0, Math.trunc(numOr0(matUnd[id] || "0")));
      const m = Math.max(0, numOr0(matMetros[id] || "0"));

      if (und > 0) materiales.push({ materialId: id, und });
      else if (m > 0) materiales.push({ materialId: id, metros: m });
    }

    if (segmento === "RESIDENCIAL") {
      const codes = uniqLines(bobinaCodesText);
      if (codes.length) materiales.push({ materialId: "BOBINA", metros: codes.length * 1000 });

      const payload = {
        cuadrillaId,
        equipos,
        materiales,
        bobinasResidenciales: codes.map((codigoRaw) => ({ codigoRaw })),
      };

      return { payload, extra: { codesCount: codes.length } };
    } else {
      const m = Math.max(0, numOr0(bobinaCondominioMetros || "0"));
      if (m > 0) materiales.push({ materialId: "BOBINA(CONDOMINIO)", metros: m });

      const payload = { cuadrillaId, equipos, materiales };
      return { payload, extra: { metros: m } };
    }
  }

  // -----------------------
  // Validación para abrir preview (como el otro)
  // -----------------------
  function canOpenPreview() {
    if (!cuadrillaId) return { ok: false, msg: "Falta cuadrillaId." };

    const { payload } = buildPayload();
    const mats = (payload as any).materiales || [];
    const tieneMateriales = mats.length > 0;
    const tieneEquipos = equipos.length > 0;

    if (segmento === "RESIDENCIAL") {
      const codes = uniqLines(bobinaCodesText);
      const tieneBobinas = codes.length > 0;
      if (!tieneMateriales && !tieneEquipos && !tieneBobinas) {
        return { ok: false, msg: "Para RESIDENCIAL: agrega equipos, materiales o al menos 1 bobina (código)." };
      }
    } else {
      const m = Math.max(0, numOr0(bobinaCondominioMetros));
      const tieneMetros = m > 0;
      if (!tieneMateriales && !tieneEquipos && !tieneMetros) {
        return { ok: false, msg: "Para CONDOMINIO: agrega equipos, materiales o metros de bobina." };
      }
    }
    return { ok: true as const, msg: "" };
  }

  const abrirPreview = () =>
    guard(() => {
      const v = canOpenPreview();
      if (!v.ok) {
        toast.error(v.msg);
        return;
      }
      setShowPreview(true);
    });

  const confirmar = () =>
    guard(() => {
      if (pending) return;
      const { payload } = buildPayload();
      setLastPayload({ ...payload, segmento });

      startTransition(() => (run as any)(payload));
    });

  // -----------------------
  // UI
  // -----------------------
  return (
    <div className="space-y-4">
      {/* Paso 1 */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="rounded border p-3">
            <div className="text-sm font-medium">Paso 1 · Seleccionar cuadrilla</div>
            <div className="text-xs text-muted-foreground">
              Puedes buscar por nombre (si existe /api/cuadrillas/list) o ingresar el ID manual.
            </div>
          </div>

          {/* Combobox con búsqueda (si hay lista) */}
          {cuadrillas.length > 0 && (
            <div className="grid grid-cols-1 gap-3">
              <div className="relative">
                <label className="block text-sm font-medium">Cuadrilla</label>
                <input
                  value={busqueda}
                  onChange={(e) => {
                    const v = e.target.value;
                    setBusqueda(v);
                    setComboOpen(true);
                    if (!v.trim()) {
                      setInfoLoaded(false);
                      setCuadrillaId("");
                      setCuadrillaNombre("");
                      setCoordinador("");
                      setTecnicos("");
                      setZonaId("");
                    }
                  }}
                  onFocus={() => setComboOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") buscarYSeleccionarCuadrilla();
                    if (e.key === "Escape") setComboOpen(false);
                  }}
                  className="mt-1 w-full rounded border px-2 py-2"
                  placeholder="Escribe nombre o ID (ej: K1 MOTO o K1_MOTO)"
                />

                {comboOpen && (
                  <div className="absolute z-20 mt-1 w-full rounded border bg-white shadow max-h-56 overflow-auto">
                    {cuadrillasLoading && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">Cargando…</div>
                    )}
                    {!cuadrillasLoading && filteredCuadrillas.length === 0 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">Sin resultados</div>
                    )}
                    {!cuadrillasLoading &&
                      filteredCuadrillas.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={async () => {
                            setBusqueda(c.nombre || c.id);
                            setCuadrillaId(c.id);
                            setInfoLoaded(false);
                            setStock(null);
                            setCuadrillaNombre("");
                            setCoordinador("");
                            setTecnicos("");
                            setZonaId("");
                            try {
                              await cargarInfoCuadrillaById(c.id);
                              toast.success("Cuadrilla cargada");
                            } catch (err: any) {
                              toast.error(err?.message || "Error cargando cuadrilla");
                            } finally {
                              setComboOpen(false);
                            }
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                        >
                          <div className="font-medium">{c.nombre || c.id}</div>
                          <div className="text-xs text-muted-foreground">{c.id}</div>
                        </button>
                      ))}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* Fallback: ID manual + Segmento (si no hay lista) */}
          {cuadrillas.length === 0 && (
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-sm font-medium">Cuadrilla ID</label>
                <input
                  value={cuadrillaId}
                  onChange={(e) => setCuadrillaId(e.target.value)}
                  className="mt-1 w-full rounded border px-2 py-2"
                  placeholder="Ej: K35_MOTO"
                />
              </div>
            </div>
          )}

          {cuadrillas.length === 0 && (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!cuadrillaId}
                onClick={handleCargarInfo}
                className="rounded border px-3 py-2 hover:bg-muted disabled:opacity-50"
              >
                Cargar info cuadrilla
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <button
              disabled={!cuadrillaId}
              onClick={() => setStep(2)}
              className="rounded bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>

          {/* Card resumen + Stock */}
          {infoLoaded && (
            <div className="rounded border p-3 text-sm space-y-1">
              <div className="font-medium">Resumen</div>
              <div>
                ID: <b>{cuadrillaId || "—"}</b> · Segmento: <b>{segmento}</b> · Tipo: <b>{tipo}</b>
              </div>
              <div>Nombre: {cuadrillaNombre || "—"}</div>
              <div>Zona: {zonaId || "—"}</div>
              <div>Coordinador: {coordinador || "—"}</div>
              <div>Técnicos: {tecnicos || "—"}</div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  disabled={!cuadrillaId || stockLoading}
                  onClick={() => cargarStockCuadrillaById(cuadrillaId, segmento)}
                  className="rounded border px-3 py-2 hover:bg-muted disabled:opacity-50"
                >
                  {stockLoading ? "Cargando stock..." : "Ver stock (opcional)"}
                </button>
                {!stock && <span className="text-xs text-muted-foreground">Si no existe el endpoint, no se mostrará.</span>}
              </div>

              {stock && (
                <div className="pt-2 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded border p-2">
                    <div className="text-xs font-medium mb-1">Materiales</div>
                    <div className="space-y-1">
                      {(stock.materiales || []).slice(0, 10).map((m, i) => (
                        <div key={i} className="text-xs flex justify-between gap-2">
                          <span className="truncate">{m.nombre || m.id}</span>
                          <span className="tabular-nums">{m.cantidad ?? m.metros ?? 0}</span>
                        </div>
                      ))}
                      {(stock.materiales || []).length > 10 && (
                        <div className="text-[11px] text-muted-foreground">+{(stock.materiales || []).length - 10} más</div>
                      )}
                    </div>
                  </div>
                  <div className="rounded border p-2">
                    <div className="text-xs font-medium mb-1">Equipos</div>
                    <div className="space-y-1">
                      {(stock.equipos || []).slice(0, 10).map((e, i) => (
                        <div key={i} className="text-xs flex justify-between gap-2">
                          <span className="truncate">{e.tipo || e.nombre || e.id}</span>
                          <span className="tabular-nums">{e.cantidad ?? 0}</span>
                        </div>
                      ))}
                      {(stock.equipos || []).length > 10 && (
                        <div className="text-[11px] text-muted-foreground">+{(stock.equipos || []).length - 10} más</div>
                      )}
                    </div>
                  </div>
                  <div className="rounded border p-2">
                    <div className="text-xs font-medium mb-1">Bobinas</div>
                    <div className="space-y-1">
                      {(stock.bobinas || []).slice(0, 10).map((b, i) => (
                        <div key={i} className="text-xs flex justify-between gap-2">
                          <span className="truncate">{b.nombre || b.id}</span>
                          <span className="tabular-nums">{b.metros ?? b.cantidad ?? 0}</span>
                        </div>
                      ))}
                      {(stock.bobinas || []).length > 10 && (
                        <div className="text-[11px] text-muted-foreground">+{(stock.bobinas || []).length - 10} más</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Paso 2 */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="rounded border px-3 py-2 hover:bg-muted"
              onClick={() => {
                setStep(1);
                toast.message("Regresaste al Paso 1");
              }}
            >
              ← Paso 1
            </button>

            <div className="rounded border px-3 py-2 text-xs">
              <div className="font-medium">Cuadrilla</div>
              <div>
                ID: {cuadrillaId} · Segmento: {segmento} · Tipo: {tipo}
              </div>
              {!!cuadrillaNombre && <div>Nombre: {cuadrillaNombre}</div>}
            </div>
          </div>

          {/* Equipos: scanner */}
          <div className="rounded border p-3">
            <div className="font-medium">Equipos (SN) · Scanner</div>
            <div className="mt-2 flex gap-2">
              <input
                value={snInput}
                onChange={(e) => setSnInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && handleAddSN()}
                className="w-full rounded border px-2 py-2 font-mono"
                placeholder="Escanea o escribe el SN y Enter"
              />
              <button
                type="button"
                onClick={handleAddSN}
                className="rounded bg-indigo-600 px-3 py-2 text-white hover:bg-indigo-700"
              >
                Agregar
              </button>
            </div>

            <div className="mt-2 text-xs text-muted-foreground">Total: {resumenEquipos}</div>

            {equipos.length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-sm border rounded">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left px-3 py-2">SN</th>
                      <th className="text-right px-3 py-2">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {equipos.map((sn) => (
                      <tr key={sn} className="border-t">
                        <td className="px-3 py-2 font-mono">{sn}</td>
                        <td className="px-3 py-2 text-right">
                          <button className="text-red-600 hover:underline" onClick={() => handleRemoveSN(sn)}>
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </div>

          {/* Materiales */}
          <div className="rounded border p-3 space-y-2">
            <div className="font-medium">Materiales (INSTALACIONES)</div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {MATS_INST.map((id) => (
                <div key={id} className="rounded border p-2">
                  <div className="text-sm font-medium">{id}</div>

                  {id === "BOBINA" && segmento === "RESIDENCIAL" ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Se ingresa abajo como códigos (uno por línea). Cada código suma 1000 m.
                    </div>
                  ) : id === "BOBINA(CONDOMINIO)" && segmento === "CONDOMINIO" ? (
                    <div className="mt-2">
                      <label className="block text-xs">Metros</label>
                      <input
                        value={bobinaCondominioMetros}
                        onChange={(e) => setBobinaCondominioMetros(e.target.value)}
                        className="mt-1 w-full rounded border px-2 py-1"
                        inputMode="decimal"
                      />
                    </div>
                  ) : (
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="block">UND</label>
                        <input
                          value={matUnd[id] || ""}
                          onChange={(e) => setMatUnd((p) => ({ ...p, [id]: e.target.value.replace(/\D/g, "") }))}
                          className="mt-1 w-full rounded border px-2 py-1"
                          inputMode="numeric"
                          pattern="[0-9]*"
                        />
                      </div>
                      <div>
                        <label className="block">Metros</label>
                        <input
                          value={matMetros[id] || ""}
                          onChange={(e) => setMatMetros((p) => ({ ...p, [id]: e.target.value }))}
                          className="mt-1 w-full rounded border px-2 py-1"
                          inputMode="decimal"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Bobinas residencial */}
            {segmento === "RESIDENCIAL" && (
              <div className="space-y-1 pt-2">
                <div className="font-medium">Bobinas (RESIDENCIAL) · Códigos (uno por línea)</div>
                <textarea
                  value={bobinaCodesText}
                  onChange={(e) => setBobinaCodesText(e.target.value)}
                  placeholder="WIN-1234\nWIN-5678"
                  className="w-full rounded border px-2 py-2 h-24 font-mono"
                />
                <div className="text-xs text-muted-foreground">
                  Total bobinas: {uniqLines(bobinaCodesText).length} · Total metros: {uniqLines(bobinaCodesText).length * 1000}
                </div>
              </div>
            )}
          </div>

          {/* Acciones: Preview / Confirmar */}
          <div className="pt-2 flex gap-2 items-center">
            <button
              type="button"
              disabled={pending || !cuadrillaId}
              onClick={abrirPreview}
              className="rounded bg-fuchsia-600 px-3 py-2 text-white hover:bg-fuchsia-700 disabled:opacity-50"
            >
              {pending ? "Procesando..." : "Previsualizar"}
            </button>

            {result?.ok && (
              <button type="button" onClick={() => window.print()} className="rounded border px-3 py-2 hover:bg-muted">
                Imprimir guía
              </button>
            )}

            {result?.ok && (result as any)?.resumen?.warnings?.length > 0 && (
              <span className="text-xs text-amber-700">{(result as any).resumen.warnings.length} aviso(s)</span>
            )}
          </div>

          {/* Printable area (tu misma lógica) */}
          {result?.ok && (
            <div id="print-area" className="hidden print:block">
              <div>
                <div>Guía: {(result as any).guia}</div>
                <div>
                  Cuadrilla: {cuadrillaId} · Segmento: {segmento}
                </div>
                <div>Fecha: {new Date().toLocaleString()}</div>
              </div>
              <div className="mt-2">
                <div className="font-medium">Equipos</div>
                {(lastPayload?.equipos || []).map((sn: string) => (
                  <div key={sn} className="text-xs">
                    {sn}
                  </div>
                ))}
              </div>
              <div className="mt-2">
                <div className="font-medium">Materiales</div>
                {(lastPayload?.materiales || []).map((m: any, idx: number) => (
                  <div key={idx} className="text-xs">
                    {m.materialId}: {m.und || m.metros}
                  </div>
                ))}
                {segmento === "RESIDENCIAL" && (lastPayload?.bobinasResidenciales || []).length > 0 && (
                  <div className="text-xs">
                    Bobinas: {(lastPayload?.bobinasResidenciales || []).map((b: any) => b.codigoRaw).join(", ")}
                  </div>
                )}
              </div>
            </div>
          )}

          <style jsx global>{`
            @media print {
              body * {
                visibility: hidden;
              }
              #print-area,
              #print-area * {
                visibility: visible;
              }
              #print-area {
                position: absolute;
                left: 0;
                top: 0;
                width: 80mm;
                padding: 8px;
              }
            }
          `}</style>
        </div>
      )}

      {/* Modal Preview */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl bg-white rounded-xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <div className="font-semibold">Resumen de despacho</div>
              <button
                onClick={() => setShowPreview(false)}
                className="text-gray-500 hover:text-gray-700"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            {(() => {
              const { payload } = buildPayload();
              const mats = (payload as any).materiales || [];
              const bobinasRes = (payload as any).bobinasResidenciales || [];
              return (
                <div className="p-5 space-y-4 text-sm">
                  <div className="grid sm:grid-cols-2 gap-2">
                    <div>
                      <b>Cuadrilla ID:</b> {cuadrillaId}
                    </div>
                    <div>
                      <b>Segmento:</b> {segmento}
                    </div>
                    <div>
                      <b>Tipo:</b> {tipo}
                    </div>
                    <div>
                      <b>Fecha:</b> {new Date().toLocaleString("es-PE")}
                    </div>
                    {!!cuadrillaNombre && (
                      <div className="sm:col-span-2">
                        <b>Nombre:</b> {cuadrillaNombre}
                      </div>
                    )}
                    {!!tecnicos && (
                      <div className="sm:col-span-2">
                        <b>Técnicos:</b> {tecnicos}
                      </div>
                    )}
                  </div>

                  <div className="rounded border p-3">
                    <b>Equipos ({equipos.length})</b>
                    {equipos.length === 0 ? (
                      <div className="text-muted-foreground">—</div>
                    ) : (
                      <ul className="list-disc pl-5 mt-1">
                        {equipos.map((sn) => (
                          <li key={sn} className="font-mono">
                            {sn}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="rounded border p-3">
                    <b>Materiales ({mats.length})</b>
                    {mats.length === 0 ? (
                      <div className="text-muted-foreground">—</div>
                    ) : (
                      <ul className="list-disc pl-5 mt-1">
                        {mats.map((m: any, i: number) => (
                          <li key={i}>
                            {m.materialId}: {m.und ? `${m.und} UND` : `${m.metros} m`}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {segmento === "RESIDENCIAL" && (
                    <div className="rounded border p-3">
                      <b>Bobinas RESIDENCIAL</b>
                      {bobinasRes.length === 0 ? (
                        <div className="text-muted-foreground">—</div>
                      ) : (
                        <>
                          <div className="text-xs text-muted-foreground">
                            Cantidad: {bobinasRes.length} · Total metros: {bobinasRes.length * 1000}
                          </div>
                          <div className="mt-1 text-xs break-words">
                            {bobinasRes.map((b: any) => b.codigoRaw).join(", ")}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {segmento === "CONDOMINIO" && (
                    <div className="rounded border p-3">
                      <b>Bobina CONDOMINIO (metros)</b>
                      <div>{Math.max(0, numOr0(bobinaCondominioMetros))}</div>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="px-5 py-4 border-t flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="rounded border px-3 py-2 hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={confirmar}
                className="rounded bg-emerald-600 px-3 py-2 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {pending ? "Registrando..." : "Confirmar y Registrar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
