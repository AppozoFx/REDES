"use client";

import React from "react";
import { useActionState, useEffect, useRef, useState, startTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { updateMaterialAction } from "../actions";

export default function EditClient({ initial }: { initial: any }) {
  const router = useRouter();
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
  const shouldReturnRef = useRef(false);
  const [volverAlGuardar, setVolverAlGuardar] = useState(true);

  useEffect(() => {
    if (!result) return;
    if ((result as any).ok) {
      toast.success("Material actualizado");
      if (shouldReturnRef.current) {
        shouldReturnRef.current = false;
        router.push("/home/materiales");
      }
    } else {
      const msg = (result as any)?.error?.formErrors?.join(", ") || "Error al actualizar";
      toast.error(msg);
      shouldReturnRef.current = false;
    }
  }, [result, router]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    shouldReturnRef.current = volverAlGuardar;

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
      const und = Math.max(0, Math.floor(Number(minUndUi || "0")));
      const mpo = toNum(metrosPorUnd || "0");
      const sueltos = Math.max(0, toNum(minMetrosSueltosUi || "0"));
      const totalMetros = und * mpo + sueltos;
      if (totalMetros > 0) fd.set("minStockMetros", String(totalMetros));
      if (stockMetros !== "") fd.set("stockMetros", String(toNum(stockMetros)));
    }
    startTransition(() => (action as any)(fd));
  }

  const fieldClass =
    "mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Informacion base</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700">ID</label>
            <input value={initial.id} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-xs" readOnly />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Unidad</label>
            <input value={unidadTipo} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm" readOnly />
          </div>
        </div>
      </section>

      <form onSubmit={onSubmit} className="space-y-4">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Datos del material</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-slate-700">Nombre</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value.toUpperCase())} className={fieldClass} />
            </div>
            <div className="lg:col-span-3">
              <label className="block text-sm font-medium text-slate-700">Descripcion</label>
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                rows={3}
              />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Clasificacion y venta</h2>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={vendible} onChange={(e) => setVendible(e.target.checked)} />
              Material vendible
            </label>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Areas</label>
            <div className="flex flex-wrap gap-3 text-sm">
              {[{ key: "INSTALACIONES", label: "INSTALACIONES" }, { key: "AVERIAS", label: "AVERIAS" }].map((a) => (
                <label key={a.key} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
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
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Stock y precios</h2>

          {unidadTipo === "METROS" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700">1 UND = (metros)</label>
                  <input value={metrosPorUnd} onChange={(e) => setMetrosPorUnd(e.target.value)} className={fieldClass} inputMode="decimal" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Stock actual (metros)</label>
                  <input value={stockMetros} onChange={(e) => setStockMetros(e.target.value)} className={fieldClass} inputMode="decimal" />
                </div>
                {vendible && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Precio por metro</label>
                    <input value={precioPorMetro} onChange={(e) => setPrecioPorMetro(e.target.value)} className={fieldClass} inputMode="decimal" />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Minimo (UND)</label>
                  <input value={minUndUi} onChange={(e) => setMinUndUi(e.target.value)} className={fieldClass} inputMode="numeric" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Metros sueltos</label>
                  <input value={minMetrosSueltosUi} onChange={(e) => setMinMetrosSueltosUi(e.target.value)} className={fieldClass} inputMode="decimal" />
                </div>
              </div>
            </div>
          )}

          {unidadTipo === "UND" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {vendible && (
                <div>
                  <label className="block text-sm font-medium text-slate-700">Precio por UND</label>
                  <input value={precioUnd} onChange={(e) => setPrecioUnd(e.target.value)} className={fieldClass} inputMode="decimal" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700">Minimo (UND)</label>
                <input value={minStockUnd} onChange={(e) => setMinStockUnd(e.target.value)} className={fieldClass} inputMode="numeric" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Stock actual (UND)</label>
                <input value={stockUnd} onChange={(e) => setStockUnd(e.target.value)} className={fieldClass} inputMode="numeric" />
              </div>
            </div>
          )}
        </section>

        <div className="sticky bottom-3 z-10 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={pending} className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50">
              {pending ? "Guardando..." : "Guardar cambios"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => router.push("/home/materiales")}
              className="h-10 rounded-lg border border-slate-300 px-4 text-sm transition hover:bg-slate-100 disabled:opacity-50"
            >
              Volver al listado
            </button>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={volverAlGuardar} onChange={(e) => setVolverAlGuardar(e.target.checked)} />
              Volver al guardar
            </label>
          </div>
        </div>
      </form>
    </div>
  );
}
