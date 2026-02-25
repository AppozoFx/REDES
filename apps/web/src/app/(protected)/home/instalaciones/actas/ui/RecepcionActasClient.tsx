"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Select from "react-select";
import jsPDF from "jspdf";
import QRCode from "qrcode";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import "dayjs/locale/es";
import { toast } from "sonner";

dayjs.extend(customParseFormat);
dayjs.locale("es");

type Option = { value: string; label: string; tecnicosUids?: string[] };

type GuiaResponse = {
  ok: boolean;
  guiaId: string;
  coordinadorUid: string;
  coordinadorNombre: string;
  cuadrillaId?: string;
  cuadrillaNombre?: string;
  actas: string[];
  totalActas: number;
  recibidoAt: string;
  recibidoByNombre: string;
  tecnicosUids?: string[];
};

function normalizeActa(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

async function makeQrDataUrl(value: string) {
  return QRCode.toDataURL(value, {
    errorCorrectionLevel: "H",
    margin: 0,
    width: 320,
  });
}

function calcHeight80mm(actasCount: number, tecnicosCount: number) {
  const line = 5;
  let lines = 0;
  lines += 8;
  lines += 4;
  lines += Math.max(1, tecnicosCount);
  lines += 3;
  lines += Math.ceil(Math.max(1, actasCount) / 2);
  const extra = 85;
  const altura = 10 + lines * line + extra;
  return Math.max(140, altura);
}

async function generarPDFTermico80mm(args: {
  guiaId: string;
  fechaStr: string;
  usuario: string;
  coordinador: string;
  cuadrilla?: string;
  actas: string[];
  tecnicos?: string[];
  qrUrl?: string;
  firmaEntrega?: string;
  firmaAlmacen?: string;
}) {
  const altura = calcHeight80mm(args.actas.length, (args.tecnicos || []).length);
  const pdf = new jsPDF({ unit: "mm", format: [80, altura] });
  const C = { align: "center" as const };
  let y = 10;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text("CONSTRUCCION DE REDES M&D S.A.C", 40, y, C); y += 5;
  pdf.text("RUC: 20601345979", 40, y, C); y += 5;
  pdf.text("Cal. Juan Prado de Zela Mza. F2 Lt. 3", 40, y, C); y += 5;
  pdf.text("Apv. San Francisco de Cayran", 40, y, C); y += 7;

  pdf.setFont("helvetica", "bold");
  pdf.text(`GUIA: ${args.guiaId}`, 40, y, C); y += 5;
  pdf.setFont("helvetica", "normal");
  pdf.text(`FECHA: ${args.fechaStr}`, 40, y, C); y += 5;
  pdf.text(`USUARIO: ${args.usuario || "-"}`, 40, y, C); y += 5;
  pdf.setFont("helvetica", "bold");
  pdf.text(`COORDINADOR: ${args.coordinador || "-"}`, 40, y, C); y += 5;
  pdf.setFont("helvetica", "normal");
  if (args.cuadrilla) {
    pdf.setFont("helvetica", "bold");
    pdf.text(`CUADRILLA: ${args.cuadrilla}`, 40, y, C);
    pdf.setFont("helvetica", "normal");
    y += 5;
  }

  (args.tecnicos || []).forEach((t, i) => {
    pdf.text(`TECNICO ${i + 1}: ${t}`, 40, y, C);
    y += 5;
  });

  y += 2;
  pdf.setFont("helvetica", "bold");
  pdf.text("RECEPCION DE ACTAS", 40, y, C);
  y += 6;
  pdf.setFont("helvetica", "normal");

  pdf.setFontSize(7);
  const colX1 = 8;
  const colX2 = 42;
  const rowH = 4;
  for (let i = 0; i < args.actas.length; i += 2) {
    const left = args.actas[i];
    const right = args.actas[i + 1];
    if (left) pdf.text(`ACTA: ${left}`, colX1, y);
    if (right) pdf.text(`ACTA: ${right}`, colX2, y);
    y += rowH;
  }

  y += 3;
  pdf.setFontSize(8);
  pdf.text(`TOTAL ACTAS: ${args.actas.length}`, 40, y, C);
  y += 6;

  const qrValue = args.qrUrl || args.guiaId;
  const qrData = await makeQrDataUrl(qrValue);
  pdf.addImage(qrData, "PNG", 20, y, 40, 40);
  y += 50;

  pdf.setFontSize(8);
  pdf.line(10, y, 40, y);
  pdf.line(45, y, 75, y);
  y += 6;
  pdf.text(args.firmaEntrega || "Coordinador/Cuadrilla", 25, y, C);
  pdf.text(args.firmaAlmacen || "Almacen", 60, y, C);

  return pdf;
}

async function obtenerCelulares(uids: string[]): Promise<string[]> {
  const list = Array.from(new Set(uids.filter(Boolean)));
  if (!list.length) return [];
  const qs = list.join(",");
  const res = await fetch(`/api/usuarios/phones?uids=${encodeURIComponent(qs)}`, { cache: "no-store" });
  const data = await res.json();
  const items = Array.isArray(data?.items) ? data.items : [];
  const celulares = items.map((it: any) => String(it?.celular || "")).filter(Boolean);
  return Array.from(new Set(celulares));
}

function enviarWhatsApp(numero: string, mensaje: string, preOpen?: Window | null) {
  const url = `https://wa.me/51${numero}?text=${encodeURIComponent(mensaje)}`;
  if (preOpen && !preOpen.closed) {
    preOpen.location.href = url;
    preOpen.focus();
    return;
  }
  const win = window.open(url, "_blank");
  if (win) win.opener = null;
}

export default function RecepcionActasClient() {
  const [coordinadores, setCoordinadores] = useState<Option[]>([]);
  const [cuadrillas, setCuadrillas] = useState<Option[]>([]);
  const [coordinadorUid, setCoordinadorUid] = useState("");
  const [cuadrillaId, setCuadrillaId] = useState("");

  const [actaCode, setActaCode] = useState("");
  const [actas, setActas] = useState<string[]>([]);
  const [procesando, setProcesando] = useState(false);
  const [isDark, setIsDark] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setIsDark(root.classList.contains("dark") || mq.matches);
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    mq.addEventListener?.("change", sync);
    return () => {
      obs.disconnect();
      mq.removeEventListener?.("change", sync);
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/instalaciones/coordinadores", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !data?.ok) throw new Error(data?.error || "ERROR");
        const items = Array.isArray(data.items) ? data.items : [];
        setCoordinadores(items.map((i: any) => ({ value: i.uid, label: i.label })));
      } catch (e: any) {
        toast.error(e?.message || "Error cargando coordinadores");
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!coordinadorUid) {
        setCuadrillas([]);
        setCuadrillaId("");
        return;
      }
      try {
        const qs = new URLSearchParams({ area: "INSTALACIONES", coordinadorUid });
        const res = await fetch(`/api/cuadrillas/list?${qs.toString()}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !data?.ok) throw new Error(data?.error || "ERROR");
        const items = Array.isArray(data.items) ? data.items : [];
        setCuadrillas(
          items.map((c: any) => ({
            value: c.id,
            label: c.nombre || c.id,
            tecnicosUids: Array.isArray(c.tecnicosUids) ? c.tecnicosUids : [],
          }))
        );
      } catch (e: any) {
        toast.error(e?.message || "Error cargando cuadrillas");
      }
    })();
  }, [coordinadorUid]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [actas.length]);

  const cuadrillaSeleccionada = useMemo(() => cuadrillas.find((c) => c.value === cuadrillaId), [cuadrillas, cuadrillaId]);

  const selectStyles = useMemo(
    () =>
      isDark
        ? {
            control: (base: any, state: any) => ({
              ...base,
              backgroundColor: "#020617",
              borderColor: state.isFocused ? "#38bdf8" : "#334155",
              boxShadow: "none",
              ":hover": { borderColor: "#475569" },
            }),
            menu: (base: any) => ({ ...base, backgroundColor: "#0f172a", color: "#e2e8f0" }),
            option: (base: any, state: any) => ({
              ...base,
              backgroundColor: state.isSelected ? "#1d4ed8" : state.isFocused ? "#1e293b" : "#0f172a",
              color: "#e2e8f0",
            }),
            singleValue: (base: any) => ({ ...base, color: "#e2e8f0" }),
            input: (base: any) => ({ ...base, color: "#e2e8f0" }),
            placeholder: (base: any) => ({ ...base, color: "#94a3b8" }),
            multiValue: (base: any) => ({ ...base, backgroundColor: "#1e293b" }),
            multiValueLabel: (base: any) => ({ ...base, color: "#e2e8f0" }),
            multiValueRemove: (base: any) => ({ ...base, color: "#cbd5e1" }),
          }
        : undefined,
    [isDark]
  );

  const selectPortalProps = {
    menuPortalTarget: typeof document !== "undefined" ? document.body : null,
    menuPosition: "fixed" as const,
    styles: { ...(selectStyles || {}), menuPortal: (base: any) => ({ ...base, zIndex: 9999 }) },
  };

  const agregarActa = (code: string, silent = false) => {
    const clean = normalizeActa(code);
    if (!clean) return false;
    if (actas.includes(clean)) {
      if (!silent) toast.error(`El acta ${clean} ya fue agregada`);
      setActaCode("");
      return false;
    }
    setActas((prev) => [...prev, clean]);
    setActaCode("");
    if (!silent) toast.success(`Acta ${clean} agregada`);
    return true;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && actaCode.trim()) {
      e.preventDefault();
      agregarActa(actaCode.trim());
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (!text || !text.includes("\n")) return;
    e.preventDefault();
    const rows = text.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
    let count = 0;
    rows.forEach((r) => {
      if (agregarActa(r, true)) count += 1;
    });
    setActaCode("");
    toast.success(`${count} acta(s) agregadas`);
  };

  const eliminarActa = (code: string) => {
    setActas((prev) => prev.filter((x) => x !== code));
  };

  const handleRegistrar = async () => {
    if (!coordinadorUid) return toast.error("Selecciona coordinador");
    if (!actas.length) return toast.error("Agrega actas para registrar");

    setProcesando(true);
    const preWin = window.open("", "_blank");
    const toastId = toast.loading("Generando guía...");
    try {
      const res = await fetch("/api/actas/recepcion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coordinadorUid,
          cuadrillaId: cuadrillaId || undefined,
          actas,
        }),
      });
      const data: GuiaResponse = await res.json();
      if (!res.ok || !data?.ok) throw new Error((data as any)?.error || "ERROR");

      const fechaStr = dayjs(data.recibidoAt).format("DD/MM/YYYY HH:mm");
      const coordinadorNombre = data.coordinadorNombre || coordinadorUid;
      const cuadrillaNombre = data.cuadrillaNombre || "";
      const usuario = data.recibidoByNombre || "-";

      const token = crypto.randomUUID();
      const firmaEntrega = cuadrillaNombre || coordinadorNombre;
      const firmaAlmacen = usuario;

      const draftPdf = await generarPDFTermico80mm({
        guiaId: data.guiaId,
        fechaStr,
        usuario,
        coordinador: coordinadorNombre,
        cuadrilla: cuadrillaNombre || undefined,
        actas: data.actas,
        tecnicos: [],
        firmaEntrega,
        firmaAlmacen,
      });
      const draftBlob = draftPdf.output("blob");
      const uploadDraft = await fetch(
        `/api/transferencias/instalaciones/guia/upload?guiaId=${encodeURIComponent(
          data.guiaId
        )}&tipo=actas&token=${encodeURIComponent(token)}`,
        { method: "POST", body: draftBlob }
      );
      const uploadDraftData = await uploadDraft.json();
      if (!uploadDraft.ok || !uploadDraftData?.ok) {
        throw new Error(uploadDraftData?.error || "UPLOAD_ERROR");
      }

      const finalPdf = await generarPDFTermico80mm({
        guiaId: data.guiaId,
        fechaStr,
        usuario,
        coordinador: coordinadorNombre,
        cuadrilla: cuadrillaNombre || undefined,
        actas: data.actas,
        tecnicos: [],
        qrUrl: uploadDraftData.url,
        firmaEntrega,
        firmaAlmacen,
      });
      const finalBlob = finalPdf.output("blob");
      const uploadFinal = await fetch(
        `/api/transferencias/instalaciones/guia/upload?guiaId=${encodeURIComponent(
          data.guiaId
        )}&tipo=actas&token=${encodeURIComponent(token)}`,
        { method: "POST", body: finalBlob }
      );
      const uploadFinalData = await uploadFinal.json();
      if (!uploadFinal.ok || !uploadFinalData?.ok) {
        throw new Error(uploadFinalData?.error || "UPLOAD_ERROR");
      }

      await fetch("/api/actas/recepcion/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guiaId: data.guiaId, pdfUrl: uploadFinalData.url }),
      });

      const uidsToNotify = [
        coordinadorUid,
        ...(data.tecnicosUids || []),
        ...(cuadrillaSeleccionada?.tecnicosUids || []),
      ].filter(Boolean);
      const celulares = await obtenerCelulares(uidsToNotify);
      if (celulares.length) {
        const lines: string[] = [];
        lines.push("*Recepcion de Actas*");
        lines.push(`Guia: ${data.guiaId}`);
        lines.push(`Coordinador: ${coordinadorNombre}`);
        if (cuadrillaNombre) lines.push(`Cuadrilla: ${cuadrillaNombre}`);
        lines.push(`Total actas: ${data.totalActas}`);
        lines.push(`Registrado por: ${usuario}`);
        lines.push(`Fecha/Hora: ${fechaStr}`);
        lines.push("Comprobante:");
        lines.push(uploadFinalData.url);
      const primerCelular = String(celulares[0] || "");
      if (primerCelular) enviarWhatsApp(primerCelular, lines.join("\n"), preWin);
      } else if (preWin && !preWin.closed) {
        preWin.close();
      }

      const url = URL.createObjectURL(finalBlob);
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = url;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => iframe.contentWindow?.print(), 1200);
      };
      if (iframe.contentWindow) {
        iframe.contentWindow.onafterprint = () => {
          document.body.removeChild(iframe);
          URL.revokeObjectURL(url);
        };
      }
      setTimeout(() => {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(url);
      }, 15000);

      toast.success(`Guía ${data.guiaId} registrada`, { id: toastId });
      setActas([]);
      setActaCode("");
    } catch (e: any) {
      if (preWin && !preWin.closed) preWin.close();
      toast.error(e?.message || "No se pudo registrar", { id: toastId });
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="grid gap-4 text-slate-900 dark:text-slate-100 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Coordinador (obligatorio)</label>
              <Select
                options={coordinadores}
                value={coordinadores.find((c) => c.value === coordinadorUid) || null}
                onChange={(sel) => setCoordinadorUid(sel?.value || "")}
                placeholder="Seleccionar coordinador"
                isClearable
                {...selectPortalProps}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Cuadrilla (opcional)</label>
              <Select
                options={cuadrillas}
                value={cuadrillas.find((c) => c.value === cuadrillaId) || null}
                onChange={(sel) => setCuadrillaId(sel?.value || "")}
                placeholder={coordinadorUid ? "Seleccionar cuadrilla" : "Selecciona coordinador primero"}
                isClearable
                isDisabled={!coordinadorUid}
                {...selectPortalProps}
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Escanear código de acta</label>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={actaCode}
                onChange={(e) => setActaCode(normalizeActa(e.target.value))}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="Escanea y presiona Enter (o pega varias líneas)"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={() => actaCode.trim() && agregarActa(actaCode.trim())}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
              >
                Agregar
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
              Puedes pegar múltiples códigos, uno por línea.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-800 dark:text-slate-200">Actas escaneadas</h3>
            {actas.length > 0 && (
              <button
                onClick={() => setActas([])}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Limpiar todo
              </button>
            )}
          </div>
          {actas.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-slate-400">No hay actas agregadas.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {actas.map((a) => (
                <span key={a} className="inline-flex items-center gap-2 rounded-full bg-slate-800 text-white text-xs px-3 py-1">
                  {a}
                  <button onClick={() => eliminarActa(a)} className="text-white/80 hover:text-white">
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h3 className="mb-3 font-semibold text-gray-800 dark:text-slate-200">Resumen</h3>
          <div className="text-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-gray-500 dark:text-slate-400">Coordinador</span>
              <span className="font-medium">
                {coordinadores.find((c) => c.value === coordinadorUid)?.label || "-"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500 dark:text-slate-400">Cuadrilla</span>
              <span className="font-medium">
                {cuadrillas.find((c) => c.value === cuadrillaId)?.label || "-"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500 dark:text-slate-400">Actas</span>
              <span className="font-medium">{actas.length}</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleRegistrar}
          disabled={procesando || !coordinadorUid || actas.length === 0}
          className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-60 hover:bg-emerald-700"
        >
          {procesando ? "Procesando..." : "Registrar y Generar Guía"}
        </button>
      </div>
    </div>
  );
}



