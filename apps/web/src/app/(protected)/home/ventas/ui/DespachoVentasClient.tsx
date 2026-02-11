"use client";

import React, { useEffect, useMemo, useState, startTransition } from "react";
import { toast } from "sonner";
import { crearVentaAction } from "../server-actions";

type Area = "INSTALACIONES" | "AVERIAS";

type CuadrillaListItem = {
  id: string;
  nombre?: string;
};

type CuadrillaInfo = {
  nombre?: string;
  coordinadorUid?: string;
  coordinadorNombre?: string;
};

type MaterialItem = {
  id: string;
  nombre?: string;
  unidadTipo?: "UND" | "METROS";
  precioUndCents?: number | null;
  precioPorCmCents?: number | null;
  areas?: string[];
};

type ItemState = {
  materialId: string;
  und: string;
  metros: string;
  precioInput: string;
};

function toNum(raw: string) {
  const n = Number(String(raw || "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function moneyToCents(n: number) {
  return Math.round((n || 0) * 100);
}

function centsToMoney(cents: number) {
  return (Math.round(cents || 0) / 100).toFixed(2);
}

function pricePerMeterToCentsPerCm(pricePerMeter: number) {
  const centsPerMeter = moneyToCents(pricePerMeter);
  return Math.round(centsPerMeter / 100);
}

function centsPerCmToPricePerMeter(centsPerCm: number) {
  return (Math.round((centsPerCm || 0) * 100) / 100).toFixed(2);
}

export default function DespachoVentasClient({
  area,
  canEditPrecio,
  canEditCoordinador,
}: {
  area: Area;
  canEditPrecio: boolean;
  canEditCoordinador: boolean;
}) {
  const [cuadrillaId, setCuadrillaId] = useState("");
  const [cuadrillas, setCuadrillas] = useState<CuadrillaListItem[]>([]);
  const [cuadrillaNombre, setCuadrillaNombre] = useState("");
  const [coordinadorUid, setCoordinadorUid] = useState("");
  const [coordinadorNombre, setCoordinadorNombre] = useState("");
  const [cuadrillaQuery, setCuadrillaQuery] = useState("");
  const [observacion, setObservacion] = useState("");

  const [coordinadores, setCoordinadores] = useState<Array<{ uid: string; label: string }>>([]);

  const [materiales, setMateriales] = useState<MaterialItem[]>([]);
  const [materialFilterArea, setMaterialFilterArea] = useState<"ALL" | "INSTALACIONES" | "AVERIAS">("ALL");
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [items, setItems] = useState<ItemState[]>([]);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (!coordinadorUid && canEditCoordinador) {
          setCuadrillas([]);
          return;
        }
        const qs = coordinadorUid ? `&coordinadorUid=${encodeURIComponent(coordinadorUid)}` : "";
        const res = await fetch(`/api/cuadrillas/list?area=${area}${qs}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const list = Array.isArray(data?.items) ? data.items : [];
        setCuadrillas(list.map((c: any) => ({ id: c.id, nombre: c.nombre })));
      } catch {}
    })();
  }, [area, coordinadorUid, canEditCoordinador]);

  useEffect(() => {
    (async () => {
      if (!cuadrillaId) return;
      try {
        const res = await fetch(`/api/cuadrillas/info?id=${encodeURIComponent(cuadrillaId)}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as CuadrillaInfo;
        if (!data?.coordinadorUid) return;
        setCuadrillaNombre(data.nombre || "");
        if (!canEditCoordinador || !coordinadorUid) {
          setCoordinadorUid(String(data.coordinadorUid || ""));
          setCoordinadorNombre(String(data.coordinadorNombre || ""));
        }
        setCuadrillaQuery(data.nombre || cuadrillaId);
      } catch {}
    })();
  }, [cuadrillaId, canEditCoordinador, coordinadorUid]);

  useEffect(() => {
    (async () => {
      try {
        const qs = materialFilterArea === "ALL" ? "" : `?area=${materialFilterArea}`;
        const res = await fetch(`/api/materiales/vendibles${qs}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const list = Array.isArray(data?.items) ? data.items : [];
        setMateriales(list);
      } catch {}
    })();
  }, [materialFilterArea]);

  useEffect(() => {
    if (!canEditCoordinador) return;
    (async () => {
      try {
        const res = await fetch("/api/usuarios/by-role?role=COORDINADOR", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setCoordinadores(Array.isArray(data?.items) ? data.items : []);
      } catch {}
    })();
  }, [canEditCoordinador]);

  useEffect(() => {
    if (canEditCoordinador) return;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.ok && data?.uid) {
          setCoordinadorUid(String(data.uid));
          setCoordinadorNombre(String(data.nombre || data.uid));
        }
      } catch {}
    })();
  }, [canEditCoordinador]);

  const materialMap = useMemo(() => {
    const map = new Map<string, MaterialItem>();
    materiales.forEach((m) => map.set(String(m.id), m));
    return map;
  }, [materiales]);

  const materialByName = useMemo(() => {
    const map = new Map<string, MaterialItem>();
    materiales.forEach((m) => {
      const name = String(m.nombre || "").trim().toLowerCase();
      if (name) map.set(name, m);
    });
    return map;
  }, [materiales]);

  const selectedMaterial = selectedMaterialId ? materialMap.get(selectedMaterialId) : undefined;

  function addMaterial(materialId?: string) {
    const id = materialId || selectedMaterialId;
    if (!id) return;
    if (items.some((i) => i.materialId === id)) {
      toast.error("Material ya agregado");
      return;
    }
    setItems((prev) => [
      ...prev,
      { materialId: id, und: "", metros: "", precioInput: "" },
    ]);
    setSelectedMaterialId("");
  }

  function removeMaterial(id: string) {
    setItems((prev) => prev.filter((i) => i.materialId !== id));
  }

  function resolveUnitPriceCents(item: ItemState, mat: MaterialItem) {
    if (canEditPrecio && item.precioInput) {
      const n = toNum(item.precioInput);
      if (mat.unidadTipo === "METROS") return pricePerMeterToCentsPerCm(n);
      return moneyToCents(n);
    }
    if (mat.unidadTipo === "METROS") return Math.max(0, Math.floor(mat.precioPorCmCents || 0));
    return Math.max(0, Math.floor(mat.precioUndCents || 0));
  }

  function calcSubtotal(item: ItemState, mat: MaterialItem) {
    const unitCents = resolveUnitPriceCents(item, mat);
    if (mat.unidadTipo === "METROS") {
      const metros = Math.max(0, toNum(item.metros));
      return unitCents * Math.round(metros * 100);
    }
    const und = Math.max(0, Math.floor(toNum(item.und)));
    return unitCents * und;
  }

  const totalCents = useMemo(() => {
    return items.reduce((acc, it) => {
      const mat = materialMap.get(it.materialId);
      if (!mat) return acc;
      return acc + calcSubtotal(it, mat);
    }, 0);
  }, [items, materialMap]);

  const filteredCuadrillas = useMemo(() => {
    const q = String(cuadrillaQuery || "").toLowerCase();
    if (!q) return cuadrillas.slice(0, 20);
    return cuadrillas
      .filter((c) => {
        const name = String(c.nombre || "").toLowerCase();
        const id = String(c.id || "").toLowerCase();
        return name.includes(q) || id.includes(q);
      })
      .slice(0, 20);
  }, [cuadrillas, cuadrillaQuery]);

  const [materialSearch, setMaterialSearch] = useState("");
  const filteredMateriales = useMemo(() => {
    const q = String(materialSearch || "").toLowerCase();
    if (!q) return materiales.slice(0, 100);
    return materiales
      .filter((m) => {
        const name = String(m.nombre || "").toLowerCase();
        const id = String(m.id || "").toLowerCase();
        return name.includes(q) || id.includes(q);
      })
      .slice(0, 100);
  }, [materiales, materialSearch]);

  async function handleSubmit() {
    if (!coordinadorUid) return toast.error("Selecciona coordinador");
    if (!items.length) return toast.error("Agrega materiales");

    const payloadItems = items
      .map((it) => {
        const mat = materialMap.get(it.materialId);
        if (!mat) return null;
        const unidadTipo = mat.unidadTipo === "METROS" ? "METROS" : "UND";
        const und = unidadTipo === "UND" ? Math.max(0, Math.floor(toNum(it.und))) : 0;
        const metros = unidadTipo === "METROS" ? Math.max(0, toNum(it.metros)) : 0;
        const base: any = { materialId: it.materialId };
        if (unidadTipo === "UND") base.und = und;
        else base.metros = metros;
        if (canEditPrecio && it.precioInput) {
          base.precioUnitCents = resolveUnitPriceCents(it, mat);
        }
        return base;
      })
      .filter(Boolean) as any[];

    if (!payloadItems.length) return toast.error("Materiales inválidos");

    setSubmitting(true);
    try {
      const res = await crearVentaAction({
        area,
        cuadrillaId: cuadrillaId || undefined,
        coordinadorUid,
        items: payloadItems,
        observacion: observacion || undefined,
      });
      if ((res as any)?.ok) {
        toast.success("Venta registrada", { description: `ID: ${(res as any).ventaId}` });
        setItems([]);
        setSelectedMaterialId("");
        setObservacion("");
      } else {
        const msg = (res as any)?.error?.formErrors?.join(", ") || "Error al registrar venta";
        toast.error(msg);
      }
    } catch (e: any) {
      toast.error(String(e?.message || "ERROR"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded border p-3 space-y-3">
        <div className="font-medium">Despacho de Ventas ({area})</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs">Coordinador</label>
            {canEditCoordinador ? (
              <select
                value={coordinadorUid}
                onChange={(e) => {
                  const uid = e.target.value;
                  setCoordinadorUid(uid);
                  const found = coordinadores.find((c) => c.uid === uid);
                  setCoordinadorNombre(found?.label || "");
                  setCuadrillaId("");
                  setCuadrillaNombre("");
                  setCuadrillaQuery("");
                }}
                className="mt-1 w-full rounded border px-2 py-2"
              >
                <option value="">Selecciona...</option>
                {coordinadores.map((c) => (
                  <option key={c.uid} value={c.uid}>
                    {c.label}
                  </option>
                ))}
              </select>
            ) : (
              <input value={coordinadorNombre} readOnly className="mt-1 w-full rounded border px-2 py-2 bg-muted" />
            )}
          </div>
          <div>
            <label className="text-xs">Cuadrilla</label>
            <input
              value={cuadrillaQuery}
              onChange={(e) => {
                setCuadrillaQuery(e.target.value);
                setCuadrillaId("");
                setCuadrillaNombre("");
              }}
              placeholder={coordinadorUid || !canEditCoordinador ? "Escribe para buscar..." : "Selecciona coordinador primero"}
              disabled={!coordinadorUid && canEditCoordinador}
              className="mt-1 w-full rounded border px-2 py-2"
            />
            {(coordinadorUid || !canEditCoordinador) && filteredCuadrillas.length > 0 && (
              <div className="mt-2 max-h-40 overflow-auto border rounded">
                {filteredCuadrillas.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setCuadrillaId(c.id);
                      setCuadrillaNombre(c.nombre || c.id);
                      setCuadrillaQuery(c.nombre || c.id);
                    }}
                    className="w-full text-left px-2 py-1 hover:bg-muted"
                  >
                    {c.nombre || c.id} <span className="text-xs text-muted-foreground">({c.id})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs">Nombre cuadrilla</label>
            <input value={cuadrillaNombre} readOnly className="mt-1 w-full rounded border px-2 py-2 bg-muted" />
          </div>
        </div>
      </div>

      <div className="rounded border p-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="font-medium">Materiales vendibles</div>
          <div className="flex items-center gap-2">
            <label className="text-xs">Filtro área</label>
            <select
              value={materialFilterArea}
              onChange={(e) => setMaterialFilterArea(e.target.value as any)}
              className="rounded border px-2 py-1 text-xs"
            >
              <option value="ALL">Todos</option>
              <option value="INSTALACIONES">Instalaciones</option>
              <option value="AVERIAS">AVERIAS</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            value={materialSearch}
            onChange={(e) => {
              setMaterialSearch(e.target.value);
              setSelectedMaterialId("");
            }}
            placeholder="Escribe material y selecciona..."
            className="w-full rounded border px-2 py-2"
            list="vendibles-list"
          />
          <datalist id="vendibles-list">
            {filteredMateriales.map((m) => (
              <option key={m.id} value={m.nombre || m.id} />
            ))}
          </datalist>
          <button
            type="button"
            onClick={() => {
              const byId = materialMap.get(materialSearch.trim());
              const byName = materialByName.get(materialSearch.trim().toLowerCase());
              const mat = byId || byName;
              if (!mat) return toast.error("Material no encontrado");
              setSelectedMaterialId(mat.id);
              setMaterialSearch(mat.nombre || mat.id);
              addMaterial(mat.id);
            }}
            className="rounded bg-blue-600 px-3 py-2 text-white hover:bg-blue-700"
          >
            Agregar
          </button>
        </div>

        {items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border rounded">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-3 py-2">Material</th>
                  <th className="text-left px-3 py-2">Unidad</th>
                  <th className="text-left px-3 py-2">Cantidad</th>
                  <th className="text-left px-3 py-2">Precio</th>
                  <th className="text-left px-3 py-2">Subtotal</th>
                  <th className="text-right px-3 py-2">Acción</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const mat = materialMap.get(it.materialId);
                  if (!mat) return null;
                  const unidad = mat.unidadTipo === "METROS" ? "METROS" : "UND";
                  const subtotal = calcSubtotal(it, mat);
                  const defaultPrice =
                    unidad === "METROS"
                      ? centsPerCmToPricePerMeter(Math.max(0, Math.floor(mat.precioPorCmCents || 0)))
                      : centsToMoney(Math.max(0, Math.floor(mat.precioUndCents || 0)));
                  return (
                    <tr key={it.materialId} className="border-t">
                      <td className="px-3 py-2">{mat.nombre || it.materialId}</td>
                      <td className="px-3 py-2">{unidad}</td>
                      <td className="px-3 py-2">
                        {unidad === "UND" ? (
                          <input
                            value={it.und}
                            onChange={(e) =>
                              setItems((prev) =>
                                prev.map((p) =>
                                  p.materialId === it.materialId ? { ...p, und: e.target.value.replace(/\D/g, "") } : p
                                )
                              )
                            }
                            className="w-24 rounded border px-2 py-1"
                            inputMode="numeric"
                          />
                        ) : (
                          <input
                            value={it.metros}
                            onChange={(e) =>
                              setItems((prev) =>
                                prev.map((p) =>
                                  p.materialId === it.materialId ? { ...p, metros: e.target.value } : p
                                )
                              )
                            }
                            className="w-24 rounded border px-2 py-1"
                            inputMode="decimal"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {canEditPrecio ? (
                          <input
                            value={it.precioInput}
                            onChange={(e) =>
                              setItems((prev) =>
                                prev.map((p) =>
                                  p.materialId === it.materialId ? { ...p, precioInput: e.target.value } : p
                                )
                              )
                            }
                            placeholder={defaultPrice}
                            className="w-28 rounded border px-2 py-1"
                            inputMode="decimal"
                          />
                        ) : (
                          <span>{defaultPrice}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">{centsToMoney(subtotal)}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeMaterial(it.materialId)}
                          className="text-red-600 hover:underline"
                        >
                          Quitar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <div className="w-full">
            <label className="text-xs">Observación</label>
            <input
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-2"
              placeholder="Observación (opcional)"
            />
          </div>
          <div className="text-sm font-medium">Total: {centsToMoney(totalCents)}</div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => startTransition(() => { void handleSubmit(); })}
          disabled={submitting}
          className="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
        >
          {submitting ? "Registrando..." : "Registrar venta"}
        </button>
      </div>
    </div>
  );
}
