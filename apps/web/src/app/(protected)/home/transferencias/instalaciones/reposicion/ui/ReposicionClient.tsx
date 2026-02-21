"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import QRCode from "qrcode";
import { toast } from "sonner";

type CuadrillaOpt = { id: string; nombre: string; coordinadorUid?: string };
type MaterialOpt = { id: string; nombre?: string; unidadTipo?: "UND" | "METROS" | null; fotoUrl?: string };

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
    try {
      document.body.removeChild(iframe);
    } catch {}
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
    if (win) {
      win.opener = null;
      return true;
    }
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

  const loadHistorial = async (id: string) => {
    if (!id) {
      setHistorial([]);
      setStock([]);
      return;
    }
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
    if (!id) {
      setCuadrillaInfo({});
      return;
    }
    try {
      const res = await fetch(`/api/cuadrillas/info?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) {
        setCuadrillaInfo({});
        return;
      }
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
    if (!first) {
      toast.error("No se encontro cuadrilla");
      return;
    }
    seleccionarCuadrilla(first);
  };

  const submit = async () => {
    if (!cuadrillaId) return toast.error("Selecciona cuadrilla");
    if (!items.length) return toast.error("Agrega materiales");

    const payloadItems: PayloadItem[] = items.map((it) => {
      const mat = materialById.get(it.materialId);
      const unidad = mat?.unidadTipo === "METROS" ? "METROS" : "UND";
      const und = unidad === "UND" ? Math.max(0, Math.floor(Number(it.und || 0))) : 0;
      const metros = unidad === "METROS" ? Math.max(0, Number(it.metros || 0)) : 0;
      return { materialId: it.materialId, und, metros, observacion: it.observacion };
    });
    if (payloadItems.some((x) => x.und <= 0 && x.metros <= 0)) {
      return toast.error("Completa cantidades validas");
    }

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
          cuadrillaNombre: cuadrillaInfo.nombre || cuadrillas.find((c) => c.id === cuadrillaId)?.nombre || cuadrillaId,
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
      const cuadrillaNombre = String(body?.cuadrillaNombre || cuadrillaInfo.nombre || cuadrillaId);
      const coordinadorUid = String(body?.coordinadorUid || cuadrillaInfo.coordinadorUid || "");
      const coordinadorNombre = String(body?.coordinadorNombre || cuadrillaInfo.coordinadorNombre || "");

      if (guia) {
        const token = typeof crypto?.randomUUID === "function"
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
    <div className="space-y-4">
      {step === 1 && (
        <section className="rounded-xl border bg-white p-4 space-y-3">
          <div className="rounded border p-3">
            <div className="text-sm font-medium">Paso 1  -  Seleccionar cuadrilla</div>
            <div className="text-xs text-slate-500">Escribe nombre o ID y presiona Enter para tomar la primera coincidencia.</div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs text-slate-500">Cuadrilla</label>
              <div className="relative mt-1 space-y-1">
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
                    if (e.key === "Enter") {
                      e.preventDefault();
                      buscarYSeleccionarCuadrilla();
                    }
                    if (e.key === "Escape") setComboOpen(false);
                  }}
                  placeholder="Escribe nombre o ID de cuadrilla..."
                  className="w-full rounded border px-2 py-2 text-sm"
                />
                {comboOpen && (
                  <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-52 overflow-auto rounded border bg-white shadow">
                    {cuadrillasFiltradas.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full border-b px-2 py-2 text-left text-sm hover:bg-slate-50"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          seleccionarCuadrilla(c);
                        }}
                      >
                        <div className="font-medium">{c.nombre || c.id}</div>
                        <div className="text-xs text-slate-500">{c.id}</div>
                      </button>
                    ))}
                    {!cuadrillasFiltradas.length && (
                      <div className="px-2 py-2 text-xs text-slate-500">Sin resultados</div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="rounded border bg-slate-50 p-3 text-xs text-slate-600">
              <div>Cuadrilla: <b>{cuadrillaInfo.nombre || "-"}</b></div>
              <div>Coordinador: <b>{cuadrillaInfo.coordinadorNombre || "-"}</b></div>
              <div>Tecnicos: <b>{(cuadrillaInfo.tecnicosNombres || []).slice(0, 3).join(", ") || "-"}</b></div>
              <div>Segmento/Tipo: <b>{[cuadrillaInfo.segmento, cuadrillaInfo.tipo].filter(Boolean).join(" | ") || "-"}</b></div>
              <div>Zona/Vehiculo: <b>{[cuadrillaInfo.zonaId, cuadrillaInfo.vehiculo].filter(Boolean).join(" | ") || "-"}</b></div>
              <div>Stock considerado: <b>Stock de cuadrilla</b></div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!cuadrillaId}
              onClick={() => setStep(2)}
              className="rounded bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="rounded-xl border bg-white p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="rounded border px-3 py-2 hover:bg-slate-50"
              onClick={() => setStep(1)}
            >
              Paso 1
            </button>
            <div className="rounded border px-3 py-2 text-xs">
              <div className="font-medium">Cuadrilla</div>
              <div>ID: {cuadrillaId || "-"} {cuadrillaInfo.nombre ? ` - ${cuadrillaInfo.nombre}` : ""}</div>
            </div>
          </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Registro de reposicion</h2>
            <p className="text-xs text-slate-500">Canje por material malogrado de cuadrilla (descuenta almacen, no suma almacen).</p>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={guardando || !cuadrillaId || !items.length}
            className="rounded bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {guardando ? "Registrando..." : "Registrar reposicion"}
          </button>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold text-slate-600">Materiales frecuentes</div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {focusMaterials.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => addItem(m.id)}
                className="w-32 shrink-0 rounded border p-2 text-left hover:bg-slate-50"
              >
                {m.fotoUrl ? (
                  <img
                    src={m.fotoUrl}
                    alt={m.nombre || m.id}
                    className="mb-2 h-16 w-full rounded border bg-white p-1 object-contain"
                  />
                ) : (
                  <div className="mb-2 flex h-16 w-full items-center justify-center rounded bg-slate-100 text-xs text-slate-500">
                    Sin foto
                  </div>
                )}
                <div className="text-xs font-semibold">{m.id}</div>
                <div className="text-[11px] text-slate-500">{m.nombre || "-"}</div>
              </button>
            ))}
          </div>
        </div>

        <details open={openOtros} onToggle={(e) => setOpenOtros((e.target as HTMLDetailsElement).open)} className="rounded border p-2">
          <summary className="cursor-pointer text-sm font-medium">Otros materiales</summary>
          <div className="relative mt-2">
            <input
              value={materialSearch}
              onChange={(e) => {
                setMaterialSearch(e.target.value);
                setComboMatOpen(true);
              }}
              onFocus={() => setComboMatOpen(true)}
              onBlur={() => setTimeout(() => setComboMatOpen(false), 150)}
              placeholder="Buscar por ID o nombre..."
              className="w-full rounded border px-2 py-2 text-sm"
            />
            {comboMatOpen && (
              <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-52 overflow-auto rounded border bg-white shadow">
                {otrosMateriales.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      addItem(m.id);
                      setComboMatOpen(false);
                    }}
                    className="w-full border-b px-2 py-1 text-left text-xs hover:bg-slate-50"
                  >
                    {m.id} {m.nombre ? `- ${m.nombre}` : ""} ({m.unidadTipo || "UND"})
                  </button>
                ))}
                {!otrosMateriales.length && (
                  <div className="px-2 py-2 text-xs text-slate-500">Sin resultados</div>
                )}
              </div>
            )}
          </div>
        </details>

        <div>
          <label className="text-xs text-slate-500">Observacion general</label>
          <textarea
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded border px-2 py-2 text-sm"
          />
        </div>

        <div className="overflow-x-auto rounded border">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="border p-2 text-left">Material</th>
                <th className="border p-2 text-left">Cantidad</th>
                <th className="border p-2 text-left">Observacion item</th>
                <th className="border p-2 text-left">Accion</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const m = materialById.get(it.materialId);
                const isMetros = m?.unidadTipo === "METROS";
                return (
                  <tr key={it.materialId}>
                    <td className="border p-2">
                      <div className="font-medium">{it.materialId}</div>
                      <div className="text-xs text-slate-500">{m?.nombre || ""}</div>
                    </td>
                    <td className="border p-2">
                      {isMetros ? (
                        <input
                          value={it.metros}
                          onChange={(e) =>
                            setItems((prev) => prev.map((p) => p.materialId === it.materialId ? { ...p, metros: e.target.value } : p))
                          }
                          className="w-28 rounded border px-2 py-1 text-sm"
                          placeholder="Metros"
                        />
                      ) : (
                        <input
                          value={it.und}
                          onChange={(e) =>
                            setItems((prev) => prev.map((p) => p.materialId === it.materialId ? { ...p, und: e.target.value.replace(/\D/g, "") } : p))
                          }
                          className="w-28 rounded border px-2 py-1 text-sm"
                          placeholder="UND"
                        />
                      )}
                    </td>
                    <td className="border p-2">
                      <input
                        value={it.observacion}
                        onChange={(e) =>
                          setItems((prev) => prev.map((p) => p.materialId === it.materialId ? { ...p, observacion: e.target.value } : p))
                        }
                        className="w-full rounded border px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="border p-2">
                      <button type="button" onClick={() => removeItem(it.materialId)} className="text-red-600 hover:underline">
                        Quitar
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!items.length && (
                <tr><td className="border p-3 text-center text-slate-500" colSpan={4}>Aun no hay materiales en la lista.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        </section>
      )}

      <section className="rounded-xl border bg-white p-4">
        <h2 className="text-lg font-semibold">Historial de reposicion de cuadrilla</h2>
        {!cuadrillaId && <p className="mt-2 text-sm text-slate-500">Selecciona una cuadrilla para ver historial.</p>}
        {cuadrillaId && (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div className="rounded border p-3">
              <div className="mb-2 text-sm font-semibold">Stock actual de cuadrilla</div>
              <div className="max-h-56 overflow-auto text-sm">
                {stock.map((s: any) => (
                  <div key={s.id} className="border-b py-1">
                    {s.materialId || s.id}:{" "}
                    <b>{String(s.unidadTipo || "UND").toUpperCase() === "METROS" ? Number(s.stockCm || 0) / 100 : Number(s.stockUnd || 0)}</b>
                  </div>
                ))}
                {!stock.length && <div className="text-slate-500">Sin stock registrado.</div>}
              </div>
            </div>
            <div className="rounded border p-3">
              <div className="mb-2 text-sm font-semibold">Ultimas reposiciones</div>
              <div className="max-h-56 overflow-auto text-sm">
                {historial.slice(0, 8).map((h: any) => (
                  <div key={h.id} className="border-b py-1">
                    <div className="text-xs text-slate-500">{tsToStr(h.createdAt)}</div>
                    <div>
                      Guia:{" "}
                      {h.guia ? (
                        <button
                          type="button"
                          onClick={() => abrirGuia(String(h.guia))}
                          className="font-semibold text-blue-700 hover:underline"
                        >
                          {String(h.guia)}
                        </button>
                      ) : (
                        <b>-</b>
                      )}
                    </div>
                  </div>
                ))}
                {!historial.length && <div className="text-slate-500">Sin reposiciones.</div>}
              </div>
            </div>
          </div>
        )}

        {cuadrillaId && (
          <div className="mt-3 overflow-x-auto rounded border">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="border p-2 text-left">Fecha</th>
                  <th className="border p-2 text-left">Guia</th>
                  <th className="border p-2 text-left">Detalle</th>
                  <th className="border p-2 text-left">Obs</th>
                </tr>
              </thead>
              <tbody>
                {loadingHist && (
                  <tr><td className="border p-3 text-center text-slate-500" colSpan={4}>Cargando historial...</td></tr>
                )}
                {!loadingHist && historial.map((h: any) => (
                  <tr key={h.id}>
                    <td className="border p-2 text-xs">{tsToStr(h.createdAt)}</td>
                    <td className="border p-2">
                      {h.guia ? (
                        <button
                          type="button"
                          onClick={() => abrirGuia(String(h.guia))}
                          className="text-blue-700 hover:underline"
                        >
                          {String(h.guia)}
                        </button>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="border p-2 text-xs">
                      {(Array.isArray(h.items) ? h.items : []).map((it: any, idx: number) => (
                        <div key={idx}>
                          {it.materialId} {it.undEntregada ? `UND ${it.undEntregada}` : ""} {it.metrosEntregados ? `M ${it.metrosEntregados}` : ""}
                        </div>
                      ))}
                    </td>
                    <td className="border p-2 text-xs">{h.observacion || "Sin observaciones"}</td>
                  </tr>
                ))}
                {!loadingHist && !historial.length && (
                  <tr><td className="border p-3 text-center text-slate-500" colSpan={4}>Sin historial.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}


