"use client";

import React from "react";
import { useEffect, useMemo, useRef, useState, useActionState, startTransition } from "react";
import { toast } from "sonner";
import { createMaterialAction } from "./actions";

type CreateResult = Awaited<ReturnType<typeof createMaterialAction>>;

function stripDiacritics(input: string): string {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ñ/gi, (m) => (m === "ñ" ? "n" : "N"));
}

function toId(nombre: string): string {
  const up = stripDiacritics(String(nombre ?? "").trim().toUpperCase());
  const cleaned = up.replace(/[^A-Z0-9 _]+/g, " ");
  const singleSp = cleaned.replace(/\s+/g, " ").trim();
  return singleSp.replace(/\s+/g, "_").replace(/_+/g, "_");
}

export default function CreateMaterialClient() {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [unidadTipo, setUnidadTipo] = useState<"UND" | "METROS">("UND");
  const [areas, setAreas] = useState<string[]>([]);
  const [vendible, setVendible] = useState(false);

  const [metrosPorUnd, setMetrosPorUnd] = useState<string>("");
  const [precioPorMetro, setPrecioPorMetro] = useState<string>("");
  // Opción B: mínimo expresado como UND + metros sueltos (solo UI)
  const [minUndUi, setMinUndUi] = useState<string>("");
  const [minMetrosSueltosUi, setMinMetrosSueltosUi] = useState<string>("");

  const [precioUnd, setPrecioUnd] = useState<string>("");
  const [minStockUnd, setMinStockUnd] = useState<string>("");

  const matId = useMemo(() => toId(nombre), [nombre]);

  const [result, action, pending] = useActionState(createMaterialAction as any, null as any);

  useEffect(() => {
    if (!result) return;
    if ((result as any).ok) {
      toast.success("Material creado", { description: `ID: ${(result as any).id}` });
      // reset parcial
      setNombre("");
      setDescripcion("");
      setVendible(false);
      setPrecioUnd("");
      setPrecioPorMetro("");
      setMinStockUnd("");
      setMinUndUi("");
      setMinMetrosSueltosUi("");
      setMetrosPorUnd("");
      setAreas([]);
      setUnidadTipo("UND");
    } else {
      const msg = (result as any)?.error?.formErrors?.join(", ") || "Error al crear";
      toast.error(msg);
    }
  }, [result]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("nombre", nombre);
    fd.set("descripcion", descripcion);
    fd.set("unidadTipo", unidadTipo);
    fd.set("areas", JSON.stringify(areas));
    fd.set("vendible", vendible ? "true" : "false");
    if (unidadTipo === "UND") {
      if (precioUnd) fd.set("precioUnd", String(Number(precioUnd)));
      if (minStockUnd) fd.set("minStockUnd", String(Number(minStockUnd)));
    } else {
      const toNum = (v: string) => Number(String(v ?? "").replace(",", "."));
      if (metrosPorUnd) fd.set("metrosPorUnd", String(toNum(metrosPorUnd)));
      if (precioPorMetro) fd.set("precioPorMetro", String(toNum(precioPorMetro)));
      // Opción B: calcular minStockMetros = UND * metrosPorUnd + metros sueltos
      const und = Math.max(0, Math.floor(Number(minUndUi || "0")));
      const mpo = toNum(metrosPorUnd || "0");
      const sueltos = Math.max(0, toNum(minMetrosSueltosUi || "0"));
      const totalMetros = und * mpo + sueltos;
      if (totalMetros > 0) fd.set("minStockMetros", String(totalMetros));
    }
    startTransition(() => (action as any)(fd));
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xl font-semibold">Crear Material</div>
        <div className="text-sm text-muted-foreground">Define el material con una sola unidad canónica (UND o METROS)</div>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Nombre</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value.toUpperCase())} className="mt-1 w-full rounded border px-2 py-1" />
          <div className="mt-1 text-xs text-muted-foreground">ID generado: <span className="font-mono">{matId || "(vacío)"}</span></div>
        </div>

        <div>
          <label className="block text-sm font-medium">Descripción (opcional)</label>
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
          <label className="block text-sm font-medium">Unidad de medida</label>
          <div className="mt-1 flex gap-4 text-sm">
            {["UND", "METROS"].map((u) => (
              <label key={u} className="inline-flex items-center gap-2">
                <input type="radio" name="unidad" checked={unidadTipo === u} onChange={() => setUnidadTipo(u as any)} />
                {u}
              </label>
            ))}
          </div>
        </div>

        {unidadTipo === "METROS" && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium">1 UND = (metros)</label>
                <input value={metrosPorUnd} onChange={(e) => setMetrosPorUnd(e.target.value)} className="mt-1 w-full rounded border px-2 py-1" inputMode="decimal" />
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
                <input
                  value={minUndUi}
                  onChange={(e) => {
                    const v = e.target.value;
                    // Solo enteros para UND
                    const n = Math.max(0, Math.floor(Number(String(v).replace(",", ".") || "0")));
                    setMinUndUi(String(Number.isFinite(n) ? n : 0));
                  }}
                  className="mt-1 w-full rounded border px-2 py-1"
                  inputMode="numeric"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Metros sueltos</label>
                <input
                  value={minMetrosSueltosUi}
                  onChange={(e) => setMinMetrosSueltosUi(e.target.value)}
                  className="mt-1 w-full rounded border px-2 py-1"
                  inputMode="decimal"
                />
              </div>
            </div>

            <PreviewMinimo metrosPorUnd={metrosPorUnd} und={minUndUi} sueltos={minMetrosSueltosUi} />
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
          </div>
        )}

        <div>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={vendible} onChange={(e) => setVendible(e.target.checked)} />
            Material vendible (aplica precios)
          </label>
        </div>

        <div className="pt-2 flex gap-2">
          <button type="submit" disabled={pending} className="rounded bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-50">
            {pending ? "Guardando..." : "Guardar"}
          </button>
          <button
            type="button"
            disabled={pending}
            className="rounded border px-3 py-2 hover:bg-muted"
            onClick={() => {
              setNombre("");
              setDescripcion("");
              setVendible(false);
              setPrecioUnd("");
              setPrecioPorMetro("");
              setMinStockUnd("");
              setMinUndUi("");
              setMinMetrosSueltosUi("");
              setMetrosPorUnd("");
              setAreas([]);
              setUnidadTipo("UND");
            }}
          >
            Limpiar
          </button>
        </div>
      </form>
    </div>
  );
}

function PreviewMinimo({ metrosPorUnd, und, sueltos }: { metrosPorUnd: string; und: string; sueltos: string }) {
  const toNum = (v: string) => Number(String(v ?? "").replace(",", "."));
  const mpo = toNum(metrosPorUnd || "0");
  const undN = Math.max(0, Math.floor(Number(und || "0")));
  const su = Math.max(0, toNum(sueltos || "0"));
  const total = undN * (Number.isFinite(mpo) ? mpo : 0) + (Number.isFinite(su) ? su : 0);
  if (!mpo || total <= 0) return null;
  return <div className="text-xs text-muted-foreground">Se guardará como {total} metros</div>;
}
