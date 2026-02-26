"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import QRCode from "qrcode";
import { toast } from "sonner";

type CoordinadorOpt = { uid: string; label: string };
type CuadrillaOpt = { id: string; nombre: string; coordinadorUid?: string };
type TecnicoOpt = { id: string; nombreCorto: string; cuadrillaId?: string; cuadrillaNombre?: string };
type MaterialOpt = { id: string; nombre?: string; unidadTipo?: "UND" | "METROS" | null };

type ItemForm = {
  materialId: string;
  und: string;
  metros: string;
  estadoDevolucion: "BUENO" | "MALO" | "NO_ENTREGA";
  sinCosto: boolean;
  requiereDevolucion: boolean;
  observacion: string;
};

type HistItem = {
  id: string;
  tipo?: string;
  createdAt?: any;
  items?: Array<any>;
  observacion?: string;
};

type PayloadItem = {
  materialId: string;
  und: number;
  metros: number;
  estado: "BUENO" | "MALO" | "NO_ENTREGA";
  sinCosto: boolean;
  requiereDevolucion: boolean;
  observacion: string;
};

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

async function obtenerCelularTecnico(tecnicoUid: string) {
  if (!tecnicoUid) return "";
  const res = await fetch(`/api/usuarios/phones?uids=${encodeURIComponent(tecnicoUid)}`, { cache: "no-store" });
  if (!res.ok) return "";
  const data = await res.json().catch(() => ({}));
  const items = Array.isArray(data?.items) ? data.items : [];
  const celular = normalizePhone(String(items[0]?.celular || ""));
  return celular || "";
}

async function makeQrDataUrl(value: string) {
  return QRCode.toDataURL(value, {
    errorCorrectionLevel: "H",
    margin: 0,
    width: 300,
  });
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

function generarPdfGuiaTecnico80mm(args: {
  guia: string;
  modo: "ENTREGA" | "DEVOLUCION";
  tecnicoNombre: string;
  cuadrillaNombre: string;
  coordinadorNombre: string;
  usuarioNombre: string;
  observacion: string;
  items: PayloadItem[];
  qrDataUrl?: string;
}) {
  const rowCount = Math.max(1, args.items.length);
  const altura = Math.max(130, 115 + rowCount * 5 + (args.qrDataUrl ? 48 : 0));
  const pdf = new jsPDF({ unit: "mm", format: [80, altura] });
  let y = 10;
  const C = { align: "center" as const };

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text("CONSTRUCCION DE REDES M&D S.A.C", 40, y, C); y += 5;
  pdf.text("RUC: 20601345979", 40, y, C); y += 6;
  pdf.setFont("helvetica", "bold");
  pdf.text(`GUIA: ${args.guia}`, 40, y, C); y += 5;
  pdf.text(args.modo === "ENTREGA" ? "ENTREGA A TECNICO" : "DEVOLUCION DE TECNICO", 40, y, C); y += 5;
  pdf.setFont("helvetica", "normal");
  pdf.text(`FECHA: ${new Date().toLocaleString("es-PE")}`, 40, y, C); y += 5;
  pdf.text(`USUARIO: ${args.usuarioNombre || "-"}`, 40, y, C); y += 5;
  pdf.setFont("helvetica", "bold");
  pdf.text(`TECNICO: ${args.tecnicoNombre || "-"}`, 40, y, C); y += 5;
  pdf.setFont("helvetica", "normal");
  if (args.cuadrillaNombre) {
    pdf.text(`CUADRILLA: ${args.cuadrillaNombre}`, 40, y, C);
    y += 5;
  }
  if (args.coordinadorNombre) {
    pdf.text(`COORDINADOR: ${args.coordinadorNombre}`, 40, y, C);
    y += 5;
  }

  y += 2;
  pdf.setFont("helvetica", "bold");
  pdf.text("DETALLE", 40, y, C);
  y += 5;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  for (const it of args.items) {
    const qty = it.und > 0 ? `UND ${it.und}` : `M ${it.metros}`;
    const estadoTxt = args.modo === "DEVOLUCION" ? ` | ${it.estado}` : "";
    const line = `${it.materialId}: ${qty}${estadoTxt}`;
    const lines = pdf.splitTextToSize(line, 72) as string[];
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

  // Deja aire entre el QR y la zona de firmas para evitar que quede pegado.
  y += 10;
  pdf.line(10, y, 40, y);
  pdf.line(45, y, 75, y);
  y += 8;
  pdf.text(args.tecnicoNombre || "Tecnico", 25, y, { align: "center" });
  pdf.text(args.usuarioNombre || "Almacen", 60, y, { align: "center" });

  return pdf;
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

export default function TecnicosMaterialesClient() {
  const [coordinadores, setCoordinadores] = useState<CoordinadorOpt[]>([]);
  const [cuadrillas, setCuadrillas] = useState<CuadrillaOpt[]>([]);
  const [tecnicos, setTecnicos] = useState<TecnicoOpt[]>([]);
  const [materiales, setMateriales] = useState<MaterialOpt[]>([]);

  const [coordinadorUid, setCoordinadorUid] = useState("");
  const [cuadrillaId, setCuadrillaId] = useState("");
  const [tecnicoUid, setTecnicoUid] = useState("");

  const [modo, setModo] = useState<"ENTREGA" | "DEVOLUCION">("ENTREGA");
  const [observacion, setObservacion] = useState("");
  const [materialSearch, setMaterialSearch] = useState("");
  const [items, setItems] = useState<ItemForm[]>([]);
  const [guardando, setGuardando] = useState(false);

  const [historial, setHistorial] = useState<HistItem[]>([]);
  const [stock, setStock] = useState<any[]>([]);
  const [activos, setActivos] = useState<any[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);
  const waWindowRef = useRef<Window | null>(null);

  const tecnicoActual = useMemo(() => tecnicos.find((t) => t.id === tecnicoUid) || null, [tecnicos, tecnicoUid]);

  const cuadrillasFiltradas = useMemo(() => {
    if (!coordinadorUid) return cuadrillas;
    return cuadrillas.filter((c) => String(c.coordinadorUid || "") === coordinadorUid);
  }, [cuadrillas, coordinadorUid]);

  const tecnicosFiltrados = useMemo(() => {
    let base = tecnicos;
    if (cuadrillaId) base = base.filter((t) => String(t.cuadrillaId || "") === cuadrillaId);
    return base;
  }, [tecnicos, cuadrillaId]);

  const materialesFiltrados = useMemo(() => {
    const q = materialSearch.trim().toLowerCase();
    if (!q) return materiales.slice(0, 80);
    return materiales.filter((m) => `${m.id} ${m.nombre || ""}`.toLowerCase().includes(q)).slice(0, 80);
  }, [materiales, materialSearch]);

  const addItem = (materialId: string) => {
    if (!materialId) return;
    if (items.some((i) => i.materialId === materialId)) {
      toast.error("Ese material ya esta agregado");
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        materialId,
        und: "",
        metros: "",
        estadoDevolucion: "BUENO",
        sinCosto: true,
        requiereDevolucion: true,
        observacion: "",
      },
    ]);
    setMaterialSearch("");
  };

  const removeItem = (materialId: string) => setItems((prev) => prev.filter((i) => i.materialId !== materialId));

  const loadHistorial = async (uid: string) => {
    if (!uid) {
      setHistorial([]);
      setStock([]);
      setActivos([]);
      return;
    }
    setLoadingHist(true);
    try {
      const res = await fetch(`/api/mantenimiento/tecnicos-materiales/historial?tecnicoUid=${encodeURIComponent(uid)}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      setHistorial(Array.isArray(body.historial) ? body.historial : []);
      setStock(Array.isArray(body.stock) ? body.stock : []);
      setActivos(Array.isArray(body.activos) ? body.activos : []);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo cargar el historial");
      setHistorial([]);
      setStock([]);
      setActivos([]);
    } finally {
      setLoadingHist(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const [cRes, qRes, tRes, mRes] = await Promise.all([
          fetch("/api/usuarios/by-role?role=COORDINADOR&area=MANTENIMIENTO", { cache: "no-store" }),
          fetch("/api/cuadrillas/list?area=MANTENIMIENTO", { cache: "no-store" }),
          fetch("/api/tecnicos/gestion/list?area=MANTENIMIENTO", { cache: "no-store" }),
          fetch("/api/materiales/list", { cache: "no-store" }),
        ]);
        const [cBody, qBody, tBody, mBody] = await Promise.all([
          cRes.json().catch(() => ({})),
          qRes.json().catch(() => ({})),
          tRes.json().catch(() => ({})),
          mRes.json().catch(() => ({})),
        ]);
        setCoordinadores(Array.isArray(cBody?.items) ? cBody.items : []);
        setCuadrillas(Array.isArray(qBody?.items) ? qBody.items : []);
        setTecnicos(Array.isArray(tBody?.items) ? tBody.items : []);
        setMateriales(Array.isArray(mBody?.items) ? mBody.items : []);
      } catch {
        toast.error("No se pudo cargar catalogos");
      }
    })();
  }, []);

  useEffect(() => {
    loadHistorial(tecnicoUid);
  }, [tecnicoUid]);

  const submit = async () => {
    if (!tecnicoUid) return toast.error("Selecciona tecnico");
    if (!items.length) return toast.error("Agrega materiales");

    const payloadItems: PayloadItem[] = items.map((it) => {
      const mat = materiales.find((m) => m.id === it.materialId);
      const unidad = mat?.unidadTipo === "METROS" ? "METROS" : "UND";
      const und = unidad === "UND" ? Math.max(0, Math.floor(Number(it.und || 0))) : 0;
      const metros = unidad === "METROS" ? Math.max(0, Number(it.metros || 0)) : 0;
      return {
        materialId: it.materialId,
        und,
        metros,
        estado: it.estadoDevolucion,
        sinCosto: it.sinCosto,
        requiereDevolucion: it.requiereDevolucion,
        observacion: it.observacion,
      };
    });

    setGuardando(true);
    try {
      waWindowRef.current = window.open("", "_blank");
      if (waWindowRef.current && !waWindowRef.current.closed) {
        waWindowRef.current.document.title = "WhatsApp";
      }
    } catch {
      waWindowRef.current = null;
    }

    try {
      const endpoint =
        modo === "ENTREGA"
          ? "/api/mantenimiento/tecnicos-materiales/entrega"
          : "/api/mantenimiento/tecnicos-materiales/devolucion";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tecnicoUid,
          tecnicoNombre: tecnicoActual?.nombreCorto || tecnicoUid,
          coordinadorUid,
          coordinadorNombre: coordinadores.find((c) => c.uid === coordinadorUid)?.label || "",
          cuadrillaId,
          cuadrillaNombre: cuadrillas.find((c) => c.id === cuadrillaId)?.nombre || "",
          observacion,
          items: payloadItems,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));

      const guia = String(body?.guia || "").trim();
      const usuarioNombre = String(body?.actorNombre || "").trim();
      if (guia) {
        const token = typeof crypto?.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "";
        const path = `guias/mantenimiento/tecnicos-materiales/${guia}.pdf`;
        const encodedPath = encodeURIComponent(path);
        const directUrl = bucket
          ? `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${token}`
          : "";

        const pdf = generarPdfGuiaTecnico80mm({
          guia,
          modo,
          tecnicoNombre: tecnicoActual?.nombreCorto || tecnicoUid,
          cuadrillaNombre: cuadrillas.find((c) => c.id === cuadrillaId)?.nombre || "",
          coordinadorNombre: coordinadores.find((c) => c.uid === coordinadorUid)?.label || "",
          usuarioNombre: usuarioNombre || "Usuario",
          observacion,
          items: payloadItems,
          qrDataUrl: directUrl ? await makeQrDataUrl(directUrl).catch(() => undefined) : undefined,
        });
        const blob = pdf.output("blob");

        const upRes = await fetch(
          `/api/transferencias/mantenimiento/guia/upload?guiaId=${encodeURIComponent(guia)}&tipo=tecnicos-materiales&token=${encodeURIComponent(token)}`,
          {
            method: "POST",
            headers: { "content-type": "application/pdf" },
            body: await blob.arrayBuffer(),
          }
        );
        if (!upRes.ok) throw new Error("NO_SE_PUDO_SUBIR_LA_GUIA");
        printThermalBlobTwice(pdf);

        const celularTecnico = await obtenerCelularTecnico(tecnicoUid);
        const lines: string[] = [];
        lines.push(`*${modo === "ENTREGA" ? "Entrega de Materiales" : "Devolucion de Materiales"}*`);
        lines.push(`Guia: ${guia}`);
        lines.push(`Tecnico: ${tecnicoActual?.nombreCorto || tecnicoUid}`);
        if (cuadrillaId) lines.push(`Cuadrilla: ${cuadrillas.find((c) => c.id === cuadrillaId)?.nombre || cuadrillaId}`);
        lines.push(`Registrado por: ${usuarioNombre || "Usuario"}`);
        lines.push(`Fecha/Hora: ${new Date().toLocaleString("es-PE")}`);
        lines.push("");
        lines.push("*Detalle:*");
        payloadItems.forEach((it) => {
          const qty = it.und > 0 ? `UND ${it.und}` : `M ${it.metros}`;
          const estado = modo === "DEVOLUCION" ? ` | ${it.estado}` : "";
          lines.push(`- ${it.materialId}: ${qty}${estado}`);
        });
        if (directUrl) {
          lines.push("");
          lines.push("Comprobante:");
          lines.push(directUrl);
        }
        const sent = enviarWhatsApp(celularTecnico, lines.join("\n"), waWindowRef.current);
        if (!sent) toast.message("No se encontro celular del tecnico");
      } else if (waWindowRef.current && !waWindowRef.current.closed) {
        waWindowRef.current.close();
      }

      toast.success(`${modo === "ENTREGA" ? "Entrega" : "Devolucion"} registrada`);
      setItems([]);
      setObservacion("");
      await loadHistorial(tecnicoUid);
    } catch (e: any) {
      if (waWindowRef.current && !waWindowRef.current.closed) waWindowRef.current.close();
      toast.error(e?.message || "No se pudo registrar el movimiento");
    } finally {
      setGuardando(false);
      waWindowRef.current = null;
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="text-xs text-slate-500">Coordinador</label>
            <select
              value={coordinadorUid}
              onChange={(e) => {
                setCoordinadorUid(e.target.value);
                setCuadrillaId("");
                setTecnicoUid("");
              }}
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">Todos</option>
              {coordinadores.map((c) => (
                <option key={c.uid} value={c.uid}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500">Cuadrilla</label>
            <select
              value={cuadrillaId}
              onChange={(e) => {
                setCuadrillaId(e.target.value);
                setTecnicoUid("");
              }}
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">Todas</option>
              {cuadrillasFiltradas.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre || c.id}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500">Tecnico</label>
            <select
              value={tecnicoUid}
              onChange={(e) => setTecnicoUid(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">Selecciona tecnico...</option>
              {tecnicosFiltrados.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombreCorto} {t.cuadrillaNombre ? `| ${t.cuadrillaNombre}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded border border-slate-300 p-1 text-sm dark:border-slate-700">
            <button
              type="button"
              onClick={() => setModo("ENTREGA")}
              className={`rounded px-3 py-1 ${modo === "ENTREGA" ? "bg-slate-900 text-white" : "text-slate-700 dark:text-slate-200"}`}
            >
              Entrega
            </button>
            <button
              type="button"
              onClick={() => setModo("DEVOLUCION")}
              className={`rounded px-3 py-1 ${modo === "DEVOLUCION" ? "bg-slate-900 text-white" : "text-slate-700 dark:text-slate-200"}`}
            >
              Devolucion
            </button>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={guardando || !tecnicoUid || !items.length}
            className="rounded bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {guardando ? "Registrando..." : `Registrar ${modo}`}
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs text-slate-500">Buscar material</label>
            <input
              value={materialSearch}
              onChange={(e) => setMaterialSearch(e.target.value)}
              placeholder="Código o nombre del material..."
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <div className="mt-2 max-h-40 overflow-auto rounded border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              {materialesFiltrados.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => addItem(m.id)}
                  className="w-full border-b px-2 py-1 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {m.id} {m.nombre ? `- ${m.nombre}` : ""} ({m.unidadTipo || "UND"})
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500">Observacion general</label>
            <textarea
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              rows={5}
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded border">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <tr>
                <th className="border p-2 text-left">Material</th>
                <th className="border p-2 text-left">Cantidad</th>
                {modo === "ENTREGA" && <th className="border p-2 text-left">Regla</th>}
                {modo === "DEVOLUCION" && <th className="border p-2 text-left">Estado</th>}
                <th className="border p-2 text-left">Observacion</th>
                <th className="border p-2 text-left">Accion</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const m = materiales.find((x) => x.id === it.materialId);
                const isMetros = m?.unidadTipo === "METROS";
                return (
                  <tr key={it.materialId} className="border">
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
                    {modo === "ENTREGA" && (
                      <td className="border p-2 text-xs">
                        <label className="mr-3 inline-flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={it.sinCosto}
                            onChange={(e) =>
                              setItems((prev) => prev.map((p) => p.materialId === it.materialId ? { ...p, sinCosto: e.target.checked } : p))
                            }
                          />
                          Sin costo
                        </label>
                        <label className="inline-flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={it.requiereDevolucion}
                            onChange={(e) =>
                              setItems((prev) => prev.map((p) => p.materialId === it.materialId ? { ...p, requiereDevolucion: e.target.checked } : p))
                            }
                          />
                          Requiere devolucion
                        </label>
                      </td>
                    )}
                    {modo === "DEVOLUCION" && (
                      <td className="border p-2">
                        <select
                          value={it.estadoDevolucion}
                          onChange={(e) =>
                            setItems((prev) => prev.map((p) => p.materialId === it.materialId ? { ...p, estadoDevolucion: e.target.value as any } : p))
                          }
                          className="ui-select-inline-sm"
                        >
                          <option value="BUENO">BUENO</option>
                          <option value="MALO">MALO</option>
                          <option value="NO_ENTREGA">NO_ENTREGA</option>
                        </select>
                      </td>
                    )}
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
                <tr>
                  <td className="border p-4 text-center text-slate-500" colSpan={modo === "ENTREGA" ? 5 : 5}>
                    Aun no hay materiales en la lista.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4">
        <h2 className="text-lg font-semibold">Historial del tecnico</h2>
        {!tecnicoUid && <p className="mt-2 text-sm text-slate-500">Selecciona un tecnico para ver su historial.</p>}
        {tecnicoUid && (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div className="rounded border p-3">
              <div className="mb-2 text-sm font-semibold">Stock actual del tecnico</div>
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
              <div className="mb-2 text-sm font-semibold">Pendiente por devolver</div>
              <div className="max-h-56 overflow-auto text-sm">
                {activos.map((a: any) => (
                  <div key={a.id} className="border-b py-1">
                    {a.materialId || a.id}:{" "}
                    <b>{String(a.unidadTipo || "UND").toUpperCase() === "METROS" ? Number(a.pendienteCm || 0) / 100 : Number(a.pendienteUnd || 0)}</b>
                  </div>
                ))}
                {!activos.length && <div className="text-slate-500">Sin pendientes.</div>}
              </div>
            </div>
          </div>
        )}

        {tecnicoUid && (
          <div className="mt-3 overflow-x-auto rounded border">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <tr>
                  <th className="border p-2 text-left">Fecha</th>
                  <th className="border p-2 text-left">Tipo</th>
                  <th className="border p-2 text-left">Detalle</th>
                  <th className="border p-2 text-left">Obs</th>
                </tr>
              </thead>
              <tbody>
                {loadingHist && (
                  <tr><td className="border p-3 text-center text-slate-500" colSpan={4}>Cargando historial...</td></tr>
                )}
                {!loadingHist && historial.map((h) => (
                  <tr key={h.id} className="border">
                    <td className="border p-2 text-xs">{tsToStr(h.createdAt)}</td>
                    <td className="border p-2">{h.tipo || "-"}</td>
                    <td className="border p-2 text-xs">
                      {(Array.isArray(h.items) ? h.items : []).map((it: any, idx: number) => (
                        <div key={idx}>
                          {it.materialId} {it.und ? `UND ${it.und}` : ""} {it.metros ? `M ${it.metros}` : ""} {it.estadoDevolucion ? `(${it.estadoDevolucion})` : ""}
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






