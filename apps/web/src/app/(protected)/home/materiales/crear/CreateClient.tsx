"use client";

import React from "react";
import { useEffect, useMemo, useRef, useState, useActionState, startTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { createMaterialAction } from "./actions";

function stripDiacritics(input: string): string {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function toId(nombre: string): string {
  const up = stripDiacritics(String(nombre ?? "").trim().toUpperCase());
  const cleaned = up.replace(/[^A-Z0-9 _]+/g, " ");
  const singleSp = cleaned.replace(/\s+/g, " ").trim();
  return singleSp.replace(/\s+/g, "_").replace(/_+/g, "_");
}

export default function CreateMaterialClient() {
  const router = useRouter();
  const defaultAreas = ["INSTALACIONES", "MANTENIMIENTO"];
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [unidadTipo, setUnidadTipo] = useState<"UND" | "METROS">("UND");
  const [areas, setAreas] = useState<string[]>(defaultAreas);
  const [vendible, setVendible] = useState(false);

  const [metrosPorUnd, setMetrosPorUnd] = useState<string>("");
  const [precioUndMetros, setPrecioUndMetros] = useState<string>("");
  const [precioPorMetro, setPrecioPorMetro] = useState<string>("");
  const [minUndUi, setMinUndUi] = useState<string>("");
  const [minMetrosSueltosUi, setMinMetrosSueltosUi] = useState<string>("");

  const [precioUnd, setPrecioUnd] = useState<string>("");
  const [minStockUnd, setMinStockUnd] = useState<string>("");
  const [stockInicialUnd, setStockInicialUnd] = useState<string>("");
  const [stockInicialUndMetros, setStockInicialUndMetros] = useState<string>("");

  const matId = useMemo(() => toId(nombre), [nombre]);

  const [result, action, pending] = useActionState(createMaterialAction as any, null as any);
  const shouldReturnRef = useRef(false);
  const [volverAlGuardar, setVolverAlGuardar] = useState(true);

  const resetForm = () => {
    setNombre("");
    setDescripcion("");
    setVendible(false);
    setPrecioUnd("");
    setPrecioUndMetros("");
    setPrecioPorMetro("");
    setMinStockUnd("");
    setMinUndUi("");
    setMinMetrosSueltosUi("");
    setMetrosPorUnd("");
    setStockInicialUnd("");
    setStockInicialUndMetros("");
    setAreas(defaultAreas);
    setUnidadTipo("UND");
  };

  useEffect(() => {
    const toNum = (v: string) => Number(String(v ?? "").replace(",", "."));
    const roundUpHalfStep = (v: number) => Math.ceil(v * 2) / 2;
    if (unidadTipo !== "METROS" || !vendible) {
      setPrecioPorMetro("");
      return;
    }
    const und = toNum(precioUndMetros || "0");
    const mpo = toNum(metrosPorUnd || "0");
    if (und > 0 && mpo > 0) {
      const calc = und / mpo;
      setPrecioPorMetro(roundUpHalfStep(calc).toFixed(2));
    } else {
      setPrecioPorMetro("");
    }
  }, [unidadTipo, vendible, precioUndMetros, metrosPorUnd]);

  useEffect(() => {
    if (!result) return;
    if ((result as any).ok) {
      toast.success("Material creado");
      if (shouldReturnRef.current) {
        shouldReturnRef.current = false;
        router.push("/home/materiales");
      } else {
        resetForm();
      }
    } else {
      const msg = (result as any)?.error?.formErrors?.join(", ") || "Error al crear";
      toast.error(msg);
      shouldReturnRef.current = false;
    }
  }, [result, router]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    shouldReturnRef.current = volverAlGuardar;

    const fd = new FormData();
    fd.set("nombre", nombre);
    fd.set("descripcion", descripcion);
    fd.set("unidadTipo", unidadTipo);
    fd.set("areas", JSON.stringify(areas));
    fd.set("vendible", vendible ? "true" : "false");
    if (unidadTipo === "UND") {
      if (precioUnd) fd.set("precioUnd", String(Number(precioUnd)));
      if (minStockUnd) fd.set("minStockUnd", String(Number(minStockUnd)));
      if (stockInicialUnd) fd.set("stockInicialUnd", String(Math.max(0, Math.floor(Number(stockInicialUnd)))));
    } else {
      const toNum = (v: string) => Number(String(v ?? "").replace(",", "."));
      if (metrosPorUnd) fd.set("metrosPorUnd", String(toNum(metrosPorUnd)));
      if (precioPorMetro) fd.set("precioPorMetro", String(toNum(precioPorMetro)));
      const stockUndInit = Math.max(0, toNum(stockInicialUndMetros || "0"));
      const mpo = toNum(metrosPorUnd || "0");
      if (stockUndInit > 0 && mpo > 0) fd.set("stockInicialMetros", String(stockUndInit * mpo));
      const und = Math.max(0, Math.floor(Number(minUndUi || "0")));
      const mpoMin = toNum(metrosPorUnd || "0");
      const sueltos = Math.max(0, toNum(minMetrosSueltosUi || "0"));
      const totalMetros = und * mpoMin + sueltos;
      if (totalMetros > 0) fd.set("minStockMetros", String(totalMetros));
    }
    startTransition(() => (action as any)(fd));
  }

  const fieldClass =
    "mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40";

  return (
    <div className="space-y-4 text-slate-900 dark:text-slate-100">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Crear material</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Completa datos basicos, unidad y reglas de stock/precio.</p>
      </section>

      <form onSubmit={onSubmit} className="space-y-4">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Datos generales</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value.toUpperCase())} className={fieldClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Codigo generado</label>
              <div className="mt-1 flex h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
                {matId || "(vacio)"}
              </div>
            </div>
            <div className="lg:col-span-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Descripcion (opcional)</label>
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40"
                rows={3}
              />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Clasificacion</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Areas</label>
              <div className="flex flex-wrap gap-3 text-sm">
                {[{ key: "INSTALACIONES", label: "INSTALACIONES" }, { key: "MANTENIMIENTO", label: "MANTENIMIENTO" }].map((a) => (
                  <label key={a.key} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700 dark:text-slate-200">
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
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Unidad de medida</label>
              <div className="flex gap-3 text-sm">
                {["UND", "METROS"].map((u) => (
                  <label key={u} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700 dark:text-slate-200">
                    <input type="radio" name="unidad" checked={unidadTipo === u} onChange={() => setUnidadTipo(u as any)} />
                    {u}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Stock y precios</h2>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={vendible} onChange={(e) => setVendible(e.target.checked)} />
              Material vendible
            </label>
          </div>

          {unidadTipo === "METROS" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Equivalencia (metros por UND)</label>
                  <input value={metrosPorUnd} onChange={(e) => setMetrosPorUnd(e.target.value)} className={fieldClass} inputMode="decimal" />
                  <p className="mt-1 text-xs text-slate-500">Ejemplo: si 1 UND equivale a 2.5 metros, escribe 2.5</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Stock inicial (UND)</label>
                  <input value={stockInicialUndMetros} onChange={(e) => setStockInicialUndMetros(e.target.value)} className={fieldClass} inputMode="decimal" />
                </div>
                {vendible && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Precio por UND</label>
                      <input value={precioUndMetros} onChange={(e) => setPrecioUndMetros(e.target.value)} className={fieldClass} inputMode="decimal" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Precio por metro (auto)</label>
                      <input value={precioPorMetro} readOnly className={`${fieldClass} bg-slate-50 dark:bg-slate-800/60`} inputMode="decimal" />
                    </div>
                  </>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Minimo (UND)</label>
                  <input
                    value={minUndUi}
                    onChange={(e) => {
                      const v = e.target.value;
                      const n = Math.max(0, Math.floor(Number(String(v).replace(",", ".") || "0")));
                      setMinUndUi(String(Number.isFinite(n) ? n : 0));
                    }}
                    className={fieldClass}
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Metros sueltos</label>
                  <input value={minMetrosSueltosUi} onChange={(e) => setMinMetrosSueltosUi(e.target.value)} className={fieldClass} inputMode="decimal" />
                </div>
              </div>
              <PreviewMinimo metrosPorUnd={metrosPorUnd} und={minUndUi} sueltos={minMetrosSueltosUi} />
            </div>
          )}

          {unidadTipo === "UND" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {vendible && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Precio por UND</label>
                  <input value={precioUnd} onChange={(e) => setPrecioUnd(e.target.value)} className={fieldClass} inputMode="decimal" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Minimo (UND)</label>
                <input value={minStockUnd} onChange={(e) => setMinStockUnd(e.target.value)} className={fieldClass} inputMode="numeric" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Stock inicial (UND)</label>
                <input value={stockInicialUnd} onChange={(e) => setStockInicialUnd(e.target.value)} className={fieldClass} inputMode="numeric" />
              </div>
            </div>
          )}
        </section>

        <div className="sticky bottom-3 z-10 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={pending} className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50">
              {pending ? "Guardando..." : "Guardar"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => router.push("/home/materiales")}
              className="h-10 rounded-lg border border-slate-300 px-4 text-sm transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Volver al listado
            </button>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={volverAlGuardar} onChange={(e) => setVolverAlGuardar(e.target.checked)} />
              Volver al guardar
            </label>
            <button type="button" disabled={pending} className="text-sm text-slate-500 underline-offset-2 hover:underline disabled:opacity-50 dark:text-slate-400" onClick={resetForm}>
              Limpiar campos
            </button>
          </div>
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
  return <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">Se guardara como {total} metros</div>;
}

