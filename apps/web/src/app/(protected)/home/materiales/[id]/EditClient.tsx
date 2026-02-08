"use client";

import React from "react";
import { useActionState, useEffect, useMemo, useState, startTransition } from "react";
import { toast } from "sonner";
import { updateMaterialAction } from "../actions";

export default function EditClient({ initial }: { initial: any }) {
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? "");
  const [unidadTipo] = useState<"UND" | "METROS">(initial?.unidadTipo ?? "UND");
  const [areas, setAreas] = useState<string[]>(initial?.areas ?? []);
  const [vendible, setVendible] = useState<boolean>(!!initial?.vendible);

  const [metrosPorUnd, setMetrosPorUnd] = useState<string>(initial?.unidadTipo === "METROS" ? String((initial?.metrosPorUndCm ?? 0) / 100) : "");
  const [precioPorMetro, setPrecioPorMetro] = useState<string>(
    initial?.unidadTipo === "METROS" && initial?.precioPorCmCents != null ? String(((initial?.precioPorCmCents ?? 0) * 100) / 10000) : ""
  );
  const [minUndUi, setMinUndUi] = useState<string>("");
  const [minMetrosSueltosUi, setMinMetrosSueltosUi] = useState<string>("");
  const [stockMetros, setStockMetros] = useState<string>(initial?.unidadTipo === "METROS" && initial?.stockMetros != null ? String(initial?.stockMetros) : "");

  const [precioUnd, setPrecioUnd] = useState<string>(initial?.unidadTipo === "UND" && initial?.precioUndCents != null ? String((initial?.precioUndCents ?? 0) / 100) : "");
  const [minStockUnd, setMinStockUnd] = useState<string>(initial?.unidadTipo === "UND" && initial?.minStockUnd != null ? String(initial?.minStockUnd) : "");
  const [stockUnd, setStockUnd] = useState<string>(initial?.unidadTipo === "UND" && initial?.stockUnd != null ? String(initial?.stockUnd) : "");

  const [result, action, pending] = useActionState(updateMaterialAction as any, null as any);

  useEffect(() => {
    if (!result) return;
    if ((result as any).ok) {
      toast.success("Material actualizado");
    } else {
      const msg = (result as any)?.error?.formErrors?.join(", ") || "Error al actualizar";
      toast.error(msg);
    }
  }, [result]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const toNum = (v: string) => Number(String(v ?? "").replace(",", "."));
    const fd = new FormData();
    fd.set("id", initial.id);
    fd.set("nombre", nombre);
    fd.set("descripcion", descripcion);
    fd.set("unidadTipo", unidadTipo);
    fd.set("areas", JSON.stringify(areas));
    fd.set("vendible", vendible ? "true" : "false");
    if (unidadTipo === "UND") {
      if (precioUnd) fd.set("precioUnd", String(toNum(precioUnd)));
      if (minStockUnd) fd.set("minStockUnd", String(toNum(minStockUnd)));
      if (stockUnd !== "") fd.set("stockUnd", String(toNum(stockUnd)));
    } else {
      if (metrosPorUnd) fd.set("metrosPorUnd", String(toNum(metrosPorUnd)));
      if (vendible && precioPorMetro) fd.set("precioPorMetro", String(toNum(precioPorMetro)));
      // Opción B: mínimo como UND + metros sueltos
      const und = Math.max(0, Math.floor(Number(minUndUi || "0")));
      const mpo = toNum(metrosPorUnd || "0");
      const sueltos = Math.max(0, toNum(minMetrosSueltosUi || "0"));
      const totalMetros = und * mpo + sueltos;
      if (totalMetros > 0) fd.set("minStockMetros", String(totalMetros));
      if (stockMetros !== "") fd.set("stockMetros", String(toNum(stockMetros)));
    }
    startTransition(() => (action as any)(fd));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium">ID</label>
          <input value={initial.id} className="mt-1 w-full rounded border px-2 py-1 font-mono bg-muted" readOnly />
        </div>
        <div>
          <label className="block text-sm font-medium">Unidad</label>
          <input value={unidadTipo} className="mt-1 w-full rounded border px-2 py-1 bg-muted" readOnly />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium">Nombre</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value.toUpperCase())} className="mt-1 w-full rounded border px-2 py-1" />
      </div>

      <div>
        <label className="block text-sm font-medium">Descripción</label>
        <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="mt-1 w-full rounded border px-2 py-1" rows={3} />
      </div>

      <div>
        <label className="block text-sm font-medium">Áreas</label>
        <div className="mt-1 flex gap-4 text-sm">
          {[
            { key: "INSTALACIONES", label: "INSTALACIONES" },
            { key: "AVERIAS", label: "AVERIAS" },
          ].map((a) => (
            <label key={a.key} className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={areas.includes(a.key)}
                onChange={(e) => {
                  setAreas((prev) => (e.target.checked ? Array.from(new Set([...prev, a.key])) : prev.filter((x) => x !== a.key)));
                }}
              />
              {a.label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={vendible} onChange={(e) => setVendible(e.target.checked)} />
          Material vendible (aplica precios)
        </label>
      </div>

      {unidadTipo === "METROS" && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium">1 UND = (metros)</label>
              <input value={metrosPorUnd} onChange={(e) => setMetrosPorUnd(e.target.value)} className="mt-1 w-full rounded border px-2 py-1" inputMode="decimal" />
            </div>
            <div>
              <label className="block text-sm font-medium">Stock actual (metros)</label>
              <input value={stockMetros} onChange={(e) => setStockMetros(e.target.value)} className="mt-1 w-full rounded border px-2 py-1" inputMode="decimal" />
            </div>
            {vendible && (
              <div>
                <label className="block text-sm font-medium">Precio por metro (moneda)</label>
                <input value={precioPorMetro} onChange={(e) => setPrecioPorMetro(e.target.value)} className="mt-1 w-full rounded border px-2 py-1" inputMode="decimal" />
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium">Mínimo (UND)</label>
              <input value={minUndUi} onChange={(e) => setMinUndUi(e.target.value)} className="mt-1 w-full rounded border px-2 py-1" inputMode="numeric" />
            </div>
            <div>
              <label className="block text-sm font-medium">Metros sueltos</label>
              <input value={minMetrosSueltosUi} onChange={(e) => setMinMetrosSueltosUi(e.target.value)} className="mt-1 w-full rounded border px-2 py-1" inputMode="decimal" />
            </div>
          </div>
        </div>
      )}

      {unidadTipo === "UND" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {vendible && (
            <div>
              <label className="block text-sm font-medium">Precio por UND (moneda)</label>
              <input value={precioUnd} onChange={(e) => setPrecioUnd(e.target.value)} className="mt-1 w-full rounded border px-2 py-1" inputMode="decimal" />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium">Mínimo (UND)</label>
            <input value={minStockUnd} onChange={(e) => setMinStockUnd(e.target.value)} className="mt-1 w-full rounded border px-2 py-1" inputMode="numeric" />
          </div>
          <div>
            <label className="block text-sm font-medium">Stock actual (UND)</label>
            <input value={stockUnd} onChange={(e) => setStockUnd(e.target.value)} className="mt-1 w-full rounded border px-2 py-1" inputMode="numeric" />
          </div>
        </div>
      )}

      <div className="pt-2">
        <button type="submit" disabled={pending} className="rounded bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-50">
          {pending ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
