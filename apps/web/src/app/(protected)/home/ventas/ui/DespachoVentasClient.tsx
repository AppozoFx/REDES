"use client";
import React, { useEffect, useMemo, useRef, useState, startTransition } from "react";
import { toast } from "sonner";
import { crearVentaAction } from "../server-actions";
import jsPDF from "jspdf";
import QRCode from "qrcode";

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

type GuiaThermalData = {
  fechaStr?: string;
  usuario?: string;
  coordinador?: string;
  cuadrilla?: string;
  area?: string;
  observacion?: string;
  items?: Array<{ nombre: string; qty: string; subtotal: string }>;
  total?: string;
  qrDataUrl?: string;
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

function shortName(name: string) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  const first = parts[0];
  const firstLast = parts.length >= 4 ? parts[2] || "" : parts[1] || "";
  return `${first} ${firstLast}`.trim() || first;
}

async function makeQrDataUrl(value: string) {
  return QRCode.toDataURL(value, {
    errorCorrectionLevel: "H",
    margin: 0,
    width: 320,
  });
}

function normalizePhone(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  const noPrefix = digits.startsWith("51") && digits.length >= 11 ? digits.slice(2) : digits;
  return noPrefix.length >= 9 ? noPrefix : "";
}

async function obtenerCelulares(uids: string[] = []) {
  if (!uids.length) return [];
  const qs = encodeURIComponent(uids.join(","));
  const res = await fetch(`/api/usuarios/phones?uids=${qs}`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  const items = Array.isArray(data?.items) ? data.items : [];
  const celulares = items.map((it: any) => normalizePhone(String(it?.celular || ""))).filter(Boolean);
  return Array.from(new Set(celulares));
}

async function enviarGuiaPorWhatsApp(args: {
  coordinadorUid: string;
  tipoGuia: string;
  guiaId: string;
  cuadrilla: string;
  coordinador: string;
  usuario: string;
  fechaHora: string;
  urlComprobante: string;
  extraInfo?: string;
  preOpenWindow?: Window | null;
}) {
  const celulares = await obtenerCelulares([args.coordinadorUid]);
  if (!celulares.length) {
    if (args.preOpenWindow && !args.preOpenWindow.closed) args.preOpenWindow.close();
    return { total: 0 };
  }

  const lines: string[] = [];
  lines.push(`*${args.tipoGuia}*`);
  lines.push(`Guia: ${args.guiaId}`);
  lines.push(`*Cuadrilla:* ${args.cuadrilla}`);
  if (args.coordinador) lines.push(`*Coordinador:* ${args.coordinador}`);
  if (args.usuario) lines.push(`Registrado por: ${args.usuario}`);
  if (args.fechaHora) lines.push(`Fecha/Hora: ${args.fechaHora}`);
  if (args.extraInfo) lines.push(args.extraInfo);
  lines.push("Puedes ver el comprobante aqui:");
  lines.push(args.urlComprobante);
  const mensaje = lines.join("\n");

  const numero = celulares[0];
  try {
    const url = `https://wa.me/51${numero}?text=${encodeURIComponent(mensaje)}`;
    if (args.preOpenWindow && !args.preOpenWindow.closed) {
      args.preOpenWindow.location.href = url;
      args.preOpenWindow.focus();
    } else {
      const win = window.open(url, "_blank");
      if (win) {
        win.opener = null;
      } else {
        window.location.href = url;
      }
    }
  } catch {
    // silent
  }

  return { total: 1 };
}

function calcHeight80mm(data: GuiaThermalData) {
  const line = 5;
  let lines = 0;
  lines += 8; // header
  lines += 4; // meta
  lines += (data.items || []).length + 2;
  const obs = String(data.observacion || "");
  const obsLines = obs ? Math.max(1, Math.ceil(obs.length / 24)) : 1;
  lines += obsLines + 2;
  const extra = (data.qrDataUrl ? 60 : 10) + 22;
  return Math.max(120, 10 + lines * line + extra);
}

function generarPDFTermico80mm(guiaId: string, data: GuiaThermalData) {
  const altura = calcHeight80mm(data);
  const pdf = new jsPDF({ unit: "mm", format: [80, altura] });
  const C = { align: "center" as const };
  let y = 10;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text("CONSTRUCCION DE REDES M&D S.A.C", 40, y, C); y += 5;
  pdf.text("RUC: 20601345979", 40, y, C); y += 5;
  pdf.text("Cal. Juan Prado de Zela Mza. F2 Lt. 3", 40, y, C); y += 5;
  pdf.text("Apv. San Francisco de Cayran", 40, y, C); y += 5;
  pdf.text("Cel/WSP: 913 637 815", 40, y, C); y += 7;

  pdf.setFont("helvetica", "bold");
  pdf.text(`GUIA: ${guiaId}`, 40, y, C); y += 5;
  pdf.setFont("helvetica", "normal");
  pdf.text(`FECHA: ${data.fechaStr || new Date().toLocaleString("es-PE")}`, 40, y, C); y += 5;
  pdf.text(`USUARIO: ${data.usuario || "-"}`, 40, y, C); y += 5;
  pdf.setFont("helvetica", "bold");
  pdf.text(`COORDINADOR: ${data.coordinador || "-"}`, 40, y, C); y += 5;
  pdf.text(`CUADRILLA: ${data.cuadrilla || "-"}`, 40, y, C); y += 5;
  pdf.setFont("helvetica", "normal");
  pdf.text(`AREA: ${data.area || "-"}`, 40, y, C); y += 5;

  y += 2;
  pdf.setFont("helvetica", "bold");
  pdf.text("VENTA", 40, y, C);
  y += 6;
  pdf.setFont("helvetica", "normal");

  pdf.setFontSize(7);
  (data.items || []).forEach((it) => {
    pdf.text(`${it.nombre} - ${it.qty}`, 6, y);
    pdf.text(`${it.subtotal}`, 74, y, { align: "right" });
    y += 4;
  });
  y += 2;
  pdf.setFont("helvetica", "bold");
  pdf.text(`TOTAL: ${data.total || "-"}`, 40, y, C); y += 6;
  pdf.setFont("helvetica", "normal");
  if (data.observacion) {
    pdf.text("OBS:", 6, y); y += 4;
    const obs = String(data.observacion || "");
    const chunks = obs.match(/.{1,24}/g) || [obs];
    chunks.forEach((c) => { pdf.text(c, 6, y); y += 4; });
  }

  if (data.qrDataUrl) {
    pdf.addImage(data.qrDataUrl, "PNG", 20, y, 40, 40);
    y += 52;
  } else {
    y += 6;
  }

  pdf.line(10, y, 40, y);
  pdf.line(45, y, 75, y);
  y += 10;
  pdf.text(data.coordinador || "Coordinador", 25, y, { align: "center" });
  pdf.text(data.usuario || "Almacen", 60, y, { align: "center" });

  return pdf;
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
  const [usuarioNombre, setUsuarioNombre] = useState("");
  const printedVentaRef = useRef<string>("");
  const waWindowRef = useRef<Window | null>(null);

  const [coordinadores, setCoordinadores] = useState<Array<{ uid: string; label: string }>>([]);

  const [materiales, setMateriales] = useState<MaterialItem[]>([]);
  const [materialFilterArea, setMaterialFilterArea] = useState<"ALL" | "INSTALACIONES" | "AVERIAS">("ALL");
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [items, setItems] = useState<ItemState[]>([]);
  const materialInputRef = useRef<HTMLInputElement | null>(null);

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
          setCoordinadorNombre(shortName(String(data.nombre || data.uid)));
        }
        if (data?.ok && data?.nombre) {
          setUsuarioNombre(shortName(String(data.nombre || "")));
        }
      } catch {}
    })();
  }, [canEditCoordinador]);

  useEffect(() => {
    if (canEditCoordinador) {
      (async () => {
        try {
          const res = await fetch("/api/auth/me", { cache: "no-store" });
          if (!res.ok) return;
          const data = await res.json();
          if (data?.ok && data?.nombre) setUsuarioNombre(shortName(String(data.nombre || "")));
        } catch {}
      })();
    }
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
    setMaterialSearch("");
    setTimeout(() => materialInputRef.current?.focus(), 0);
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

  async function imprimirGuiaTermica(ventaId: string): Promise<boolean> {
    const itemsList = items.map((it) => {
      const mat = materialMap.get(it.materialId);
      const unidad = mat?.unidadTipo === "METROS" ? "m" : "und";
      const qty = mat?.unidadTipo === "METROS" ? `${toNum(it.metros).toFixed(2)} ${unidad}` : `${Math.floor(toNum(it.und))} ${unidad}`;
      const subtotal = centsToMoney(calcSubtotal(it, mat as any));
      return { nombre: mat?.nombre || it.materialId, qty, subtotal };
    });
    const data: GuiaThermalData = {
      fechaStr: new Date().toLocaleString("es-PE"),
      usuario: shortName(usuarioNombre || ""),
      coordinador: shortName(coordinadorNombre || ""),
      cuadrilla: cuadrillaNombre || "DIRECTO",
      area,
      observacion,
      items: itemsList,
      total: `S/ ${centsToMoney(totalCents)}`,
    };

    const token = typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "";
    const path = `guias/instalaciones/ventas/${ventaId}.pdf`;
    const encodedPath = encodeURIComponent(path);
    const directUrl = bucket
      ? `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${token}`
      : "";

    if (directUrl) {
      try {
        data.qrDataUrl = await makeQrDataUrl(directUrl);
      } catch {}
    }

    const pdf = generarPDFTermico80mm(ventaId, data);
    try {
      const blob = pdf.output("blob");
      const res = await fetch(
        `/api/transferencias/instalaciones/guia/upload?guiaId=${encodeURIComponent(ventaId)}&tipo=ventas&token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "content-type": "application/pdf" },
          body: await blob.arrayBuffer(),
        }
      );
      if (!res.ok) throw new Error("UPLOAD_FAILED");

      printThermalBlobTwice(pdf);

      const extraInfo = itemsList.map((i) => `${i.nombre}: ${i.qty}`).join("\n");
      const totalLine = `Total: S/ ${centsToMoney(totalCents)}`;

      if (directUrl && coordinadorUid) {
        if (!waWindowRef.current || waWindowRef.current.closed) {
          const w = window.open("about:blank", "_blank");
          if (w) waWindowRef.current = w;
        }
        await enviarGuiaPorWhatsApp({
          coordinadorUid,
          tipoGuia: `Venta ${area}`,
          guiaId: ventaId,
          cuadrilla: cuadrillaNombre || "DIRECTO",
          coordinador: shortName(coordinadorNombre || ""),
          usuario: shortName(usuarioNombre || ""),
          fechaHora: data.fechaStr || "",
          urlComprobante: directUrl,
          extraInfo: extraInfo ? `Materiales:\n${extraInfo}\n${totalLine}` : totalLine,
          preOpenWindow: waWindowRef.current,
        });
      }
      return true;
    } catch {
      toast.error("No se pudo subir la guía a Storage");
      return false;
    }
  }

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
        const ventaId = (res as any).ventaId;
        toast.success("Venta registrada");
        if (ventaId && printedVentaRef.current !== ventaId) {
          printedVentaRef.current = ventaId;
          const ok = await imprimirGuiaTermica(ventaId);
          if (ok) {
            setItems([]);
            setSelectedMaterialId("");
            setObservacion("");
          }
        }
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
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-sm space-y-3">
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
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 py-2"
              >
                <option value="">Selecciona...</option>
                {coordinadores.map((c) => (
                  <option key={c.uid} value={c.uid}>
                    {c.label}
                  </option>
                ))}
              </select>
            ) : (
              <input value={coordinadorNombre} readOnly className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200" />
            )}
          </div>
          <div>
            <label className="text-xs text-slate-600 dark:text-slate-300">Cuadrilla</label>
            <input
              value={cuadrillaQuery}
              onChange={(e) => {
                setCuadrillaQuery(e.target.value);
                setCuadrillaId("");
                setCuadrillaNombre("");
              }}
              placeholder={coordinadorUid || !canEditCoordinador ? "Escribe para buscar..." : "Selecciona coordinador primero"}
              disabled={!coordinadorUid && canEditCoordinador}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 py-2"
            />
            {(coordinadorUid || !canEditCoordinador) && filteredCuadrillas.length > 0 && (
              <div className="mt-2 max-h-48 overflow-auto rounded-xl border border-slate-200 bg-slate-50 dark:bg-slate-800/60">
                {filteredCuadrillas.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setCuadrillaId(c.id);
                      setCuadrillaNombre(c.nombre || c.id);
                      setCuadrillaQuery(c.nombre || c.id);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700/60"
                  >
                    {c.nombre || c.id} <span className="text-xs text-slate-500 dark:text-slate-400">({c.id})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-slate-600 dark:text-slate-300">Nombre cuadrilla</label>
            <input value={cuadrillaNombre} readOnly className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200" />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-sm space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="font-medium">Materiales vendibles</div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-600 dark:text-slate-300">Filtro área</label>
            <select
              value={materialFilterArea}
              onChange={(e) => setMaterialFilterArea(e.target.value as any)}
              className="rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 py-1 text-xs"
            >
              <option value="ALL">Todos</option>
              <option value="INSTALACIONES">Instalaciones</option>
              <option value="AVERIAS">AVERIAS</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            ref={materialInputRef}
            value={materialSearch}
            onChange={(e) => {
              setMaterialSearch(e.target.value);
              setSelectedMaterialId("");
            }}
            placeholder="Escribe material y selecciona..."
            className="w-full rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 py-2"
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
              addMaterial(mat.id);
            }}
            className="rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Agregar
          </button>
        </div>

        {items.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
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
                    <tr key={it.materialId} className="border-t border-slate-200 dark:border-slate-700">
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
                            className="w-24 rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-2 py-1"
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
                            className="w-24 rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-2 py-1"
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
                            className="w-28 rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-2 py-1"
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

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full">
            <label className="text-xs">Observación</label>
            <input
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 py-2"
              placeholder="Observación (opcional)"
            />
          </div>
          <div className="text-sm font-medium">Total: {centsToMoney(totalCents)}</div>
        </div>
      </div>

      <div className="flex justify-stretch sm:justify-end">
        <button
          type="button"
          onClick={() => startTransition(() => { void handleSubmit(); })}
          disabled={submitting}
          className="w-full rounded-xl bg-emerald-600 px-5 py-2 text-white hover:bg-emerald-700 disabled:opacity-50 sm:w-auto"
        >
          {submitting ? "Registrando..." : "Registrar venta"}
        </button>
      </div>
    </div>
  );
}






