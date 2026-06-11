"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import QRCode from "qrcode";
import { toast } from "sonner";

type CuadrillaOpt = { id: string; nombre: string; coordinadorUid?: string };
type MaterialOpt = { id: string; nombre?: string; unidadTipo?: "UND" | "METROS" | null; fotoUrl?: string; metrosPorUndCm?: number };

type ItemForm = {
  materialId: string;
  und: string;
  metros: string;
  observacion: string;
};

type PayloadItem = {
  materialId: string;
  und: number;
  metros: number;
  observacion: string;
};

type CuadrillaInfo = {
  coordinadorUid?: string;
  coordinadorNombre?: string;
  nombre?: string;
  segmento?: string;
  tipo?: string;
  zonaId?: string;
  vehiculo?: string;
  tecnicosNombres?: string[];
};

const FOCO_IDS = ["ACTA", "CONECTOR", "PACHCORD", "ROSETA", "CAJA_GRAPAS", "CINTA_AISLANTE", "CINTILLO_10"];

function tsToStr(v: any) {
  if (!v) return "-";
  if (typeof v?.toDate === "function") return v.toDate().toLocaleString("es-PE");
  if (typeof v?.seconds === "number") return new Date(v.seconds * 1000).toLocaleString("es-PE");
  if (typeof v?._seconds === "number") return new Date(v._seconds * 1000).toLocaleString("es-PE");
  if (typeof v === "string") return v;
  return "-";
}

function normalizePhone(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  const noPrefix = digits.startsWith("51") && digits.length >= 11 ? digits.slice(2) : digits;
  return noPrefix.length >= 9 ? noPrefix : "";
}

async function obtenerCelular(uid: string) {
  if (!uid) return "";
  const res = await fetch(`/api/usuarios/phones?uids=${encodeURIComponent(uid)}`, { cache: "no-store" });
  if (!res.ok) return "";
  const data = await res.json().catch(() => ({}));
  const items = Array.isArray(data?.items) ? data.items : [];
  return normalizePhone(String(items[0]?.celular || ""));
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
}

function enviarWhatsApp(numero: string, mensaje: string, preOpen?: Window | null) {
  if (!numero) {
    if (preOpen && !preOpen.closed) preOpen.close();
    return false;
  }
  const url = `https://wa.me/51${numero}?text=${encodeURIComponent(mensaje)}`;
  try {
    if (preOpen && !preOpen.closed) {
      preOpen.location.href = url;
      preOpen.focus();
      return true;
    }
    const win = window.open(url, "_blank");
    if (win) { win.opener = null; return true; }
    window.location.href = url;
    return true;
  } catch {
    return false;
  }
}

function generarPdf80mm(args: {
  guia: string;
  cuadrillaNombre: string;
  coordinadorNombre: string;
  usuarioNombre: string;
  observacion: string;
  items: PayloadItem[];
  qrDataUrl?: string;
}) {
  const altura = Math.max(130, 120 + args.items.length * 5 + (args.qrDataUrl ? 50 : 0));
  const pdf = new jsPDF({ unit: "mm", format: [80, altura] });
  const C = { align: "center" as const };
  let y = 10;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text("CONSTRUCCION DE REDES M&D S.A.C", 40, y, C); y += 5;
  pdf.text("RUC: 20601345979", 40, y, C); y += 6;
  pdf.setFont("helvetica", "bold");
  pdf.text(`GUIA: ${args.guia}`, 40, y, C); y += 5;
  pdf.text("REPOSICION CUADRILLA", 40, y, C); y += 5;
  pdf.setFont("helvetica", "normal");
  pdf.text(`FECHA: ${new Date().toLocaleString("es-PE")}`, 40, y, C); y += 5;
  pdf.text(`USUARIO: ${args.usuarioNombre || "-"}`, 40, y, C); y += 5;
  pdf.setFont("helvetica", "bold");
  pdf.text(`CUADRILLA: ${args.cuadrillaNombre || "-"}`, 40, y, C); y += 5;
  if (args.coordinadorNombre) {
    pdf.text(`COORDINADOR: ${args.coordinadorNombre}`, 40, y, C);
    y += 5;
  }
  pdf.setFont("helvetica", "normal");
  y += 2;
  pdf.setFont("helvetica", "bold");
  pdf.text("DETALLE", 40, y, C);
  y += 5;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);

  for (const it of args.items) {
    const qty = it.und > 0 ? `UND ${it.und}` : `M ${it.metros}`;
    const lines = pdf.splitTextToSize(`${it.materialId}: ${qty}`, 72) as string[];
    pdf.text(lines, 4, y);
    y += lines.length * 4;
  }

  const obs = `OBS: ${args.observacion || "Sin observaciones"}`;
  const obsLines = pdf.splitTextToSize(obs, 72) as string[];
  pdf.text(obsLines, 4, y);
  y += obsLines.length * 4 + 2;

  if (args.qrDataUrl) {
    pdf.addImage(args.qrDataUrl, "PNG", 20, y, 40, 40);
    y += 45;
  }

  y += 10;
  pdf.line(10, y, 40, y);
  pdf.line(45, y, 75, y);
  y += 8;
  pdf.text(args.coordinadorNombre || "Cuadrilla", 25, y, { align: "center" });
  pdf.text(args.usuarioNombre || "Almacen", 60, y, { align: "center" });
  return pdf;
}

export default function ReposicionClient() {
  const [cuadrillas, setCuadrillas] = useState<CuadrillaOpt[]>([]);
  const [materiales, setMateriales] = useState<MaterialOpt[]>([]);
  const [historial, setHistorial] = useState<any[]>([]);
  const [stock, setStock] = useState<any[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [openOtros, setOpenOtros] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const [cuadrillaId, setCuadrillaId] = useState("");
  const [busquedaCuadrilla, setBusquedaCuadrilla] = useState("");
  const [comboOpen, setComboOpen] = useState(false);
  const [comboMatOpen, setComboMatOpen] = useState(false);
  const [cuadrillaInfo, setCuadrillaInfo] = useState<CuadrillaInfo>({});
  const [materialSearch, setMaterialSearch] = useState("");
  const [observacion, setObservacion] = useState("");
  const [items, setItems] = useState<ItemForm[]>([]);
  const waWindowRef = useRef<Window | null>(null);

  const materialById = useMemo(() => {
    const m = new Map<string, MaterialOpt>();
    materiales.forEach((x) => m.set(x.id, x));
    return m;
  }, [materiales]);

  const focusMaterials = useMemo(
    () => FOCO_IDS.map((id) => materialById.get(id)).filter(Boolean) as MaterialOpt[],
    [materialById]
  );

  const otrosMateriales = useMemo(() => {
    const q = materialSearch.trim().toLowerCase();
    const filtered = materiales.filter((m) => !FOCO_IDS.includes(m.id));
    if (!q) return filtered.slice(0, 80);
    return filtered.filter((m) => `${m.id} ${m.nombre || ""}`.toLowerCase().includes(q)).slice(0, 80);
  }, [materiales, materialSearch]);

  const cuadrillasFiltradas = useMemo(() => {
    const q = busquedaCuadrilla.trim().toLowerCase();
    if (!q) return cuadrillas.slice(0, 80);
    return cuadrillas
      .filter((c) => `${c.nombre || ""} ${c.id}`.toLowerCase().includes(q))
      .slice(0, 80);
  }, [cuadrillas, busquedaCuadrilla]);

  const previewItems = useMemo((): PayloadItem[] => {
    return items.map((it) => {
      const mat = materialById.get(it.materialId);
      const isMetros = mat?.unidadTipo === "METROS";
      // metrosPorUnd > 0 significa que el material tiene factor de conversion (ej: 100m por rollo)
      const metrosPorUnd = isMetros && mat?.metrosPorUndCm ? mat.metrosPorUndCm / 100 : 0;

      if (!isMetros) {
        const und = Math.max(0, Math.floor(Number(it.und || 0)));
        return { materialId: it.materialId, und, metros: 0, observacion: it.observacion };
      }
      if (metrosPorUnd > 0) {
        // El usuario ingresa UND (rollos/unidades), se convierte a metros para el payload
        const undQty = Math.max(0, Math.floor(Number(it.und || 0)));
        const metros = undQty * metrosPorUnd;
        return { materialId: it.materialId, und: 0, metros, observacion: it.observacion };
      }
      // Sin factor de conversion: el usuario ingresa metros directamente
      const metros = Math.max(0, Number(it.metros || 0));
      return { materialId: it.materialId, und: 0, metros, observacion: it.observacion };
    });
  }, [items, materialById]);

  const cuadrillaNombreDisplay =
    cuadrillaInfo.nombre ||
    cuadrillas.find((c) => c.id === cuadrillaId)?.nombre ||
    cuadrillaId;

  const loadHistorial = async (id: string) => {
    if (!id) { setHistorial([]); setStock([]); return; }
    setLoadingHist(true);
    try {
      const res = await fetch(`/api/instalaciones/reposicion/historial?cuadrillaId=${encodeURIComponent(id)}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      setHistorial(Array.isArray(body.historial) ? body.historial : []);
      setStock(Array.isArray(body.stock) ? body.stock : []);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo cargar historial");
      setHistorial([]);
      setStock([]);
    } finally {
      setLoadingHist(false);
    }
  };

  const loadCuadrillaInfo = async (id: string) => {
    if (!id) { setCuadrillaInfo({}); return; }
    try {
      const res = await fetch(`/api/cuadrillas/info?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) { setCuadrillaInfo({}); return; }
      setCuadrillaInfo({
        coordinadorUid: String(body?.coordinadorUid || ""),
        coordinadorNombre: String(body?.coordinadorNombre || ""),
        nombre: String(body?.nombre || ""),
        segmento: String(body?.segmento || ""),
        tipo: String(body?.tipo || ""),
        zonaId: String(body?.zonaId || ""),
        vehiculo: String(body?.vehiculo || ""),
        tecnicosNombres: Array.isArray(body?.tecnicosNombres) ? body.tecnicosNombres : [],
      });
    } catch {
      setCuadrillaInfo({});
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const [qRes, mRes] = await Promise.all([
          fetch("/api/cuadrillas/list?area=INSTALACIONES", { cache: "no-store" }),
          fetch("/api/materiales/list?area=INSTALACIONES", { cache: "no-store" }),
        ]);
        const [qBody, mBody] = await Promise.all([
          qRes.json().catch(() => ({})),
          mRes.json().catch(() => ({})),
        ]);
        setCuadrillas(Array.isArray(qBody?.items) ? qBody.items : []);
        setMateriales(Array.isArray(mBody?.items) ? mBody.items : []);
      } catch {
        toast.error("No se pudo cargar catalogos");
      }
    })();
  }, []);

  useEffect(() => {
    loadHistorial(cuadrillaId);
    loadCuadrillaInfo(cuadrillaId);
  }, [cuadrillaId]);

  const addItem = (materialId: string) => {
    if (!materialId) return;
    if (items.some((i) => i.materialId === materialId)) {
      toast.error("Ese material ya esta agregado");
      return;
    }
    setItems((prev) => [...prev, { materialId, und: "", metros: "", observacion: "" }]);
    setMaterialSearch("");
  };

  const removeItem = (materialId: string) => {
    setItems((prev) => prev.filter((x) => x.materialId !== materialId));
  };

  const seleccionarCuadrilla = (c: CuadrillaOpt) => {
    setCuadrillaId(c.id);
    setBusquedaCuadrilla(c.nombre || c.id);
    setComboOpen(false);
  };

  const buscarYSeleccionarCuadrilla = () => {
    const first = cuadrillasFiltradas[0];
    if (!first) { toast.error("No se encontro cuadrilla"); return; }
    seleccionarCuadrilla(first);
  };

  const validarParaPreview = (): boolean => {
    if (!cuadrillaId) { toast.error("Selecciona cuadrilla"); return false; }
    if (!items.length) { toast.error("Agrega materiales"); return false; }
    if (previewItems.some((x) => x.und <= 0 && x.metros <= 0)) {
      toast.error("Completa cantidades validas");
      return false;
    }
    return true;
  };

  const submit = async () => {
    setShowPreview(false);
    const payloadItems = previewItems;

    setGuardando(true);
    try {
      waWindowRef.current = window.open("", "_blank");
      if (waWindowRef.current && !waWindowRef.current.closed) waWindowRef.current.document.title = "WhatsApp";
    } catch {
      waWindowRef.current = null;
    }

    try {
      const res = await fetch("/api/instalaciones/reposicion/registrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cuadrillaId,
          cuadrillaNombre: cuadrillaNombreDisplay,
          coordinadorUid: cuadrillaInfo.coordinadorUid || "",
          coordinadorNombre: cuadrillaInfo.coordinadorNombre || "",
          observacion,
          items: payloadItems,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));

      const guia = String(body?.guia || "");
      const usuarioNombre = String(body?.actorNombre || "Usuario");
      const cuadrillaNombre = String(body?.cuadrillaNombre || cuadrillaNombreDisplay);
      const coordinadorUid = String(body?.coordinadorUid || cuadrillaInfo.coordinadorUid || "");
      const coordinadorNombre = String(body?.coordinadorNombre || cuadrillaInfo.coordinadorNombre || "");

      if (guia) {
        const token =
          typeof crypto?.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "";
        const path = `guias/instalaciones/reposicion/${guia}.pdf`;
        const directUrl = bucket
          ? `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=${token}`
          : "";
        const qrDataUrl = directUrl ? await makeQrDataUrl(directUrl).catch(() => undefined) : undefined;

        const pdf = generarPdf80mm({
          guia,
          cuadrillaNombre,
          coordinadorNombre,
          usuarioNombre,
          observacion,
          items: payloadItems,
          qrDataUrl,
        });
        const blob = pdf.output("blob");
        const upRes = await fetch(
          `/api/transferencias/instalaciones/guia/upload?guiaId=${encodeURIComponent(guia)}&tipo=reposicion&token=${encodeURIComponent(token)}`,
          { method: "POST", headers: { "content-type": "application/pdf" }, body: await blob.arrayBuffer() }
        );
        if (!upRes.ok) throw new Error("NO_SE_PUDO_SUBIR_LA_GUIA");
        printThermalBlobTwice(pdf);

        const celular = await obtenerCelular(coordinadorUid);
        const lines: string[] = [];
        lines.push("*Reposicion de Materiales*");
        lines.push(`Guia: ${guia}`);
        lines.push(`Cuadrilla: ${cuadrillaNombre}`);
        if (coordinadorNombre) lines.push(`Coordinador: ${coordinadorNombre}`);
        lines.push(`Registrado por: ${usuarioNombre}`);
        lines.push(`Fecha/Hora: ${new Date().toLocaleString("es-PE")}`);
        lines.push("");
        lines.push("*Detalle reposicion:*");
        payloadItems.forEach((it) => {
          const qty = it.und > 0 ? `UND ${it.und}` : `M ${it.metros}`;
          lines.push(`- ${it.materialId}: ${qty}`);
        });
        lines.push("");
        lines.push("Comprobante:");
        lines.push(directUrl || "(sin URL)");

        const sent = enviarWhatsApp(celular, lines.join("\n"), waWindowRef.current);
        if (!sent) toast.message("No se encontro celular del coordinador");
      } else if (waWindowRef.current && !waWindowRef.current.closed) {
        waWindowRef.current.close();
      }

      toast.success("Reposicion registrada");
      setItems([]);
      setObservacion("");
      await loadHistorial(cuadrillaId);
    } catch (e: any) {
      if (waWindowRef.current && !waWindowRef.current.closed) waWindowRef.current.close();
      toast.error(e?.message || "No se pudo registrar la reposicion");
    } finally {
      setGuardando(false);
      waWindowRef.current = null;
    }
  };

  const abrirGuia = async (guiaId: string) => {
    const guia = String(guiaId || "").trim();
    if (!guia) return;
    try {
      const res = await fetch(
        `/api/transferencias/instalaciones/guia/url?guiaId=${encodeURIComponent(guia)}&tipo=reposicion`,
        { cache: "no-store" }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok || !body?.url) throw new Error(String(body?.error || "NO_URL"));
      const win = window.open(String(body.url), "_blank");
      if (win) win.opener = null;
    } catch {
      toast.error("No se pudo abrir la guia");
    }
  };

  return (
    <div className="space-y-5">

      {/* ─── PASO 1 ─── */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">Paso 1 — Seleccionar cuadrilla</div>
            <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Escribe nombre o código y selecciona de la lista.
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Cuadrilla</label>
              <div className="relative mt-1">
                <input
                  value={busquedaCuadrilla}
                  onChange={(e) => {
                    setBusquedaCuadrilla(e.target.value);
                    setComboOpen(true);
                    if (!e.target.value.trim()) {
                      setCuadrillaId("");
                      setCuadrillaInfo({});
                    }
                  }}
                  onFocus={() => setComboOpen(true)}
                  onBlur={() => setTimeout(() => setComboOpen(false), 150)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); buscarYSeleccionarCuadrilla(); }
                    if (e.key === "Escape") setComboOpen(false);
                  }}
                  placeholder="Escribe nombre o código de cuadrilla..."
                  className="w-full rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 py-2 text-sm placeholder:text-slate-400"
                />
                {cuadrillaId && (
                  <div className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">Cuadrilla seleccionada</div>
                )}
                {comboOpen && (
                  <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 shadow-lg">
                    {cuadrillasFiltradas.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full border-b border-slate-100 dark:border-slate-800 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                        onMouseDown={(e) => { e.preventDefault(); seleccionarCuadrilla(c); }}
                      >
                        <div className="font-medium">{c.nombre || c.id}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{c.id}</div>
                      </button>
                    ))}
                    {!cuadrillasFiltradas.length && (
                      <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">Sin resultados</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-sm space-y-1.5 text-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                Info cuadrilla
              </div>
              {[
                { label: "Cuadrilla",   value: cuadrillaInfo.nombre },
                { label: "Coordinador", value: cuadrillaInfo.coordinadorNombre },
                { label: "Tecnicos",    value: (cuadrillaInfo.tecnicosNombres || []).slice(0, 3).join(", ") || undefined },
                { label: "Segmento",    value: [cuadrillaInfo.segmento, cuadrillaInfo.tipo].filter(Boolean).join(" · ") || undefined },
                { label: "Zona",        value: [cuadrillaInfo.zonaId, cuadrillaInfo.vehiculo].filter(Boolean).join(" · ") || undefined },
              ].map(({ label, value }) => (
                <div key={label} className="flex gap-2">
                  <span className="min-w-[80px] text-slate-500 dark:text-slate-400">{label}</span>
                  <span className="font-medium truncate text-slate-800 dark:text-slate-100">{value || "—"}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <button
              type="button"
              disabled={!cuadrillaId}
              onClick={() => setStep(2)}
              className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {/* ─── PASO 2 ─── */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Nav */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              ← Paso 1
            </button>
            <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 px-3 py-2">
              <div className="text-xs text-slate-500 dark:text-slate-400">Cuadrilla seleccionada</div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{cuadrillaNombreDisplay || "—"}</div>
              {(cuadrillaInfo.segmento || cuadrillaInfo.tipo) && (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {[cuadrillaInfo.segmento, cuadrillaInfo.tipo].filter(Boolean).join(" · ")}
                </div>
              )}
            </div>
          </div>

          {/* Header sección */}
          <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Registro de reposicion</h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Canje por material malogrado — descuenta almacen, no suma almacen.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { if (validarParaPreview()) setShowPreview(true); }}
                disabled={guardando || !cuadrillaId || !items.length}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {guardando ? "Registrando..." : "Revisar y confirmar"}
              </button>
            </div>
          </div>

          {/* Materiales frecuentes + Otros */}
          <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-sm space-y-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Materiales frecuentes
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {focusMaterials.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => addItem(m.id)}
                  className="w-32 shrink-0 rounded-xl border border-slate-200 dark:border-slate-700 p-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  {m.fotoUrl ? (
                    <img
                      src={m.fotoUrl}
                      alt={m.nombre || m.id}
                      className="mb-2 h-16 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1 object-contain"
                    />
                  ) : (
                    <div className="mb-2 flex h-16 w-full items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-xs text-slate-400">
                      Sin foto
                    </div>
                  )}
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">{m.id}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{m.nombre || "—"}</div>
                </button>
              ))}
            </div>

            <div>
              <button
                type="button"
                onClick={() => setOpenOtros((v) => !v)}
                className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
              >
                <span className={`text-xs transition-transform duration-150 inline-block ${openOtros ? "rotate-90" : ""}`}>▶</span>
                Otros materiales
              </button>
              {openOtros && (
                <div className="relative mt-2">
                  <input
                    value={materialSearch}
                    onChange={(e) => { setMaterialSearch(e.target.value); setComboMatOpen(true); }}
                    onFocus={() => setComboMatOpen(true)}
                    onBlur={() => setTimeout(() => setComboMatOpen(false), 150)}
                    placeholder="Buscar por código o nombre..."
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm placeholder:text-slate-400"
                  />
                  {comboMatOpen && (
                    <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-52 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg">
                      {otrosMateriales.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); addItem(m.id); setComboMatOpen(false); }}
                          className="w-full border-b border-slate-100 dark:border-slate-800 px-3 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          <span className="font-medium">{m.id}</span>
                          {m.nombre ? <span className="text-slate-500 dark:text-slate-400"> — {m.nombre}</span> : null}
                          <span className="ml-1 text-slate-400">({m.unidadTipo || "UND"})</span>
                        </button>
                      ))}
                      {!otrosMateriales.length && (
                        <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">Sin resultados</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Observacion */}
          <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-sm">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
              Observacion general
            </label>
            <textarea
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              rows={3}
              placeholder="Opcional..."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900 px-3 py-2 text-sm placeholder:text-slate-400"
            />
          </div>

          {/* Tabla de items */}
          <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 px-4 py-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Items agregados
              </span>
              {items.length > 0 && (
                <span className="rounded-full bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                  {items.length}
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="border-b border-slate-200 dark:border-slate-700 px-4 py-2.5 text-left font-semibold">Material</th>
                    <th className="border-b border-slate-200 dark:border-slate-700 px-4 py-2.5 text-left font-semibold">Cantidad</th>
                    <th className="border-b border-slate-200 dark:border-slate-700 px-4 py-2.5 text-left font-semibold">Observacion item</th>
                    <th className="border-b border-slate-200 dark:border-slate-700 px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.map((it) => {
                    const m = materialById.get(it.materialId);
                    const isMetros = m?.unidadTipo === "METROS";
                    const metrosPorUnd = isMetros && m?.metrosPorUndCm ? m.metrosPorUndCm / 100 : 0;
                    const undQty = Number(it.und || 0);
                    return (
                      <tr key={it.materialId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-slate-800 dark:text-slate-100">{it.materialId}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{m?.nombre || ""}</div>
                        </td>
                        <td className="px-4 py-2.5">
                          {isMetros && metrosPorUnd === 0 ? (
                            // Sin factor de conversion: input en metros directo
                            <input
                              value={it.metros}
                              onChange={(e) =>
                                setItems((prev) =>
                                  prev.map((p) => p.materialId === it.materialId ? { ...p, metros: e.target.value } : p)
                                )
                              }
                              className="w-28 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900 px-2 py-1 text-sm"
                              placeholder="Metros"
                            />
                          ) : (
                            // UND o METROS con factor: siempre input en UND
                            <div className="space-y-0.5">
                              <input
                                value={it.und}
                                onChange={(e) =>
                                  setItems((prev) =>
                                    prev.map((p) => p.materialId === it.materialId ? { ...p, und: e.target.value.replace(/\D/g, "") } : p)
                                  )
                                }
                                className="w-28 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900 px-2 py-1 text-sm"
                                placeholder="UND"
                              />
                              {isMetros && metrosPorUnd > 0 && (
                                <div className="text-[11px] text-slate-400 dark:text-slate-500">
                                  {undQty > 0
                                    ? `= ${undQty * metrosPorUnd} m`
                                    : `×${metrosPorUnd} m/und`}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <input
                            value={it.observacion}
                            onChange={(e) =>
                              setItems((prev) =>
                                prev.map((p) => p.materialId === it.materialId ? { ...p, observacion: e.target.value } : p)
                              )
                            }
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900 px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() => removeItem(it.materialId)}
                            className="rounded-lg border border-red-200 dark:border-red-800 px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            Quitar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!items.length && (
                    <tr>
                      <td className="px-4 py-6 text-center text-sm text-slate-400 dark:text-slate-500" colSpan={4}>
                        Aun no hay materiales en la lista.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL PREVIEW ─── */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Confirmar reposicion</h2>
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto px-5 py-4 space-y-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-4 text-sm space-y-1.5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Cuadrilla</div>
                <div className="flex gap-2">
                  <span className="text-slate-500 dark:text-slate-400 min-w-[80px]">Nombre</span>
                  <b className="text-slate-800 dark:text-slate-100">{cuadrillaNombreDisplay || "—"}</b>
                </div>
                <div className="flex gap-2">
                  <span className="text-slate-500 dark:text-slate-400 min-w-[80px]">Coordinador</span>
                  <b className="text-slate-800 dark:text-slate-100">{cuadrillaInfo.coordinadorNombre || "—"}</b>
                </div>
                {(cuadrillaInfo.segmento || cuadrillaInfo.tipo) && (
                  <div className="flex gap-2">
                    <span className="text-slate-500 dark:text-slate-400 min-w-[80px]">Segmento</span>
                    <b className="text-slate-800 dark:text-slate-100">
                      {[cuadrillaInfo.segmento, cuadrillaInfo.tipo].filter(Boolean).join(" · ")}
                    </b>
                  </div>
                )}
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                  Materiales ({previewItems.length} item{previewItems.length !== 1 ? "s" : ""})
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="min-w-full border-collapse text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300">
                      <tr>
                        <th className="border-b border-slate-200 dark:border-slate-700 px-4 py-2.5 text-left font-semibold">Material</th>
                        <th className="border-b border-slate-200 dark:border-slate-700 px-4 py-2.5 text-left font-semibold">Cantidad</th>
                        <th className="border-b border-slate-200 dark:border-slate-700 px-4 py-2.5 text-left font-semibold">Obs.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {previewItems.map((it) => {
                        const m = materialById.get(it.materialId);
                        return (
                          <tr key={it.materialId}>
                            <td className="px-4 py-2">
                              <div className="font-medium text-slate-800 dark:text-slate-100">{it.materialId}</div>
                              {m?.nombre && <div className="text-xs text-slate-500 dark:text-slate-400">{m.nombre}</div>}
                            </td>
                            <td className="px-4 py-2 font-semibold text-slate-800 dark:text-slate-100">
                              {it.und > 0 ? `${it.und} UND` : `${it.metros} m`}
                            </td>
                            <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
                              {it.observacion || "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {observacion && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3 text-sm">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Observacion: </span>
                  <span className="text-slate-700 dark:text-slate-300">{observacion}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-700 px-5 py-4">
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={guardando}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {guardando ? "Registrando..." : "Confirmar y registrar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── HISTORIAL ─── */}
      <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-sm space-y-4">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Historial de reposicion</h2>

        {!cuadrillaId && (
          <p className="text-sm text-slate-500 dark:text-slate-400">Selecciona una cuadrilla para ver historial.</p>
        )}

        {cuadrillaId && (
          <>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Stock actual de cuadrilla
                </div>
                <div className="max-h-56 overflow-auto space-y-1">
                  {stock.map((s: any) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 py-1 text-sm last:border-0"
                    >
                      <span className="text-slate-700 dark:text-slate-300">{s.materialId || s.id}</span>
                      <b className="tabular-nums text-slate-900 dark:text-slate-100">
                        {String(s.unidadTipo || "UND").toUpperCase() === "METROS"
                          ? `${Number(s.stockCm || 0) / 100} m`
                          : Number(s.stockUnd || 0)}
                      </b>
                    </div>
                  ))}
                  {!stock.length && (
                    <div className="text-sm text-slate-400 dark:text-slate-500">Sin stock registrado.</div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Ultimas reposiciones
                </div>
                <div className="max-h-56 overflow-auto space-y-2">
                  {historial.slice(0, 8).map((h: any) => (
                    <div key={h.id} className="border-b border-slate-200 dark:border-slate-700 pb-2 last:border-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-slate-500 dark:text-slate-400">{tsToStr(h.createdAt)}</div>
                        {h.guia ? (
                          <button
                            type="button"
                            onClick={() => abrirGuia(String(h.guia))}
                            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {String(h.guia)}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-600 dark:text-slate-300">
                        {(Array.isArray(h.items) ? h.items : []).slice(0, 4).map((it: any, idx: number) => (
                          <span key={idx}>
                            {it.materialId}
                            {it.undEntregada ? ` ×${it.undEntregada}` : ""}
                            {it.metrosEntregados ? ` ${it.metrosEntregados}m` : ""}
                          </span>
                        ))}
                        {(Array.isArray(h.items) ? h.items : []).length > 4 && (
                          <span className="text-slate-400">+{h.items.length - 4} más</span>
                        )}
                      </div>
                    </div>
                  ))}
                  {!historial.length && (
                    <div className="text-sm text-slate-400 dark:text-slate-500">Sin reposiciones.</div>
                  )}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="border-b border-slate-200 dark:border-slate-700 px-4 py-2.5 text-left font-semibold">Fecha</th>
                    <th className="border-b border-slate-200 dark:border-slate-700 px-4 py-2.5 text-left font-semibold">Guia</th>
                    <th className="border-b border-slate-200 dark:border-slate-700 px-4 py-2.5 text-left font-semibold">Detalle</th>
                    <th className="border-b border-slate-200 dark:border-slate-700 px-4 py-2.5 text-left font-semibold">Obs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loadingHist && (
                    <tr>
                      <td className="px-4 py-4 text-center text-sm text-slate-400" colSpan={4}>
                        Cargando historial...
                      </td>
                    </tr>
                  )}
                  {!loadingHist &&
                    historial.map((h: any) => (
                      <tr key={h.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">{tsToStr(h.createdAt)}</td>
                        <td className="px-4 py-2">
                          {h.guia ? (
                            <button
                              type="button"
                              onClick={() => abrirGuia(String(h.guia))}
                              className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              {String(h.guia)}
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-2 text-xs">
                          {(Array.isArray(h.items) ? h.items : []).map((it: any, idx: number) => (
                            <div key={idx} className="text-slate-700 dark:text-slate-300">
                              {it.materialId}
                              {it.undEntregada ? ` UND ${it.undEntregada}` : ""}
                              {it.metrosEntregados ? ` M ${it.metrosEntregados}` : ""}
                            </div>
                          ))}
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
                          {h.observacion || "—"}
                        </td>
                      </tr>
                    ))}
                  {!loadingHist && !historial.length && (
                    <tr>
                      <td className="px-4 py-4 text-center text-sm text-slate-400" colSpan={4}>
                        Sin historial.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
