"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import QRCode from "qrcode";
import { despacharMantenimientoAction } from "../actions";

type CuadrillaInfo = {
  nombre?: string;
  coordinadorUid?: string;
  coordinadorNombre?: string;
  tecnicosUids?: string[];
  tecnicosNombres?: string[];
};

  type CuadrillaOpt = { id: string; nombre: string };

type MaterialOpt = {
  id: string;
  nombre?: string;
  unidadTipo?: "UND" | "METROS" | null;
  vendible?: boolean;
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
  const raw = String(name || "").trim();
  if (!raw) return raw;
  return raw.replace(/^MANTENIMIENTO\s+/i, "").trim();
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
    try {
      document.body.removeChild(iframe);
    } catch {}
    URL.revokeObjectURL(urlBlob);
  }, 15000);

  return blob;
}

async function makeQrDataUrl(value: string) {
  return QRCode.toDataURL(value, {
    errorCorrectionLevel: "H",
    margin: 0,
    width: 300,
  });
}

function normalizePhone(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  const noPrefix = digits.startsWith("51") && digits.length >= 11 ? digits.slice(2) : digits;
  return noPrefix.length >= 9 ? noPrefix : "";
}

async function obtenerCelularesByUid(uids: string[] = []) {
  if (!uids.length) return [];
  const qs = encodeURIComponent(uids.join(","));
  const res = await fetch(`/api/usuarios/phones?uids=${qs}`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  const items = Array.isArray(data?.items) ? data.items : [];
  const celulares = items.map((it: any) => normalizePhone(String(it?.celular || ""))).filter(Boolean);
  return Array.from(new Set(celulares));
}

async function enviarGuiaPorWhatsAppACoordinador(args: {
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
  pdf.text("DESPACHO", 40, y, C);
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

function buildMaterialResumen(items: ItemState[], materialsById: Map<string, MaterialOpt>) {
  const resumen: Record<string, number> = {};
  items.forEach((it) => {
    const mat = materialsById.get(it.materialId);
    const unidad = (mat?.unidadTipo || "UND").toUpperCase();
    if (unidad === "METROS") {
      const n = Math.max(0, Number(it.metros || 0));
      if (n > 0) resumen[it.materialId] = (resumen[it.materialId] || 0) + n;
    } else {
      const n = Math.max(0, Math.floor(Number(it.und || 0)));
      if (n > 0) resumen[it.materialId] = (resumen[it.materialId] || 0) + n;
    }
  });
  return resumen;
}

function buildMaterialResumenDisplay(items: ItemState[], materialsById: Map<string, MaterialOpt>) {
  const base = buildMaterialResumen(items, materialsById);
  const out: Record<string, number> = {};
  Object.entries(base).forEach(([id, n]) => {
    const nombre = materialsById.get(id)?.nombre || id;
    out[nombre] = (out[nombre] || 0) + n;
  });
  return out;
}

function buildMaterialResumenRows(items: ItemState[], materialsById: Map<string, MaterialOpt>) {
  const base = buildMaterialResumen(items, materialsById);
  return Object.entries(base).map(([id, n]) => {
    const mat = materialsById.get(id);
    return {
      id,
      nombre: mat?.nombre || id,
      unidad: (mat?.unidadTipo || "UND").toUpperCase(),
      cantidad: n,
    };
  });
}

function getItemsValidationError(items: ItemState[], materialsById: Map<string, MaterialOpt>) {
  if (!items.length) return "Agrega materiales";
  for (const it of items) {
    const mat = materialsById.get(it.materialId);
    const unidad = (mat?.unidadTipo || "UND").toUpperCase();
    if (unidad === "METROS") {
      const n = Number(it.metros || 0);
      if (!Number.isFinite(n) || n <= 0) return `Cantidad invalida en ${mat?.nombre || it.materialId}`;
    } else {
      const n = Math.floor(Number(it.und || 0));
      if (!Number.isFinite(n) || n <= 0) return `Cantidad invalida en ${mat?.nombre || it.materialId}`;
    }
  }
  return "";
}

export default function DespachoMantClient() {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [state, action, pending] = useActionState<ActionState, FormData>(despacharMantenimientoAction as any, null);
  const formError = state && !state.ok ? (state.error?.formErrors || [])[0] : undefined;

  const [step, setStep] = useState<1 | 2>(1);
  const [cuadrillas, setCuadrillas] = useState<CuadrillaOpt[]>([]);
  const [cuadrillasLoading, setCuadrillasLoading] = useState(false);
  const [comboOpen, setComboOpen] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [materiales, setMateriales] = useState<MaterialOpt[]>([]);
  const [cuadrillaId, setCuadrillaId] = useState("");
  const [cuadrillaNombre, setCuadrillaNombre] = useState("");
  const [coordinador, setCoordinador] = useState("");
  const [coordinadorUid, setCoordinadorUid] = useState("");
  const [tecnicos, setTecnicos] = useState<string[]>([]);
  const [tecnicosUids, setTecnicosUids] = useState<string[]>([]);
  const [usuarioNombre, setUsuarioNombre] = useState("");
  const [observacion, setObservacion] = useState("");

  const [materialSearch, setMaterialSearch] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [items, setItems] = useState<ItemState[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  const printedGuiaRef = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setCuadrillasLoading(true);
        const [qRes, mRes] = await Promise.all([
          fetch("/api/cuadrillas/list?area=MANTENIMIENTO", { cache: "no-store" }),
          fetch("/api/materiales/list", { cache: "no-store" }),
        ]);
        const [qBody, mBody] = await Promise.all([qRes.json().catch(() => ({})), mRes.json().catch(() => ({}))]);
        setCuadrillas(Array.isArray(qBody?.items) ? qBody.items : []);
        setMateriales(Array.isArray(mBody?.items) ? mBody.items : []);
      } catch {
        toast.error("No se pudo cargar catalogos");
      } finally {
        setCuadrillasLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.ok && data?.nombre) setUsuarioNombre(shortName(String(data.nombre), ""));
      } catch {}
    })();
  }, []);

  const materialsById = useMemo(() => new Map(materiales.map((m) => [m.id, m])), [materiales]);

  async function cargarInfoCuadrilla(id: string) {
    const res = await fetch(`/api/cuadrillas/info?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as CuadrillaInfo & { ok?: boolean; error?: string };
    if (!data || (data as any).ok === false) throw new Error((data as any).error || "No se pudo obtener info");
    setCuadrillaNombre(data.nombre || id);
    const coordName = shortName(String(data.coordinadorNombre || data.coordinadorUid || ""), "");
    setCoordinador(coordName);
    setCoordinadorUid(String(data.coordinadorUid || ""));
    setTecnicosUids(Array.isArray(data.tecnicosUids) ? data.tecnicosUids : []);
    const techNames = Array.isArray(data.tecnicosNombres)
      ? data.tecnicosNombres.map((n) => shortName(String(n || ""), "")).filter(Boolean)
      : Array.isArray(data.tecnicosUids)
      ? data.tecnicosUids.map((n) => String(n))
      : [];
    setTecnicos(techNames);
  }

  function resetForm() {
    setStep(1);
    setCuadrillaId("");
    setCuadrillaNombre("");
    setCoordinador("");
    setCoordinadorUid("");
    setTecnicos([]);
    setTecnicosUids([]);
    setUsuarioNombre("");
    setObservacion("");
    setMaterialSearch("");
    setMaterialId("");
    setItems([]);
    setShowPreview(false);
    setBusqueda("");
    setComboOpen(false);
  }

  useEffect(() => {
    if (!state) return;
    if ((state as any).ok) {
      const guia = (state as any).guia;
      toast.success("Despacho registrado", { description: guia ? `Guia: ${guia}` : undefined });
      if (guia && printedGuiaRef.current !== guia) {
        printedGuiaRef.current = guia;
        (async () => {
          const ok = await imprimirGuiaTermica();
          if (ok) resetForm();
        })();
      }
    } else {
      const msg = (state as any)?.error?.formErrors?.join(", ") || "Error en despacho";
      toast.error(msg);
    }
  }, [state]);

  const materialesFiltrados = useMemo(() => {
    const q = materialSearch.trim().toLowerCase();
    if (!q) return [];
    return materiales.filter((m) => `${m.id} ${m.nombre || ""}`.toLowerCase().includes(q)).slice(0, 80);
  }, [materiales, materialSearch]);

  const cuadrillasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return cuadrillas;
    return cuadrillas.filter((c) => `${c.id} ${c.nombre || ""}`.toLowerCase().includes(q)).slice(0, 50);
  }, [busqueda, cuadrillas]);

  const addItem = (id?: string) => {
    const targetId = (id || materialId || "").trim();
    if (!targetId) return;
    if (items.some((i) => i.materialId === targetId)) {
      toast.error("Ese material ya esta agregado");
      return;
    }
    setItems((prev) => [...prev, { materialId: targetId, und: "", metros: "" }]);
    setMaterialId("");
    setMaterialSearch("");
  };

  const removeItem = (materialId: string) => setItems((prev) => prev.filter((i) => i.materialId !== materialId));

  const handleNext = async () => {
    if (!cuadrillaId) return toast.error("Selecciona una cuadrilla");
    try {
      await cargarInfoCuadrilla(cuadrillaId);
      setStep(2);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo cargar info de la cuadrilla");
    }
  };

  const handlePreview = () => {
    if (!cuadrillaId) return toast.error("Selecciona una cuadrilla");
    const err = getItemsValidationError(items, materialsById);
    if (err) return toast.error(err);
    setShowPreview(true);
  };

  async function imprimirGuiaTermica(): Promise<boolean> {
    const guia = (state as any)?.guia;
    if (!guia) return false;

    const resumen = buildMaterialResumenDisplay(items, materialsById);
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

    const token = typeof crypto?.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "";
    const path = `guias/mantenimiento/despacho/${guia}.pdf`;
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
        `/api/transferencias/mantenimiento/guia/upload?guiaId=${encodeURIComponent(guia)}&tipo=despacho&token=${encodeURIComponent(token)}`,
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
          const rows = buildMaterialResumenRows(items, materialsById);
          const matsLine = rows.length
            ? `Materiales: ${rows.map((r) => `${r.nombre}: ${r.cantidad} ${r.unidad}`).join(", ")}`
            : "";
          const extraInfoParts = [matsLine, observacion ? `Obs: ${observacion}` : ""].filter(Boolean);
          await enviarGuiaPorWhatsAppACoordinador({
            coordinadorUid,
            tipoGuia: "Despacho (Mantenimiento)",
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

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <input type="hidden" name="cuadrillaId" value={cuadrillaId} />
      <input type="hidden" name="observacion" value={observacion} />
      <input type="hidden" name="items" value={JSON.stringify(items)} />

      {step === 1 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="text-sm font-semibold text-slate-600 dark:text-slate-300">Paso 1</div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Seleccionar cuadrilla</h2>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="relative">
              <label className="text-sm text-slate-700 dark:text-slate-200">Buscar cuadrilla</label>
              <input
                value={busqueda}
                onChange={(e) => {
                  setBusqueda(e.target.value);
                  setComboOpen(true);
                }}
                onFocus={() => setComboOpen(true)}
                className="ui-input-inline ui-input"
                placeholder="Codigo o nombre"
              />
              {comboOpen && (
                <div className="absolute z-20 mt-1 w-full max-h-52 overflow-auto rounded border border-slate-200 bg-white p-1 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  {cuadrillasLoading && (
                    <div className="p-2 text-slate-500">Cargando...</div>
                  )}
                  {!cuadrillasLoading && cuadrillasFiltradas.length === 0 && (
                    <div className="p-2 text-slate-500">Sin resultados.</div>
                  )}
                  {!cuadrillasLoading && cuadrillasFiltradas.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCuadrillaId(c.id);
                        setBusqueda(c.nombre || "");
                        setComboOpen(false);
                      }}
                      className={`w-full rounded px-2 py-1 text-left hover:bg-black/5 dark:hover:bg-white/5 ${cuadrillaId === c.id ? "bg-slate-100 dark:bg-slate-800" : ""}`}
                    >
                      {c.nombre || "Sin nombre"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

            <div className="mt-3 flex items-center gap-2">
              <button type="button" onClick={handleNext} className="rounded-xl border border-slate-300 px-3 py-2 hover:bg-black/5 dark:border-slate-700 dark:hover:bg-white/5">
                Continuar
              </button>
              {cuadrillaNombre ? (
                <span className="text-sm text-slate-500">{cuadrillaNombre}</span>
              ) : null}
            </div>

          {(coordinador || tecnicos.length) ? (
            <div className="mt-3 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
              <div><b>Coordinador:</b> {coordinador || "-"}</div>
              <div><b>Tecnicos:</b> {tecnicos.length ? tecnicos.join(", ") : "-"}</div>
            </div>
          ) : null}
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
              onClick={() => setStep(1)}
            >
              Paso 1
            </button>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800/60">
              <div className="font-medium">Cuadrilla</div>
              <div>Nombre: {cuadrillaNombre || "-"}</div>
              {!!cuadrillaNombre && <div>Nombre: {cuadrillaNombre}</div>}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="text-sm font-semibold text-slate-600 dark:text-slate-300">Paso 2</div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Materiales a despachar</h2>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="md:col-span-2">
                <label className="text-sm text-slate-700 dark:text-slate-200">Buscar material</label>
                <input
                  value={materialSearch}
                  onChange={(e) => setMaterialSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (materialesFiltrados.length === 1) {
                        addItem(materialesFiltrados[0]?.id);
                      }
                    }
                  }}
                  className="ui-input-inline ui-input"
                  placeholder="Codigo o nombre"
                />
                {materialSearch.trim() ? (
                  <div className="mt-2 grid max-h-44 gap-1 overflow-auto rounded border border-slate-200 bg-white p-2 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900">
                    {materialesFiltrados.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={`rounded border px-2 py-1 text-left hover:bg-black/5 dark:hover:bg-white/5 ${materialId === m.id ? "border-blue-400" : "border-slate-200 dark:border-slate-700"}`}
                        onClick={() => addItem(m.id)}
                      >
                        {m.nombre || "Sin nombre"} ({(m.unidadTipo || "UND").toUpperCase()})
                      </button>
                    ))}
                    {!materialesFiltrados.length && <div className="text-slate-500">Sin resultados.</div>}
                  </div>
                ) : null}
              </div>
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (materialId) return addItem(materialId);
                    if (materialesFiltrados.length === 1) return addItem(materialesFiltrados[0]?.id);
                    toast.error("Selecciona un material");
                  }}
                  className="rounded-xl border border-slate-300 px-3 py-2 hover:bg-black/5 dark:border-slate-700 dark:hover:bg-white/5"
                >
                  Agregar material
                </button>
                {materialId ? (
                  <div className="text-xs text-slate-500">
                    Sel: {materialsById.get(materialId)?.nombre || "Sin nombre"}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-3">
              <label className="text-sm text-slate-700 dark:text-slate-200">Observacion</label>
              <textarea
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                rows={3}
                placeholder="Observaciones del despacho"
              />
            </div>

            <div className="mt-3 rounded border border-slate-200 dark:border-slate-700">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <tr>
                    <th className="border p-2 text-left">Material</th>
                    <th className="border p-2 text-left">Cantidad</th>
                    <th className="border p-2 text-left">Unidad</th>
                    <th className="border p-2 text-left">Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const unidad = (materialsById.get(it.materialId)?.unidadTipo || "UND").toUpperCase();
                    const isMetros = unidad === "METROS";
                    return (
                      <tr key={it.materialId} className="border-t border-slate-200 dark:border-slate-700">
                        <td className="border p-2">
                          {materialsById.get(it.materialId)?.nombre || "Sin nombre"}
                        </td>
                        <td className="border p-2">
                          <input
                            value={isMetros ? it.metros : it.und}
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
                            className="w-24 rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                            inputMode={isMetros ? "decimal" : "numeric"}
                          />
                        </td>
                        <td className="border p-2">{unidad}</td>
                        <td className="border p-2">
                          <button type="button" onClick={() => removeItem(it.materialId)} className="text-red-600 hover:underline">
                            Quitar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!items.length && (
                    <tr>
                      <td colSpan={4} className="border p-4 text-center text-slate-500">
                        Agrega materiales para despachar.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button type="button" onClick={handlePreview} className="rounded-xl bg-fuchsia-600 px-4 py-2 text-white hover:bg-fuchsia-700">
                Previsualizar
              </button>
            </div>

            {formError ? (
              <div className="mt-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{formError}</div>
            ) : null}
          </div>
        </section>
      )}

      {showPreview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl overflow-hidden dark:bg-slate-900">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between dark:border-slate-700">
              <div className="font-semibold">Resumen de despacho</div>
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="text-gray-500 hover:text-gray-700"
                aria-label="Cerrar"
              >
                X
              </button>
            </div>
            <div className="p-5 space-y-4 text-sm">
              <div className="grid sm:grid-cols-2 gap-2">
                <div><b>Cuadrilla:</b> {cuadrillaNombre || "-"}</div>
                <div><b>Coordinador:</b> {coordinador || "-"}</div>
                <div><b>Tecnicos:</b> {tecnicos.length ? tecnicos.join(", ") : "-"}</div>
              <div><b>Observacion:</b> {observacion || "-"}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <b>Materiales ({Object.keys(buildMaterialResumenDisplay(items, materialsById)).length})</b>
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      <tr>
                        <th className="border p-2 text-left">Material</th>
                        <th className="border p-2 text-left">Cantidad</th>
                        <th className="border p-2 text-left">Unidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {buildMaterialResumenRows(items, materialsById).map((row) => (
                        <tr key={row.id} className="border-t border-slate-200 dark:border-slate-700">
                          <td className="border p-2">{row.nombre}</td>
                          <td className="border p-2">{row.cantidad}</td>
                          <td className="border p-2">{row.unidad}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-end gap-2 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
                <button
                  type="button"
                  onClick={() => {
                    const err = getItemsValidationError(items, materialsById);
                    if (err) return toast.error(err);
                    setShowPreview(false);
                    formRef.current?.requestSubmit();
                  }}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700"
                >
                  Confirmar despacho
                </button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
