"use client";
import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { despacharPersonalAction } from "../../server-actions";
import jsPDF from "jspdf";
import QRCode from "qrcode";

const MATS_INST = [
  "PRECON_50","PRECON_100","PRECON_150","PRECON_200",
  "ACTA","CONECTOR","ROSETA","ACOPLADOR","PACHCORD",
  "CINTILLO_30","CINTILLO_10","CINTILLO_BANDERA","CINTA_AISLANTE",
  "TEMPLADOR","ANCLAJE_P","CLEVI","HEBILLA_1_2","CINTA_BANDI_1_2","CAJA_GRAPAS",
] as const;

type PersonalItem = { uid: string; nombre: string; rol: "COORDINADOR" | "SUPERVISOR"; celular?: string };
type MatLine = { materialId: string; und: number; metros: number };
type EquipoItem = { sn: string; equipo?: string };

function shortName(name: string) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  const first = parts[0];
  const firstLast = parts.length >= 4 ? parts[2] || "" : parts[1] || "";
  return `${first} ${firstLast}`.trim() || first;
}

async function makeQrDataUrl(value: string) {
  return QRCode.toDataURL(value, { errorCorrectionLevel: "H", margin: 0, width: 320 });
}

function generarPDFTermico(guiaId: string, data: {
  fechaStr?: string; usuario?: string; destinatario?: string; rol?: string;
  observacion?: string; equipos?: EquipoItem[];
  materiales?: Record<string, number>; qrDataUrl?: string;
}) {
  const lines = 6 + 3 + (data.equipos?.length || 0) + Object.keys(data.materiales || {}).length + 4;
  const altura = Math.max(120, 10 + lines * 5 + (data.qrDataUrl ? 60 : 10) + 22);
  const pdf = new jsPDF({ unit: "mm", format: [80, altura] });
  const C = { align: "center" as const };
  let y = 10;
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(9);
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
  pdf.text(`DESTINATARIO: ${data.destinatario || "-"}`, 40, y, C); y += 5;
  pdf.text(`ROL: ${data.rol || "-"}`, 40, y, C); y += 6;
  pdf.setFont("helvetica", "normal");
  if (Object.keys(data.materiales || {}).length) {
    pdf.setFont("helvetica", "bold"); pdf.text("MATERIALES", 40, y, C); y += 5; pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    for (const [k, v] of Object.entries(data.materiales || {})) {
      if (v > 0) { pdf.text(`${k.replaceAll("_", " ")}: ${v}`, 6, y); y += 4; }
    }
    pdf.setFontSize(9); y += 2;
  }
  if (data.equipos?.length) {
    pdf.setFont("helvetica", "bold"); pdf.text("EQUIPOS", 40, y, C); y += 5; pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    for (const eq of data.equipos) { pdf.text(`${eq.equipo || ""} | ${eq.sn}`, 6, y); y += 4; }
    pdf.setFontSize(9); y += 2;
  }
  if (data.observacion) { pdf.text(`OBS: ${data.observacion}`, 40, y, C); y += 5; }
  if (data.qrDataUrl) { pdf.addImage(data.qrDataUrl, "PNG", 20, y, 40, 40); y += 45; }
  y += 5;
  pdf.line(6, y, 74, y); y += 5;
  pdf.text("Firma Almacen", 20, y, C); pdf.text("Firma Receptor", 60, y, C);
  return pdf;
}

async function printPDF(pdf: jsPDF) {
  const blob = pdf.output("blob");
  const url = URL.createObjectURL(blob);
  for (let i = 0; i < 2; i++) {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = url;
    document.body.appendChild(iframe);
    await new Promise((r) => setTimeout(r, 600));
    iframe.contentWindow?.print();
    await new Promise((r) => setTimeout(r, 1200));
    document.body.removeChild(iframe);
  }
  URL.revokeObjectURL(url);
}

export default function DespachoPersonalClient() {
  const [paso, setPaso] = useState<1 | 2>(1);
  const [lista, setLista] = useState<PersonalItem[]>([]);
  const [loadingLista, setLoadingLista] = useState(true);
  const [materiales, setMateriales] = useState<Record<string, { nombre: string; unidadTipo: string }>>({});
  const [busqueda, setBusqueda] = useState("");
  const [seleccionado, setSeleccionado] = useState<PersonalItem | null>(null);
  const [equipos, setEquipos] = useState<EquipoItem[]>([]);
  const [snInput, setSnInput] = useState("");
  const [validandoSn, setValidandoSn] = useState(false);
  const [matLines, setMatLines] = useState<MatLine[]>([]);
  const [observacion, setObservacion] = useState("");
  const [preview, setPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [usuarioNombre, setUsuarioNombre] = useState("");
  const transferIdRef = useRef<string>("");

  useEffect(() => {
    fetch("/api/personal-stock/list").then(r => r.json()).then(d => {
      if (d.ok) setLista(d.items || []);
    }).catch(() => {}).finally(() => setLoadingLista(false));
    fetch("/api/materiales/list?area=INSTALACIONES").then(r => r.json()).then(d => {
      if (d.ok) {
        const idx: Record<string, { nombre: string; unidadTipo: string }> = {};
        for (const m of (d.items || [])) idx[m.id] = { nombre: m.nombre || m.id, unidadTipo: m.unidadTipo || "UND" };
        setMateriales(idx);
      }
    }).catch(() => {});
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUsuarioNombre(shortName(d.nombre || d.uid || ""));
    }).catch(() => {});
    transferIdRef.current = `TX-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }, []);

  const listaFiltrada = lista.filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()) || p.rol.toLowerCase().includes(busqueda.toLowerCase()));

  async function validarSN(sn: string) {
    const snUp = sn.trim().toUpperCase();
    if (!snUp) return;
    if (equipos.find(e => e.sn === snUp)) { toast.error(`${snUp} ya está en la lista`); return; }
    setValidandoSn(true);
    try {
      const r = await fetch(`/api/equipos/validate?sn=${encodeURIComponent(snUp)}`);
      const d = await r.json();
      if (!d.ok) { toast.error(`${snUp}: ${d.error}`); return; }
      if (d.status !== "ALMACEN") { toast.error(`${snUp} no está en almacén (${d.status}: ${d.ubicacion || ""})`); return; }
      setEquipos(prev => [...prev, { sn: snUp, equipo: d.equipo }]);
      setSnInput("");
      toast.success(`${snUp} agregado`);
    } catch { toast.error("Error validando SN"); }
    finally { setValidandoSn(false); }
  }

  function setMatQty(materialId: string, field: "und" | "metros", value: number) {
    setMatLines(prev => {
      const existing = prev.find(m => m.materialId === materialId);
      if (existing) {
        return prev.map(m => m.materialId === materialId ? { ...m, [field]: value } : m);
      }
      return [...prev, { materialId, und: field === "und" ? value : 0, metros: field === "metros" ? value : 0 }];
    });
  }

  function getMatQty(materialId: string, field: "und" | "metros") {
    return matLines.find(m => m.materialId === materialId)?.[field] || 0;
  }

  const materialesConCantidad = matLines.filter(m => m.und > 0 || m.metros > 0);

  async function confirmar() {
    if (!seleccionado) return;
    setSubmitting(true);
    try {
      const payload = {
        transferId: transferIdRef.current,
        destinatarioUid: seleccionado.uid,
        destinatarioRol: seleccionado.rol,
        equipos: equipos.map(e => e.sn),
        materiales: materialesConCantidad,
        observacion,
      };
      const result = await despacharPersonalAction(payload);
      if (!result.ok) {
        toast.error((result.error.formErrors || []).join(" | "));
        return;
      }
      toast.success(`Guia ${result.guia} generada`);

      // PDF
      let qrDataUrl = "";
      const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
      const pdfPath = `guias/instalaciones/despacho-personal/${result.guia}.pdf`;
      if (bucket) {
        try { qrDataUrl = await makeQrDataUrl(`https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(pdfPath)}?alt=media`); } catch {}
      }
      const pdf = generarPDFTermico(result.guia, {
        fechaStr: new Date().toLocaleString("es-PE"),
        usuario: usuarioNombre,
        destinatario: seleccionado.nombre,
        rol: seleccionado.rol,
        observacion,
        equipos,
        materiales: Object.fromEntries(materialesConCantidad.map(m => [m.materialId, materiales[m.materialId]?.unidadTipo === "METROS" ? m.metros : m.und])),
        qrDataUrl,
      });

      // Subir guía
      const token = crypto.randomUUID?.() || Math.random().toString(36).slice(2);
      const pdfBlob = pdf.output("blob");
      const fd = new FormData();
      fd.append("file", new File([pdfBlob], `${result.guia}.pdf`, { type: "application/pdf" }));
      await fetch(`/api/transferencias/instalaciones/guia/upload?guiaId=${result.guia}&tipo=despacho-personal&token=${token}`, { method: "POST", body: fd }).catch(() => {});

      await printPDF(pdf);

      // WhatsApp
      if (seleccionado.celular) {
        const cel = String(seleccionado.celular).replace(/\D/g, "");
        const msg = encodeURIComponent(`Despacho ${result.guia}\nDestinatario: ${seleccionado.nombre} (${seleccionado.rol})\nEquipos: ${equipos.length}\nMateriales: ${materialesConCantidad.length}`);
        window.open(`https://wa.me/51${cel}?text=${msg}`, "_blank");
      }

      // Reset
      setPreview(false);
      setPaso(1);
      setSeleccionado(null);
      setEquipos([]);
      setMatLines([]);
      setObservacion("");
      transferIdRef.current = `TX-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    } catch (e: any) {
      toast.error(e?.message || "Error al despachar");
    } finally {
      setSubmitting(false);
    }
  }

  if (paso === 1) {
    return (
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">Paso 1 — Seleccionar destinatario</h2>
        <input
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          placeholder="Buscar por nombre o rol..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
        />
        {loadingLista ? (
          <p className="text-sm text-slate-500">Cargando...</p>
        ) : (
          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
            {listaFiltrada.length === 0 && <p className="p-4 text-sm text-slate-500">Sin resultados</p>}
            {listaFiltrada.map(p => (
              <button
                key={p.uid}
                className="w-full text-left px-4 py-3 hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors"
                onClick={() => { setSeleccionado(p); setPaso(2); }}
              >
                <span className="font-medium text-slate-900 dark:text-slate-100">{p.nombre}</span>
                <span className={`ml-2 text-xs font-semibold px-2 py-0.5 rounded-full ${p.rol === "COORDINADOR" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>{p.rol}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => { setPaso(1); setSeleccionado(null); }} className="text-sm text-blue-600 hover:underline dark:text-blue-400">← Volver</button>
        <span className="font-semibold text-slate-800 dark:text-slate-200">{seleccionado?.nombre}</span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${seleccionado?.rol === "COORDINADOR" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>{seleccionado?.rol}</span>
      </div>

      {/* Scanner SN */}
      <div className="space-y-2">
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">Paso 2 — Equipos</h2>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            placeholder="Escanear o escribir SN..."
            value={snInput}
            onChange={e => setSnInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); validarSN(snInput); } }}
            disabled={validandoSn}
          />
          <button
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            onClick={() => validarSN(snInput)}
            disabled={validandoSn || !snInput.trim()}
          >{validandoSn ? "..." : "Agregar"}</button>
        </div>
        {equipos.length > 0 && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">SN</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Equipo</th>
                  <th className="px-3 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {equipos.map(eq => (
                  <tr key={eq.sn}>
                    <td className="px-3 py-2 font-mono text-xs text-slate-900 dark:text-slate-100">{eq.sn}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{eq.equipo || "—"}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => setEquipos(prev => prev.filter(e => e.sn !== eq.sn))} className="text-red-500 hover:text-red-700 text-xs">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Materiales */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Materiales</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {MATS_INST.map(matId => {
            const info = materiales[matId];
            const tipo = info?.unidadTipo || "UND";
            return (
              <div key={matId} className="rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{matId.replaceAll("_", " ")}</p>
                <div className="mt-1 flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    value={getMatQty(matId, tipo === "METROS" ? "metros" : "und") || ""}
                    onChange={e => setMatQty(matId, tipo === "METROS" ? "metros" : "und", Number(e.target.value))}
                    className="w-full rounded border border-slate-300 bg-white px-1.5 py-1 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="0"
                  />
                  <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{tipo === "METROS" ? "m" : "und"}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Observación</label>
        <textarea
          value={observacion}
          onChange={e => setObservacion(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          rows={2}
          placeholder="Opcional..."
        />
      </div>

      <button
        className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        onClick={() => setPreview(true)}
        disabled={equipos.length === 0 && materialesConCantidad.length === 0}
      >
        Vista previa y confirmar
      </button>

      {/* Preview modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl dark:bg-slate-900">
            <div className="border-b border-slate-200 p-4 dark:border-slate-700">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">Confirmar despacho</h3>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <p><span className="font-medium">Destinatario:</span> {seleccionado?.nombre} ({seleccionado?.rol})</p>
              <p><span className="font-medium">Equipos:</span> {equipos.length}</p>
              {materialesConCantidad.length > 0 && (
                <div>
                  <p className="font-medium mb-1">Materiales:</p>
                  <ul className="space-y-0.5 text-slate-600 dark:text-slate-400">
                    {materialesConCantidad.map(m => {
                      const tipo = materiales[m.materialId]?.unidadTipo || "UND";
                      return <li key={m.materialId}>• {m.materialId.replaceAll("_", " ")}: {tipo === "METROS" ? m.metros + " m" : m.und + " und"}</li>;
                    })}
                  </ul>
                </div>
              )}
              {observacion && <p><span className="font-medium">Obs:</span> {observacion}</p>}
            </div>
            <div className="flex gap-2 border-t border-slate-200 p-4 dark:border-slate-700">
              <button onClick={() => setPreview(false)} className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">Cancelar</button>
              <button onClick={confirmar} disabled={submitting} className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                {submitting ? "Procesando..." : "Confirmar despacho"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
