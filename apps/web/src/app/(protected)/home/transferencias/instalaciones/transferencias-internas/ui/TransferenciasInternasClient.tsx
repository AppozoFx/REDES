"use client";
import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { transferirEntreEntidadesAction } from "../../server-actions";
import jsPDF from "jspdf";

const MATS_INST = [
  "PRECON_50","PRECON_100","PRECON_150","PRECON_200",
  "ACTA","CONECTOR","ROSETA","ACOPLADOR","PACHCORD",
  "CINTILLO_30","CINTILLO_10","CINTILLO_BANDERA","CINTA_AISLANTE",
  "TEMPLADOR","ANCLAJE_P","CLEVI","HEBILLA_1_2","CINTA_BANDI_1_2","CAJA_GRAPAS",
] as const;

type EntidadTipo = "CUADRILLA" | "PERSONAL";
type Entidad = { tipo: EntidadTipo; id: string; nombre: string };
type SerieItem = { SN: string; equipo?: string; descripcion?: string; guia_despacho?: string; f_despachoYmd?: string };
type MatLine = { materialId: string; und: number; metros: number };

function shortName(name: string) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  const first = parts[0];
  const firstLast = parts.length >= 4 ? parts[2] || "" : parts[1] || "";
  return `${first} ${firstLast}`.trim() || first;
}

function generarPDF(guiaId: string, data: {
  fechaStr?: string; usuario?: string;
  origen?: Entidad; destino?: Entidad; observacion?: string;
  equipos?: SerieItem[]; materiales?: Record<string, number>;
}) {
  const lines = 8 + (data.equipos?.length || 0) + Object.keys(data.materiales || {}).length + 4;
  const altura = Math.max(120, 10 + lines * 5 + 32);
  const pdf = new jsPDF({ unit: "mm", format: [80, altura] });
  const C = { align: "center" as const };
  let y = 10;
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(9);
  pdf.text("CONSTRUCCION DE REDES M&D S.A.C", 40, y, C); y += 5;
  pdf.text("RUC: 20601345979", 40, y, C); y += 10;
  pdf.setFont("helvetica", "bold");
  pdf.text(`GUIA TRANSFERENCIA: ${guiaId}`, 40, y, C); y += 5;
  pdf.setFont("helvetica", "normal");
  pdf.text(`FECHA: ${data.fechaStr || new Date().toLocaleString("es-PE")}`, 40, y, C); y += 5;
  pdf.text(`USUARIO: ${data.usuario || "-"}`, 40, y, C); y += 5;
  pdf.setFont("helvetica", "bold");
  pdf.text(`DESDE: ${data.origen?.nombre || "-"} (${data.origen?.tipo || ""})`, 40, y, C); y += 5;
  pdf.text(`HACIA: ${data.destino?.nombre || "-"} (${data.destino?.tipo || ""})`, 40, y, C); y += 6;
  pdf.setFont("helvetica", "normal");
  if (data.equipos?.length) {
    pdf.setFont("helvetica", "bold"); pdf.text("EQUIPOS", 40, y, C); y += 5; pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    for (const eq of data.equipos) { pdf.text(`${eq.equipo || ""} | ${eq.SN}`, 6, y); y += 4; }
    pdf.setFontSize(9); y += 2;
  }
  if (Object.keys(data.materiales || {}).length) {
    pdf.setFont("helvetica", "bold"); pdf.text("MATERIALES", 40, y, C); y += 5; pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    for (const [k, v] of Object.entries(data.materiales || {})) {
      if (v > 0) { pdf.text(`${k.replaceAll("_", " ")}: ${v}`, 6, y); y += 4; }
    }
    pdf.setFontSize(9); y += 2;
  }
  if (data.observacion) { pdf.text(`OBS: ${data.observacion}`, 40, y, C); y += 5; }
  y += 3; pdf.line(6, y, 74, y); y += 5;
  pdf.text("Firma Origen", 20, y, C); pdf.text("Firma Destino", 60, y, C);
  return pdf;
}

async function printPDF(pdf: jsPDF) {
  const blob = pdf.output("blob");
  const url = URL.createObjectURL(blob);
  for (let i = 0; i < 2; i++) {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none"; iframe.src = url;
    document.body.appendChild(iframe);
    await new Promise((r) => setTimeout(r, 600));
    iframe.contentWindow?.print();
    await new Promise((r) => setTimeout(r, 1200));
    document.body.removeChild(iframe);
  }
  URL.revokeObjectURL(url);
}

// ── Selector de entidad ───────────────────────────────────────────────────────
function EntidadSelector({ label, valor, onSelect, onClear, excluirId }: {
  label: string;
  valor: Entidad | null;
  onSelect: (e: Entidad) => void;
  onClear: () => void;
  excluirId?: string;
}) {
  const [tipo, setTipo] = useState<EntidadTipo>("PERSONAL");
  const [lista, setLista] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    setLista([]); setBusqueda(""); setLoading(true);
    const url = tipo === "PERSONAL" ? "/api/personal-stock/list" : "/api/cuadrillas/list?area=INSTALACIONES";
    fetch(url).then(r => r.json()).then(d => {
      if (d.ok) setLista(d.items || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [tipo]);

  const filtrada = lista.filter((e: any) => {
    const nombre = String(e.nombre || "");
    const coincide = nombre.toLowerCase().includes(busqueda.toLowerCase());
    const itemId = tipo === "PERSONAL" ? (e.uid || "") : (e.id || "");
    const noExcluido = excluirId ? itemId !== excluirId : true;
    return coincide && noExcluido;
  });

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{label}</p>
      <div className="flex gap-2">
        {(["PERSONAL", "CUADRILLA"] as EntidadTipo[]).map(t => (
          <button key={t} onClick={() => setTipo(t)}
            className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-colors ${tipo === t ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300"}`}>
            {t === "PERSONAL" ? "Coordinador/Supervisor" : "Cuadrilla"}
          </button>
        ))}
      </div>
      {valor ? (
        <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 dark:bg-blue-900/20 dark:border-blue-800">
          <span className="font-medium text-blue-800 dark:text-blue-300 text-sm flex-1">{valor.nombre}</span>
          <span className="text-xs text-blue-600 dark:text-blue-400">{valor.tipo}</span>
          <button onClick={onClear} className="text-blue-400 hover:text-red-500 text-xs">✕</button>
        </div>
      ) : (
        <>
          <input
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            placeholder="Buscar..."
            value={busqueda}
            onChange={ev => setBusqueda(ev.target.value)}
          />
          {loading ? (
            <p className="text-xs text-slate-500">Cargando...</p>
          ) : (
            <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
              {filtrada.length === 0 ? (
                <p className="p-3 text-xs text-slate-500">Sin resultados</p>
              ) : (
                filtrada.map((e: any, idx: number) => {
                  const id = tipo === "PERSONAL" ? (e.uid || `pers-${idx}`) : (e.id || `cuad-${idx}`);
                  const nombre = String(e.nombre || "");
                  return (
                    <button key={id} className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors text-sm"
                      onClick={() => onSelect({ tipo, id: tipo === "PERSONAL" ? (e.uid || "") : (e.id || ""), nombre })}>
                      {nombre}
                      {tipo === "PERSONAL" && (
                        <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full font-semibold ${e.rol === "COORDINADOR" ? "bg-blue-100 text-blue-600" : "bg-purple-100 text-purple-600"}`}>
                          {e.rol}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Cliente principal ─────────────────────────────────────────────────────────
export default function TransferenciasInternasClient() {
  const [origen, setOrigen] = useState<Entidad | null>(null);
  const [destino, setDestino] = useState<Entidad | null>(null);

  const [seriesOrigen, setSeriesOrigen] = useState<SerieItem[]>([]);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [stockOrigen, setStockOrigen] = useState<Record<string, number>>({});

  const [matLines, setMatLines] = useState<MatLine[]>([]);
  const [materiales, setMateriales] = useState<Record<string, { unidadTipo: string }>>({});
  const [observacion, setObservacion] = useState("");
  const [preview, setPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [usuarioNombre, setUsuarioNombre] = useState("");
  const [busquedaSerie, setBusquedaSerie] = useState("");
  const transferIdRef = useRef<string>("");

  useEffect(() => {
    fetch("/api/materiales/list?area=INSTALACIONES").then(r => r.json()).then(d => {
      if (d.ok) {
        const idx: Record<string, { unidadTipo: string }> = {};
        for (const m of (d.items || [])) idx[m.id] = { unidadTipo: m.unidadTipo || "UND" };
        setMateriales(idx);
      }
    }).catch(() => {});
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.ok) setUsuarioNombre(shortName(d.nombre || ""));
    }).catch(() => {});
    transferIdRef.current = `TX-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }, []);

  // Carga equipos y stock de materiales cuando cambia el origen
  useEffect(() => {
    if (!origen) {
      setSeriesOrigen([]); setSeleccionados(new Set()); setStockOrigen({}); setMatLines([]);
      return;
    }
    setSeriesOrigen([]); setSeleccionados(new Set()); setStockOrigen({}); setMatLines([]);
    setLoadingSeries(true);
    const url = origen.tipo === "PERSONAL"
      ? `/api/personal-stock/stock?uid=${encodeURIComponent(origen.id)}`
      : `/api/cuadrillas/stock?id=${encodeURIComponent(origen.id)}&series=1`;
    fetch(url).then(r => r.json()).then(d => {
      if (!d.ok) { toast.error("No se pudo cargar el stock del origen"); return; }

      // Equipos
      const series: SerieItem[] = (d.series || []).map((s: any) => ({
        SN: s.SN || s.id, equipo: s.equipo, descripcion: s.descripcion,
        guia_despacho: s.guia_despacho, f_despachoYmd: s.f_despachoYmd,
      }));
      setSeriesOrigen(series);

      // Stock de materiales — normalizar ambos formatos
      const stockMap: Record<string, number> = {};
      if (origen.tipo === "PERSONAL") {
        for (const m of (d.materiales || [])) {
          const id = String(m.id || "");
          if (!id) continue;
          const unidadTipo = String(m.unidadTipo || "UND").toUpperCase();
          stockMap[id] = unidadTipo === "METROS"
            ? Math.floor((Number(m.stockCm) || 0) / 100)
            : Number(m.stockUnd) || 0;
        }
      } else {
        for (const m of (d.stock?.materiales || [])) {
          const id = String(m.id || "");
          if (!id) continue;
          const tipo = String(m.tipo || "UND").toUpperCase();
          stockMap[id] = tipo === "METROS"
            ? Math.floor(Number(m.metros) || 0)
            : Number(m.cantidad) || 0;
        }
      }
      setStockOrigen(stockMap);
    }).catch(() => toast.error("Error de red al cargar stock")).finally(() => setLoadingSeries(false));
  }, [origen]);

  function resetForm() {
    setOrigen(null); setDestino(null); setSeriesOrigen([]); setSeleccionados(new Set());
    setMatLines([]); setObservacion("");
    transferIdRef.current = `TX-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }

  function toggleSerie(sn: string) {
    setSeleccionados(prev => {
      const next = new Set(prev);
      if (next.has(sn)) next.delete(sn); else next.add(sn);
      return next;
    });
  }

  function toggleTodos() {
    if (seleccionados.size === seriesFiltradas.length && seriesFiltradas.length > 0) {
      setSeleccionados(new Set());
    } else {
      setSeleccionados(new Set(seriesFiltradas.map(s => s.SN)));
    }
  }

  const seriesFiltradas = seriesOrigen.filter(s =>
    !busquedaSerie || s.SN.includes(busquedaSerie.toUpperCase()) || String(s.equipo || "").toUpperCase().includes(busquedaSerie.toUpperCase())
  );

  const equiposSeleccionados = seriesOrigen.filter(s => seleccionados.has(s.SN));

  function setMatQty(materialId: string, field: "und" | "metros", value: number) {
    setMatLines(prev => {
      const existing = prev.find(m => m.materialId === materialId);
      if (existing) return prev.map(m => m.materialId === materialId ? { ...m, [field]: value } : m);
      return [...prev, { materialId, und: field === "und" ? value : 0, metros: field === "metros" ? value : 0 }];
    });
  }

  function getMatQty(materialId: string, field: "und" | "metros") {
    return matLines.find(m => m.materialId === materialId)?.[field] || 0;
  }

  const materialesConCantidad = matLines.filter(m => m.und > 0 || m.metros > 0);
  const puedeConfirmar = origen && destino && origen.id !== destino.id && (equiposSeleccionados.length > 0 || materialesConCantidad.length > 0);

  async function confirmar() {
    if (!origen || !destino) return;
    setSubmitting(true);
    try {
      const result = await transferirEntreEntidadesAction({
        transferId: transferIdRef.current,
        origen,
        destino,
        equipos: equiposSeleccionados.map(e => e.SN),
        materiales: materialesConCantidad,
        observacion,
      });
      if (!result.ok) { toast.error((result.error.formErrors || []).join(" | ")); return; }
      toast.success(`Guia ${result.guia} generada`);

      const pdf = generarPDF(result.guia, {
        fechaStr: new Date().toLocaleString("es-PE"),
        usuario: usuarioNombre,
        origen, destino, observacion,
        equipos: equiposSeleccionados,
        materiales: Object.fromEntries(materialesConCantidad.map(m => [m.materialId, materiales[m.materialId]?.unidadTipo === "METROS" ? m.metros : m.und])),
      });

      const pdfBlob = pdf.output("blob");
      const fd = new FormData();
      fd.append("file", new File([pdfBlob], `${result.guia}.pdf`, { type: "application/pdf" }));
      await fetch(`/api/transferencias/instalaciones/guia/upload?guiaId=${result.guia}&tipo=transferencia-interna`, { method: "POST", body: fd }).catch(() => {});
      await printPDF(pdf);

      setPreview(false);
      resetForm();
    } catch (e: any) {
      toast.error(e?.message || "Error al transferir");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Selección origen y destino */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
          <EntidadSelector
            label="Origen (quien entrega)"
            valor={origen}
            onSelect={v => { setOrigen(v); setSeleccionados(new Set()); }}
            onClear={() => { setOrigen(null); setSeleccionados(new Set()); }}
            excluirId={destino?.id}
          />
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
          <EntidadSelector
            label="Destino (quien recibe)"
            valor={destino}
            onSelect={setDestino}
            onClear={() => setDestino(null)}
            excluirId={origen?.id}
          />
        </div>
      </div>

      {/* Lista de equipos del origen */}
      {origen && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Equipos de {origen.nombre}
              {seleccionados.size > 0 && (
                <span className="ml-2 rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">{seleccionados.size} seleccionados</span>
              )}
            </h3>
            <input
              className="w-36 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              placeholder="Filtrar SN / tipo..."
              value={busquedaSerie}
              onChange={e => setBusquedaSerie(e.target.value)}
            />
          </div>

          {loadingSeries ? (
            <p className="text-sm text-slate-500 py-4 text-center">Cargando equipos...</p>
          ) : seriesOrigen.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">Sin equipos en stock.</p>
          ) : (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="px-3 py-2 w-8">
                      <input
                        type="checkbox"
                        checked={seleccionados.size === seriesFiltradas.length && seriesFiltradas.length > 0}
                        onChange={toggleTodos}
                        className="rounded"
                      />
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Tipo</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">SN</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300 hidden sm:table-cell">Guía</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300 hidden sm:table-cell">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {seriesFiltradas.map(s => (
                    <tr
                      key={s.SN}
                      className={`cursor-pointer transition-colors ${seleccionados.has(s.SN) ? "bg-blue-50 dark:bg-blue-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                      onClick={() => toggleSerie(s.SN)}
                    >
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={seleccionados.has(s.SN)} onChange={() => toggleSerie(s.SN)} className="rounded" />
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-semibold text-blue-600 dark:text-blue-400">{s.equipo || "—"}</span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{s.SN}</td>
                      <td className="px-3 py-2 text-xs text-slate-500 hidden sm:table-cell">{s.guia_despacho || "—"}</td>
                      <td className="px-3 py-2 text-xs text-slate-500 hidden sm:table-cell">{s.f_despachoYmd || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Materiales */}
      {origen && destino && (
        <>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Materiales a transferir</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {MATS_INST.map(matId => {
                const tipom = materiales[matId]?.unidadTipo || "UND";
                const field = tipom === "METROS" ? "metros" : "und";
                const disponible = stockOrigen[matId] ?? 0;
                const sinStock = disponible === 0;
                const currentVal = getMatQty(matId, field);
                return (
                  <div key={matId} className={`rounded-lg border p-2 ${sinStock ? "border-slate-100 bg-slate-50/50 opacity-50 dark:border-slate-800 dark:bg-slate-900/30" : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"}`}>
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{matId.replaceAll("_", " ")}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">
                      Disp: {disponible} {tipom === "METROS" ? "m" : "und"}
                    </p>
                    <div className="mt-1 flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={disponible}
                        disabled={sinStock}
                        value={currentVal || ""}
                        onChange={e => {
                          const val = Math.min(Number(e.target.value), disponible);
                          setMatQty(matId, field, val);
                        }}
                        className="w-full rounded border border-slate-300 bg-white px-1.5 py-1 text-xs disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800"
                        placeholder="0"
                      />
                      <span className="text-xs text-slate-500 whitespace-nowrap">{tipom === "METROS" ? "m" : "und"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Observación</label>
            <textarea value={observacion} onChange={e => setObservacion(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" rows={2} placeholder="Opcional..." />
          </div>

          <button
            className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            onClick={() => setPreview(true)}
            disabled={!puedeConfirmar}
          >
            Vista previa y confirmar transferencia
          </button>
        </>
      )}

      {/* Modal de confirmación */}
      {preview && origen && destino && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl dark:bg-slate-900">
            <div className="border-b border-slate-200 p-4 dark:border-slate-700">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">Confirmar transferencia</h3>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">{origen.nombre}</span>
                <span className="text-slate-400">→</span>
                <span className="font-medium">{destino.nombre}</span>
              </div>
              <p><span className="font-medium">Equipos:</span> {equiposSeleccionados.length}</p>
              {materialesConCantidad.length > 0 && <p><span className="font-medium">Materiales:</span> {materialesConCantidad.length} tipo(s)</p>}
              {equiposSeleccionados.length > 0 && (
                <div className="max-h-32 overflow-y-auto rounded border border-slate-100 dark:border-slate-700 p-2 text-xs space-y-1">
                  {equiposSeleccionados.map(e => (
                    <div key={e.SN} className="flex gap-2">
                      <span className="font-semibold text-blue-600 w-12">{e.equipo}</span>
                      <span className="font-mono">{e.SN}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 border-t border-slate-200 p-4 dark:border-slate-700">
              <button onClick={() => setPreview(false)} className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">Cancelar</button>
              <button onClick={confirmar} disabled={submitting} className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                {submitting ? "Procesando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
