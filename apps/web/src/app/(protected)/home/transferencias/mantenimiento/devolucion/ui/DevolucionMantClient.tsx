"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import QRCode from "qrcode";
import { devolverMantenimientoAction } from "../actions";

type CuadrillaOpt = { id: string; nombre: string };

type StockItem = {
  id: string;
  nombre?: string;
  tipo?: string;
  cantidad?: number;
  metros?: number;
};

type ItemState = {
  materialId: string;
  und: string;
  metros: string;
};

type ActionState =
  | null
  | { ok: false; error: { formErrors?: string[] } }
  | {
      ok: true;
      guia?: string;
      cuadrillaNombre?: string;
      coordinadorNombre?: string;
      tecnicosNombres?: string[];
      usuarioNombre?: string;
    };

type GuiaData = {
  fechaStr?: string;
  usuario?: string;
  cuadrilla?: string;
  coordinador?: string;
  tecnicos?: string[];
  observacion?: string;
  materiales?: Record<string, number>;
  qrDataUrl?: string;
};

function shortName(full: string, fallback: string) {
  const parts = String(full || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return fallback;
  const first = parts[0] || "";
  const firstLast = parts.length >= 4 ? parts[2] || "" : parts[1] || "";
  return `${first} ${firstLast}`.trim() || fallback;
}

function stripCuadrillaPrefix(name: string) {
  return String(name || "")
    .trim()
    .replace(/^MANTENIMIENTO\s+/i, "")
    .trim();
}

function normalizePhone(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  const noPrefix =
    digits.startsWith("51") && digits.length >= 11 ? digits.slice(2) : digits;
  return noPrefix.length >= 9 ? noPrefix : "";
}

async function obtenerCelularesByUid(uids: string[] = []) {
  if (!uids.length) return [];
  const qs = encodeURIComponent(uids.join(","));
  const res = await fetch(`/api/usuarios/phones?uids=${qs}`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  const items = Array.isArray(data?.items) ? data.items : [];
  const celulares = items
    .map((it: any) => normalizePhone(String(it?.celular || "")))
    .filter(Boolean);
  return Array.from(new Set(celulares));
}

async function enviarGuiaPorWhatsApp(args: {
  coordinadorUid: string;
  tipoGuia: string;
  guiaId: string;
  cuadrilla: string;
  tecnicosNombres: string[];
  coordinador: string;
  usuario: string;
  fechaHora: string;
  urlComprobante: string;
  extraInfo?: string;
}) {
  const celulares = await obtenerCelularesByUid([args.coordinadorUid]);
  if (!celulares.length) return { total: 0 };
  const lines: string[] = [];
  lines.push(`*${args.tipoGuia}*`);
  lines.push(`Guia: ${args.guiaId}`);
  lines.push(`Cuadrilla: ${args.cuadrilla}`);
  if (args.coordinador) lines.push(`Coordinador: ${args.coordinador}`);
  if (args.tecnicosNombres.length) lines.push(`Tecnicos: ${args.tecnicosNombres.join(", ")}`);
  if (args.usuario) lines.push(`Registrado por: ${args.usuario}`);
  if (args.fechaHora) lines.push(`Fecha/Hora: ${args.fechaHora}`);
  if (args.extraInfo) lines.push(args.extraInfo);
  lines.push("Puedes ver el comprobante aqui:");
  lines.push(args.urlComprobante);
  const mensaje = lines.join("\n");
  const numero = celulares[0];
  try {
    const url = `https://wa.me/51${numero}?text=${encodeURIComponent(mensaje)}`;
    const win = window.open(url, "_blank");
    if (win) win.opener = null;
  } catch {}
  return { total: 1 };
}

async function makeQrDataUrl(value: string) {
  return QRCode.toDataURL(value, { errorCorrectionLevel: "H", margin: 0, width: 300 });
}

function printThermalBlobTwice(pdf: jsPDF) {
  const blob = pdf.output("blob");
  const urlBlob = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.src = urlBlob;
  document.body.appendChild(iframe);
  iframe.onload = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.contentWindow?.print(), 1000);
  };
  setTimeout(() => {
    try { document.body.removeChild(iframe); } catch {}
    URL.revokeObjectURL(urlBlob);
  }, 15000);
  return blob;
}

function generarPDFTermico80mm(guiaId: string, data: GuiaData) {
  const items = Object.entries(data.materiales || {});
  const rowCount = Math.max(1, items.length);
  const altura = Math.max(120, 105 + rowCount * 5 + (data.qrDataUrl ? 48 : 0));
  const pdf = new jsPDF({ unit: "mm", format: [80, altura] });
  const C = { align: "center" as const };
  let y = 10;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text("CONSTRUCCION DE REDES M&D S.A.C", 40, y, C);
  y += 5;
  pdf.text("RUC: 20601345979", 40, y, C);
  y += 5;
  pdf.text("Cal. Juan Prado de Zela Mza. F2 Lt. 3", 40, y, C);
  y += 5;
  pdf.text("Apv. San Francisco de Cayran", 40, y, C);
  y += 5;
  pdf.text("Cel/WSP: 913 637 815", 40, y, C);
  y += 7;

  pdf.setFont("helvetica", "bold");
  pdf.text(`GUIA: ${guiaId}`, 40, y, C);
  y += 5;
  pdf.setFont("helvetica", "normal");
  pdf.text(`FECHA: ${data.fechaStr || new Date().toLocaleString("es-PE")}`, 40, y, C);
  y += 5;
  pdf.text(`USUARIO: ${data.usuario || "-"}`, 40, y, C);
  y += 5;
  pdf.setFont("helvetica", "bold");
  pdf.text(`CUADRILLA: ${data.cuadrilla || "-"}`, 40, y, C);
  y += 5;
  pdf.text(`COORDINADOR: ${data.coordinador || "-"}`, 40, y, C);
  y += 5;
  pdf.setFont("helvetica", "normal");
  (data.tecnicos || []).forEach((t, i) => {
    pdf.text(`TECNICO ${i + 1}: ${t}`, 40, y, C);
    y += 5;
  });

  y += 3;
  pdf.setFont("helvetica", "bold");
  pdf.text("DEVOLUCION", 40, y, C);
  y += 6;
  pdf.setFont("helvetica", "normal");

  if (items.length) {
    pdf.setFontSize(8);
    items.forEach(([k, v]) => {
      pdf.text(`${k.replaceAll("_", " ")}: ${v}`, 6, y);
      y += 4;
    });
    pdf.setFontSize(9);
  }

  const obs = String(data.observacion || "");
  const obsLines = obs ? pdf.splitTextToSize(`OBS: ${obs}`, 72) : ["OBS: -"];
  pdf.text(obsLines as any, 4, y);
  y += obsLines.length * 4 + 2;

  if (data.qrDataUrl) {
    pdf.addImage(data.qrDataUrl, "PNG", 20, y, 40, 40);
    y += 45;
  }

  y += 6;
  pdf.line(10, y, 40, y);
  pdf.line(45, y, 75, y);
  y += 8;
  const firmaTec = (data.tecnicos || [])[0] || "Tecnico";
  const firmaAlm = data.usuario || "Almacen";
  pdf.text(firmaTec, 25, y, { align: "center" });
  pdf.text(firmaAlm, 60, y, { align: "center" });

  return pdf;
}

function buildResumenDisplay(items: ItemState[], stockByMaterial: Map<string, StockItem>) {
  const out: Record<string, number> = {};
  items.forEach((it) => {
    const stock = stockByMaterial.get(it.materialId);
    const unidad = (stock?.tipo || "UND").toUpperCase();
    const nombre = stock?.nombre || it.materialId;
    if (unidad === "METROS") {
      const n = Math.max(0, Number(it.metros || 0));
      if (n > 0) out[nombre] = (out[nombre] || 0) + n;
    } else {
      const n = Math.max(0, Math.floor(Number(it.und || 0)));
      if (n > 0) out[nombre] = (out[nombre] || 0) + n;
    }
  });
  return out;
}

function buildResumenRows(items: ItemState[], stockByMaterial: Map<string, StockItem>) {
  return items
    .map((it) => {
      const stock = stockByMaterial.get(it.materialId);
      const unidad = (stock?.tipo || "UND").toUpperCase();
      const cantidad =
        unidad === "METROS"
          ? Math.max(0, Number(it.metros || 0))
          : Math.max(0, Math.floor(Number(it.und || 0)));
      return { id: it.materialId, nombre: stock?.nombre || it.materialId, unidad, cantidad };
    })
    .filter((r) => r.cantidad > 0);
}

function getValidationError(items: ItemState[], stockByMaterial: Map<string, StockItem>) {
  if (!items.length) return "Agrega al menos un material a devolver";
  for (const it of items) {
    const stock = stockByMaterial.get(it.materialId);
    const unidad = (stock?.tipo || "UND").toUpperCase();
    if (unidad === "METROS") {
      const n = Number(it.metros || 0);
      if (!Number.isFinite(n) || n <= 0)
        return `Cantidad invalida en ${stock?.nombre || it.materialId}`;
      if (n > Number(stock?.metros || 0))
        return `Cantidad excede el stock disponible en: ${stock?.nombre || it.materialId}`;
    } else {
      const n = Math.floor(Number(it.und || 0));
      if (!Number.isFinite(n) || n <= 0)
        return `Cantidad invalida en ${stock?.nombre || it.materialId}`;
      if (n > Number(stock?.cantidad || 0))
        return `Cantidad excede el stock disponible en: ${stock?.nombre || it.materialId}`;
    }
  }
  return "";
}

export default function DevolucionMantClient() {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [state, action, pending] = useActionState<ActionState, FormData>(
    devolverMantenimientoAction as any,
    null
  );
  const formError =
    state && !state.ok ? (state.error?.formErrors || [])[0] : undefined;

  const [step, setStep] = useState<1 | 2>(1);
  const [cuadrillas, setCuadrillas] = useState<CuadrillaOpt[]>([]);
  const [cuadrillasLoading, setCuadrillasLoading] = useState(false);
  const [comboOpen, setComboOpen] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const [cuadrillaId, setCuadrillaId] = useState("");
  const [cuadrillaNombre, setCuadrillaNombre] = useState("");
  const [coordinador, setCoordinador] = useState("");
  const [coordinadorUid, setCoordinadorUid] = useState("");
  const [tecnicos, setTecnicos] = useState<string[]>([]);

  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockSearch, setStockSearch] = useState("");

  const [usuarioNombre, setUsuarioNombre] = useState("");
  const [observacion, setObservacion] = useState("");
  const [items, setItems] = useState<ItemState[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  const printedGuiaRef = useRef<string | null>(null);

  // Carga lista de cuadrillas y usuario actual
  useEffect(() => {
    (async () => {
      try {
        setCuadrillasLoading(true);
        const [qRes, meRes] = await Promise.all([
          fetch("/api/cuadrillas/list?area=MANTENIMIENTO", { cache: "no-store" }),
          fetch("/api/auth/me", { cache: "no-store" }),
        ]);
        const [qBody, meBody] = await Promise.all([
          qRes.json().catch(() => ({})),
          meRes.json().catch(() => ({})),
        ]);
        setCuadrillas(Array.isArray(qBody?.items) ? qBody.items : []);
        if (meBody?.ok && meBody?.nombre)
          setUsuarioNombre(shortName(String(meBody.nombre), ""));
      } catch {
        toast.error("No se pudo cargar el catalogo de cuadrillas");
      } finally {
        setCuadrillasLoading(false);
      }
    })();
  }, []);

  const stockByMaterial = useMemo(
    () => new Map(stockItems.map((s) => [s.id, s])),
    [stockItems]
  );

  const stockFiltrado = useMemo(() => {
    const q = stockSearch.trim().toLowerCase();
    const conStock = stockItems.filter((s) =>
      s.tipo?.toUpperCase() === "METROS"
        ? Number(s.metros || 0) > 0
        : Number(s.cantidad || 0) > 0
    );
    if (!q) return conStock;
    return conStock.filter((s) =>
      `${s.id} ${s.nombre || ""}`.toLowerCase().includes(q)
    );
  }, [stockItems, stockSearch]);

  const cuadrillasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return cuadrillas;
    return cuadrillas
      .filter((c) => `${c.id} ${c.nombre || ""}`.toLowerCase().includes(q))
      .slice(0, 50);
  }, [busqueda, cuadrillas]);

  async function cargarStockCuadrilla(id: string) {
    setStockLoading(true);
    try {
      const res = await fetch(
        `/api/mantenimiento/cuadrillas/stock-materiales?cuadrillaId=${encodeURIComponent(id)}`,
        { cache: "no-store" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Error al cargar stock");
      setCuadrillaNombre(String(data.cuadrilla?.nombre || id));
      setCoordinadorUid(String(data.cuadrilla?.coordinadorUid || ""));
      setCoordinador(shortName(String(data.cuadrilla?.coordinadorNombre || ""), ""));
      const techNames = Array.isArray(data.cuadrilla?.tecnicosNombres)
        ? data.cuadrilla.tecnicosNombres
            .map((n: any) => shortName(String(n || ""), ""))
            .filter(Boolean)
        : [];
      setTecnicos(techNames);
      setStockItems(Array.isArray(data.materiales) ? data.materiales : []);
    } finally {
      setStockLoading(false);
    }
  }

  async function handleNext() {
    if (!cuadrillaId) return toast.error("Selecciona una cuadrilla");
    try {
      await cargarStockCuadrilla(cuadrillaId);
      setStep(2);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo cargar el stock de la cuadrilla");
    }
  }

  function addItem(id: string) {
    const materialId = id.trim();
    if (!materialId) return;
    if (items.some((i) => i.materialId === materialId)) {
      toast.error("Ese material ya esta en la lista");
      return;
    }
    setItems((prev) => [...prev, { materialId, und: "", metros: "" }]);
    setStockSearch("");
  }

  function removeItem(materialId: string) {
    setItems((prev) => prev.filter((i) => i.materialId !== materialId));
  }

  function handlePreview() {
    if (!cuadrillaId) return toast.error("Selecciona una cuadrilla");
    const err = getValidationError(items, stockByMaterial);
    if (err) return toast.error(err);
    setShowPreview(true);
  }

  function resetForm() {
    setStep(1);
    setCuadrillaId("");
    setCuadrillaNombre("");
    setCoordinador("");
    setCoordinadorUid("");
    setTecnicos([]);
    setStockItems([]);
    setStockSearch("");
    setObservacion("");
    setItems([]);
    setShowPreview(false);
    setBusqueda("");
    setComboOpen(false);
  }

  // Efecto post-acción
  useEffect(() => {
    if (!state) return;
    if ((state as any).ok) {
      const guia = (state as any).guia;
      toast.success("Devolucion registrada", {
        description: guia ? `Guia: ${guia}` : undefined,
      });
      if (guia && printedGuiaRef.current !== guia) {
        printedGuiaRef.current = guia;
        (async () => {
          const ok = await imprimirGuiaTermica();
          if (ok) resetForm();
        })();
      }
    } else {
      const msg =
        (state as any)?.error?.formErrors?.join(", ") || "Error en devolucion";
      toast.error(msg);
    }
  }, [state]);

  async function imprimirGuiaTermica(): Promise<boolean> {
    const guia = (state as any)?.guia;
    if (!guia) return false;

    const resumen = buildResumenDisplay(items, stockByMaterial);
    const cuadrillaNombrePrint = stripCuadrillaPrefix(
      (state as any)?.cuadrillaNombre || cuadrillaNombre || cuadrillaId
    );

    const data: GuiaData = {
      fechaStr: new Date().toLocaleString("es-PE"),
      usuario: (state as any)?.usuarioNombre || usuarioNombre || "",
      cuadrilla: cuadrillaNombrePrint || cuadrillaId,
      coordinador: (state as any)?.coordinadorNombre || coordinador || "",
      tecnicos: (state as any)?.tecnicosNombres || tecnicos,
      observacion: observacion || "",
      materiales: resumen,
    };

    const token =
      typeof crypto?.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "";
    const path = `guias/mantenimiento/devolucion/${guia}.pdf`;
    const encodedPath = encodeURIComponent(path);
    const directUrl = bucket
      ? `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${token}`
      : "";

    if (directUrl) {
      try {
        data.qrDataUrl = await makeQrDataUrl(directUrl);
      } catch {}
    }

    const pdf = generarPDFTermico80mm(guia, data);

    try {
      const blob = pdf.output("blob");
      const res = await fetch(
        `/api/transferencias/mantenimiento/guia/upload?guiaId=${encodeURIComponent(guia)}&tipo=devolucion&token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "content-type": "application/pdf" },
          body: await blob.arrayBuffer(),
        }
      );
      if (!res.ok) throw new Error("UPLOAD_FAILED");

      printThermalBlobTwice(pdf);

      if (directUrl && coordinadorUid) {
        try {
          const rows = buildResumenRows(items, stockByMaterial);
          const matsLine = rows.length
            ? `Materiales: ${rows.map((r) => `${r.nombre}: ${r.cantidad} ${r.unidad}`).join(", ")}`
            : "";
          const extraInfoParts = [matsLine, observacion ? `Obs: ${observacion}` : ""].filter(
            Boolean
          );
          await enviarGuiaPorWhatsApp({
            coordinadorUid,
            tipoGuia: "Devolucion (Mantenimiento)",
            guiaId: guia,
            cuadrilla: cuadrillaNombrePrint || cuadrillaNombre || cuadrillaId,
            tecnicosNombres: tecnicos,
            coordinador: coordinador || "",
            usuario: (state as any)?.usuarioNombre || usuarioNombre || "",
            fechaHora: data.fechaStr || new Date().toLocaleString("es-PE"),
            urlComprobante: directUrl,
            extraInfo: extraInfoParts.join("\n"),
          });
        } catch {}
      }
      return true;
    } catch {
      toast.error("No se pudo subir la guia a Storage");
      return false;
    }
  }

  const resumenRows = buildResumenRows(items, stockByMaterial);

  return (
    <form ref={formRef} action={action} className="space-y-5">
      <input type="hidden" name="cuadrillaId" value={cuadrillaId} />
      <input type="hidden" name="observacion" value={observacion} />
      <input type="hidden" name="items" value={JSON.stringify(items)} />

      {/* Stepper */}
      <div className="flex items-center gap-2">
        <div
          className={`flex items-center gap-2 ${
            step === 1
              ? "text-slate-900 dark:text-slate-100"
              : "text-emerald-700 dark:text-emerald-400"
          }`}
        >
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
              step === 1
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
            }`}
          >
            {step > 1 ? "✓" : "1"}
          </div>
          <span className="text-sm font-medium">Cuadrilla</span>
        </div>
        <div className="mx-2 h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        <div
          className={`flex items-center gap-2 ${
            step === 2
              ? "text-slate-900 dark:text-slate-100"
              : "text-slate-400 dark:text-slate-500"
          }`}
        >
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
              step === 2
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
            }`}
          >
            2
          </div>
          <span className="text-sm font-medium">Materiales</span>
        </div>
      </div>

      {/* ── PASO 1 ── */}
      {step === 1 && (
        <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Seleccionar cuadrilla
          </h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Elige la cuadrilla que devuelve materiales al almacen.
          </p>

          <div className="relative mt-4 max-w-sm">
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Buscar cuadrilla
            </label>
            <input
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setComboOpen(true);
              }}
              onFocus={() => setComboOpen(true)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              placeholder="Codigo o nombre..."
            />
            {comboOpen && (
              <div className="absolute z-20 mt-1 w-full max-h-52 overflow-auto rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-xl dark:border-slate-700 dark:bg-slate-900">
                {cuadrillasLoading && (
                  <div className="p-2 text-slate-500">Cargando...</div>
                )}
                {!cuadrillasLoading && cuadrillasFiltradas.length === 0 && (
                  <div className="p-2 text-slate-500">Sin resultados.</div>
                )}
                {!cuadrillasLoading &&
                  cuadrillasFiltradas.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCuadrillaId(c.id);
                        setBusqueda(c.nombre || "");
                        setComboOpen(false);
                      }}
                      className={`w-full rounded-lg px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 ${
                        cuadrillaId === c.id
                          ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                          : ""
                      }`}
                    >
                      {c.nombre || "Sin nombre"}
                    </button>
                  ))}
              </div>
            )}
          </div>

          {cuadrillaId && !comboOpen && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 dark:border-emerald-800/60 dark:bg-emerald-950/30">
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
              <span className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                {busqueda}
              </span>
            </div>
          )}

          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={handleNext}
              disabled={!cuadrillaId}
              className="rounded-xl bg-[#1f5f4a] px-5 py-2 text-sm font-medium text-white hover:bg-[#184c3a] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continuar
            </button>
            {!cuadrillaId && (
              <span className="text-xs text-slate-400">
                Selecciona una cuadrilla para continuar
              </span>
            )}
          </div>
        </section>
      )}

      {/* ── PASO 2 ── */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Card cuadrilla */}
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="space-y-0.5">
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Cuadrilla que devuelve
              </div>
              <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {cuadrillaNombre || cuadrillaId}
              </div>
              {coordinador && (
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  <span className="font-medium">Coordinador:</span> {coordinador}
                </div>
              )}
              {tecnicos.length > 0 && (
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  <span className="font-medium">Tecnicos:</span> {tecnicos.join(", ")}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cambiar cuadrilla
            </button>
          </div>

          <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Materiales a devolver
            </h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Selecciona materiales del stock de la cuadrilla e indica la cantidad a devolver.
            </p>

            {/* Stock de la cuadrilla */}
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Stock disponible en la cuadrilla
                </label>
                {stockLoading && (
                  <span className="text-xs text-slate-400">Cargando stock...</span>
                )}
              </div>

              {!stockLoading && stockItems.length > 0 && (
                <input
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                  className="mb-2 w-full max-w-sm rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  placeholder="Filtrar materiales..."
                />
              )}

              {!stockLoading && stockItems.length === 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300">
                  Esta cuadrilla no tiene materiales en stock para devolver.
                </div>
              )}

              {!stockLoading && stockFiltrado.length > 0 && (
                <div className="max-h-52 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/60">
                      <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        <th className="px-3 py-2">Material</th>
                        <th className="px-3 py-2 text-right">En stock</th>
                        <th className="px-3 py-2">Unidad</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {stockFiltrado.map((s) => {
                        const yaAgregado = items.some((i) => i.materialId === s.id);
                        const stockVal =
                          s.tipo?.toUpperCase() === "METROS"
                            ? `${s.metros ?? 0} m`
                            : `${s.cantidad ?? 0} und`;
                        return (
                          <tr
                            key={s.id}
                            className="border-t border-slate-100 dark:border-slate-800"
                          >
                            <td className="px-3 py-2">
                              <div className="font-medium text-slate-800 dark:text-slate-200">
                                {s.nombre || s.id}
                              </div>
                              <div className="text-xs text-slate-400">{s.id}</div>
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-700 dark:text-slate-300">
                              {stockVal}
                            </td>
                            <td className="px-3 py-2">
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                                {(s.tipo || "UND").toUpperCase()}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              {yaAgregado ? (
                                <span className="text-xs text-emerald-600 dark:text-emerald-400">
                                  Agregado
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => addItem(s.id)}
                                  className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
                                >
                                  Agregar
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Lista de items a devolver */}
            {items.length > 0 && (
              <div className="mt-5">
                <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Cantidades a devolver
                </div>
                <div className="overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/60">
                      <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        <th className="px-3 py-2.5">Material</th>
                        <th className="px-3 py-2.5">Devolver</th>
                        <th className="px-3 py-2.5">Disponible</th>
                        <th className="px-3 py-2.5">Unidad</th>
                        <th className="px-3 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it) => {
                        const stock = stockByMaterial.get(it.materialId);
                        const unidad = (stock?.tipo || "UND").toUpperCase();
                        const isMetros = unidad === "METROS";
                        const val = isMetros ? it.metros : it.und;
                        const available = isMetros
                          ? Number(stock?.metros || 0)
                          : Number(stock?.cantidad || 0);
                        const inputNum = isMetros
                          ? Number(it.metros || 0)
                          : Math.floor(Number(it.und || 0));
                        const exceeded = val !== "" && inputNum > available;
                        const isInvalid = val !== "" && inputNum <= 0;
                        return (
                          <tr
                            key={it.materialId}
                            className="border-t border-slate-100 dark:border-slate-800"
                          >
                            <td className="px-3 py-2.5">
                              <div className="font-medium text-slate-800 dark:text-slate-200">
                                {stock?.nombre || it.materialId}
                              </div>
                              <div className="text-xs text-slate-400">{it.materialId}</div>
                            </td>
                            <td className="px-3 py-2.5">
                              <input
                                value={val}
                                onChange={(e) =>
                                  setItems((prev) =>
                                    prev.map((p) =>
                                      p.materialId === it.materialId
                                        ? {
                                            ...p,
                                            und: isMetros ? p.und : e.target.value,
                                            metros: isMetros ? e.target.value : p.metros,
                                          }
                                        : p
                                    )
                                  )
                                }
                                className={`w-24 rounded-lg border px-2 py-1 text-sm ${
                                  exceeded || isInvalid
                                    ? "border-red-300 bg-red-50 dark:bg-red-950/30"
                                    : "border-slate-300 dark:border-slate-600 dark:bg-slate-900"
                                }`}
                                inputMode={isMetros ? "decimal" : "numeric"}
                                placeholder="0"
                              />
                              {exceeded && (
                                <div className="mt-0.5 text-xs text-red-500">
                                  Maximo: {available}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300">
                              {available}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                                {unidad}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <button
                                type="button"
                                onClick={() => removeItem(it.materialId)}
                                className="rounded-lg px-2 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30"
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
              </div>
            )}

            {/* Observacion */}
            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Observacion{" "}
                <span className="font-normal text-slate-400">(opcional)</span>
              </label>
              <textarea
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                rows={2}
                placeholder="Motivo u observacion de la devolucion..."
              />
            </div>

            {formError && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                {formError}
              </div>
            )}

            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={handlePreview}
                disabled={items.length === 0}
                className="rounded-xl bg-[#1f5f4a] px-5 py-2 text-sm font-medium text-white hover:bg-[#184c3a] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previsualizar devolucion
              </button>
              {items.length > 0 && (
                <span className="text-xs text-slate-500">
                  {items.length} material{items.length !== 1 ? "es" : ""} en lista
                </span>
              )}
            </div>
          </section>
        </div>
      )}

      {/* ── MODAL PREVIEW ── */}
      {showPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onClick={() => setShowPreview(false)}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Confirmar devolucion
                </h3>
                <p className="text-xs text-slate-500">
                  Revisa el resumen antes de registrar el movimiento
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cerrar
              </button>
            </div>

            <div className="space-y-4 p-5">
              {/* Info cuadrilla */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/60">
                <div className="grid gap-1 text-sm">
                  <div className="flex gap-2">
                    <span className="w-24 shrink-0 font-medium text-slate-500 dark:text-slate-400">
                      Cuadrilla
                    </span>
                    <span className="text-slate-900 dark:text-slate-100">
                      {cuadrillaNombre || "-"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-24 shrink-0 font-medium text-slate-500 dark:text-slate-400">
                      Coordinador
                    </span>
                    <span className="text-slate-900 dark:text-slate-100">
                      {coordinador || "-"}
                    </span>
                  </div>
                  {tecnicos.length > 0 && (
                    <div className="flex gap-2">
                      <span className="w-24 shrink-0 font-medium text-slate-500 dark:text-slate-400">
                        Tecnicos
                      </span>
                      <span className="text-slate-900 dark:text-slate-100">
                        {tecnicos.join(", ")}
                      </span>
                    </div>
                  )}
                  {observacion && (
                    <div className="flex gap-2">
                      <span className="w-24 shrink-0 font-medium text-slate-500 dark:text-slate-400">
                        Observacion
                      </span>
                      <span className="text-slate-900 dark:text-slate-100">{observacion}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Tabla materiales */}
              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {resumenRows.length} material{resumenRows.length !== 1 ? "es" : ""} a devolver
                </div>
                <div className="overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/60">
                      <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        <th className="px-3 py-2.5">Material</th>
                        <th className="px-3 py-2.5 text-right">Cantidad</th>
                        <th className="px-3 py-2.5">Unidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumenRows.map((row) => (
                        <tr
                          key={row.id}
                          className="border-t border-slate-100 dark:border-slate-800"
                        >
                          <td className="px-3 py-2.5 font-medium text-slate-800 dark:text-slate-200">
                            {row.nombre}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold text-slate-900 dark:text-slate-100">
                            {row.cantidad}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                              {row.unidad}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  const err = getValidationError(items, stockByMaterial);
                  if (err) return toast.error(err);
                  setShowPreview(false);
                  formRef.current?.requestSubmit();
                }}
                className="rounded-xl bg-[#1f5f4a] px-5 py-2 text-sm font-medium text-white hover:bg-[#184c3a] disabled:opacity-50"
              >
                {pending ? "Registrando..." : "Confirmar devolucion"}
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
