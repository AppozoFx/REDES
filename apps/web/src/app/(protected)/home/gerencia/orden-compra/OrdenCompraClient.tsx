"use client";

import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import { toast } from "sonner";

type Coordinador = {
  uid: string;
  nombre: string;
  email: string;
  celular: string;
  razonSocial: string;
  ruc: string;
};

type Item = {
  codigo: string;
  descripcion: string;
  cantidad: number;
  precio: number;
  total: number;
};

type Resumen = {
  totalInstalaciones: number;
  residencial: number;
  condominio: number;
  cat5e: number;
  cat6: number;
};

type RowCuadrilla = {
  cuadrilla: string;
  residencial: number;
  condominio: number;
  cat5e: number;
  cat6: number;
};

const DESCRIPCIONES: Record<string, { descripcion: string; precio: number }> = {
  "001": { descripcion: "INSTALACION Y ACTIVACION DE ABONADOS EN RESIDENCIALES", precio: 120 },
  "002": { descripcion: "INSTALACION Y ACTIVACION DE ABONADOS EN CONDOMINIOS", precio: 80 },
  "003": { descripcion: "CABLEADO UTP CAT 5E COLOR PLOMO", precio: 40 },
  "004": { descripcion: "CABLEADO UTP CAT 6 COLOR BLANCO", precio: 55 },
};

const OC_DIRECCION = "CA. JUAN PRADO DE ZELA MZ,F2 LT.3 -SMP";
const OC_ATENCION = "DNIEPER MAYTA - m.mayta@redesm";
const OC_LUGAR_ENTREGA = "REDES M&D S.A.C";
const OC_TIPO = "SERVICIOS";
const OC_LOGO_PATH = "/img/logo.png";
let logoDataUrlCache: string | null = null;

function defaultPeriodo() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    desde: start.toISOString().slice(0, 10),
    hasta: end.toISOString().slice(0, 10),
  };
}

function money(v: number) {
  return `S/ ${Number(v || 0).toFixed(2)}`;
}

function buildItemsFromResumen(s: Resumen): Item[] {
  return [
    { codigo: "001", descripcion: DESCRIPCIONES["001"].descripcion, cantidad: s.residencial, precio: DESCRIPCIONES["001"].precio, total: s.residencial * DESCRIPCIONES["001"].precio },
    { codigo: "002", descripcion: DESCRIPCIONES["002"].descripcion, cantidad: s.condominio, precio: DESCRIPCIONES["002"].precio, total: s.condominio * DESCRIPCIONES["002"].precio },
    { codigo: "003", descripcion: DESCRIPCIONES["003"].descripcion, cantidad: s.cat5e, precio: DESCRIPCIONES["003"].precio, total: s.cat5e * DESCRIPCIONES["003"].precio },
    { codigo: "004", descripcion: DESCRIPCIONES["004"].descripcion, cantidad: s.cat6, precio: DESCRIPCIONES["004"].precio, total: s.cat6 * DESCRIPCIONES["004"].precio },
  ].filter((x) => x.cantidad > 0);
}

function numeroALetras(num: number): string {
  const unidades = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
  const especiales = ["DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISEIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE"];
  const decenas = ["", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
  const centenas = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];
  if (num === 0) return "CERO";
  if (num === 100) return "CIEN";
  let n = Math.floor(Math.max(0, num));
  let words = "";
  if (n >= 1000) {
    const miles = Math.floor(n / 1000);
    words += miles === 1 ? "MIL " : `${numeroALetras(miles)} MIL `;
    n %= 1000;
  }
  if (n >= 100) {
    const c = Math.floor(n / 100);
    words += `${centenas[c]} `;
    n %= 100;
  }
  if (n >= 20) {
    const d = Math.floor(n / 10);
    words += decenas[d];
    const u = n % 10;
    if (u > 0) words += d === 2 ? `I${unidades[u]}` : ` Y ${unidades[u]}`;
    return words.trim();
  }
  if (n >= 10) return `${words}${especiales[n - 10]}`.trim();
  if (n > 0) return `${words}${unidades[n]}`.trim();
  return words.trim();
}

async function getLogoDataUrl(): Promise<string> {
  if (logoDataUrlCache !== null) return logoDataUrlCache;
  try {
    const res = await fetch(OC_LOGO_PATH, { cache: "force-cache" });
    if (!res.ok) {
      logoDataUrlCache = "";
      return "";
    }
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    logoDataUrlCache = dataUrl;
    return dataUrl;
  } catch {
    logoDataUrlCache = "";
    return "";
  }
}

async function makePdfBlob(args: {
  codigo: string;
  fecha: string;
  proveedor: { razonSocial: string; ruc: string };
  coordinador: string;
  periodo: { desde: string; hasta: string };
  items: Item[];
  subtotal: number;
  igv: number;
  total: number;
  observaciones: string;
}) {
  const BRAND = { primary: [15, 76, 129] as const, light: [240, 246, 255] as const, gray: [90, 102, 121] as const };
  const M = 16;
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const safeItems = Array.isArray(args.items) ? args.items.filter((it) => it.cantidad > 0 && it.codigo) : [];

  doc.setFillColor(...BRAND.primary);
  doc.rect(0, 0, W, 65, "F");

  const logoDataUrl = await getLogoDataUrl();
  let logoDrawW = 0;
  if (logoDataUrl) {
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("logo_load_error"));
        i.src = logoDataUrl;
      });
      const logoH = 45;
      const ratio = img.width > 0 && img.height > 0 ? img.width / img.height : 1;
      logoDrawW = Math.max(45, logoH * ratio);
      doc.addImage(logoDataUrl, "PNG", M, 10, logoDrawW, logoH);
    } catch {
      logoDrawW = 0;
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("REDES M&D S.A.C", logoDrawW ? M + logoDrawW + 10 : M, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("RUC 20601345979    Lima - Peru", logoDrawW ? M + logoDrawW + 10 : M, 47);

  const OC_W = 250;
  const OC_H = 50;
  const OC_X = W - M - OC_W;
  const OC_Y = 8;
  doc.setDrawColor(255, 255, 255);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(OC_X, OC_Y, OC_W, OC_H, 12, 12, "FD");
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("ORDEN DE COMPRA", OC_X + OC_W / 2, OC_Y + 23, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(String(args.codigo || ""), OC_X + OC_W / 2, OC_Y + 43, { align: "center" });

  const boxedTitle = (x: number, y: number, w: number, h: number, title: string) => {
    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(...BRAND.light);
    doc.roundedRect(x, y, w, h, 8, 8, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    doc.text(title, x + 10, y + 16);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(20, 20, 20);
  };

  const cardH = 60;
  const L1_X = M;
  const L1_W = 190;
  const R1_X = L1_X + L1_W + 10;
  const R1_W = W - M - R1_X;
  const fechaEntregaTxt = args.periodo?.hasta || "-";

  boxedTitle(L1_X, 76, L1_W, cardH, "Fechas");
  doc.setFontSize(10);
  doc.text(`Emision: ${args.fecha}`, L1_X + 10, 110);
  doc.text(`Entrega: ${fechaEntregaTxt}`, L1_X + 10, 126);

  boxedTitle(R1_X, 76, R1_W, cardH, "Proveedor");
  doc.text(`Razon Social: ${args.proveedor.razonSocial || "-"}`, R1_X + 10, 110);
  doc.text(`RUC: ${args.proveedor.ruc || "-"}`, R1_X + 10, 126);

  const yInfo = 148;
  boxedTitle(M, yInfo, W - 2 * M, 86, "Detalles");
  doc.text("Direccion:", M + 10, yInfo + 30);
  doc.text(OC_DIRECCION, M + 90, yInfo + 30);
  doc.text("Atencion:", M + 10, yInfo + 50);
  doc.text(OC_ATENCION, M + 90, yInfo + 50);
  doc.text("Lugar Entrega:", M + 10, yInfo + 70);
  doc.text(OC_LUGAR_ENTREGA, M + 90, yInfo + 70);
  doc.text("Tipo OC:", W / 2 + 40, yInfo + 70);
  doc.text(OC_TIPO, W / 2 + 100, yInfo + 70);

  const tableX = M;
  const tableY = yInfo + 100;
  const tableW = W - 2 * M;
  const rowH = 22;
  const cols = [45, 60, 70, tableW - 45 - 60 - 70 - 90 - 90, 90, 90];

  doc.setFillColor(...BRAND.primary);
  doc.rect(tableX, tableY, tableW, 24, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);

  const headers = ["ITEM", "CANT.", "CODIGO", "DESCRIPCION", "PRECIO U.", "TOTAL"];
  let cx = tableX;
  headers.forEach((h, i) => {
    const align = i >= 4 ? "right" : i === 3 ? "left" : "center";
    const tx = align === "center" ? cx + cols[i] / 2 : align === "right" ? cx + cols[i] - 6 : cx + 6;
    doc.text(h, tx, tableY + 16, { align });
    cx += cols[i];
  });

  let y = tableY + 24;
  doc.setTextColor(35, 35, 35);
  doc.setFont("helvetica", "normal");

  const rows = safeItems.length
    ? safeItems.map((it, i) => [String(i + 1), String(it.cantidad), it.codigo, it.descripcion, money(it.precio), money(it.total)])
    : [["-", "-", "-", "SIN ITEMS", "-", "-"]];

  rows.forEach((r, idx) => {
    const descLines = doc.splitTextToSize(String(r[3] || ""), Math.max(40, cols[3] - 12));
    const dynamicRowH = Math.max(rowH, descLines.length * 10 + 8);
    const centerY = y + dynamicRowH / 2 + 3;

    doc.setFillColor(idx % 2 === 0 ? 248 : 255, idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 253 : 255);
    doc.rect(tableX, y, tableW, dynamicRowH, "F");
    doc.setDrawColor(210, 215, 225);
    doc.rect(tableX, y, tableW, dynamicRowH);
    let colX = tableX;
    r.forEach((cell, i) => {
      const align = i >= 4 ? "right" : i === 3 ? "left" : "center";
      const tx = align === "center" ? colX + cols[i] / 2 : align === "right" ? colX + cols[i] - 6 : colX + 6;
      if (i === 3) {
        doc.text(descLines, tx, y + 12, { align });
      } else {
        doc.text(String(cell), tx, centerY, { align });
      }
      colX += cols[i];
    });
    y += dynamicRowH;
  });

  const cardW = 230;
  const cardH2 = 84;
  const cardX = W - M - cardW;
  const cardY = y + 12;
  doc.setDrawColor(220, 220, 220);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(cardX, cardY, cardW, cardH2, 8, 8, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(45, 45, 45);
  doc.text("Resumen", cardX + 10, cardY + 18);
  doc.setFont("helvetica", "normal");
  doc.text(`Subtotal: ${money(args.subtotal)}`, cardX + 10, cardY + 38);
  doc.text(`IGV (18%): ${money(args.igv)}`, cardX + 10, cardY + 54);
  doc.setFont("helvetica", "bold");
  doc.text(`TOTAL: ${money(args.total)}`, cardX + 10, cardY + 72);

  const entero = Math.floor(Number(args.total || 0));
  const dec = Math.round((Number(args.total || 0) - entero) * 100);
  const textoFinal = `SON: ${numeroALetras(entero)} CON ${String(dec).padStart(2, "0")}/100 SOLES`;
  const sonY = cardY + cardH2 + 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.text(textoFinal, W / 2, sonY, { align: "center" });

  const tableBlock = (startY: number, title: string, headersRow: string[], valuesRow: string[]) => {
    const headH = 20;
    const lineH = 22;
    const width = W - 2 * M;
    const colW = width / headersRow.length;

    doc.setDrawColor(210, 215, 225);
    doc.setFillColor(236, 244, 255);
    doc.rect(M, startY, width, headH, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);
    doc.text(title, W / 2, startY + 14, { align: "center" });

    let x = M;
    doc.rect(M, startY + headH, width, lineH);
    headersRow.forEach((h) => {
      doc.rect(x, startY + headH, colW, lineH);
      doc.text(h, x + colW / 2, startY + headH + 14, { align: "center" });
      x += colW;
    });

    x = M;
    doc.setFont("helvetica", "normal");
    doc.rect(M, startY + headH + lineH, width, lineH);
    valuesRow.forEach((v) => {
      doc.rect(x, startY + headH + lineH, colW, lineH);
      const txt = String(v || "-").slice(0, 36);
      doc.text(txt, x + colW / 2, startY + headH + lineH + 14, { align: "center" });
      x += colW;
    });

    return startY + headH + lineH * 2;
  };

  const payPct = args.total > 0 ? "100%" : "0%";
  const payEndY = tableBlock(
    Math.max(cardY + cardH2, y) + 18,
    "CONDICIONES DE PAGO",
    ["MEDIO", "CONDICION", "TOTAL A PAGAR", "DIAS"],
    ["01 FACTURA", "CE - CONTRA ENTREGA", payPct, "1"]
  );

  tableBlock(
    payEndY + 10,
    "CONDICIONES DE ENTREGA",
    ["CONDICION", "CANTIDAD", "FECHA", "OBSERVACION"],
    ["NINGUNA", "-", fechaEntregaTxt, args.observaciones || "SIN OBSERVACIONES"]
  );

  const footer = [
    "NOTA: La presente orden de compra esta sujeta a los terminos y condiciones acordados.",
    "Cualquier modificacion o anulacion debera comunicarse por los canales autorizados.",
    "Redes M&D no se responsabiliza por demoras derivadas de causas ajenas a su control.",
  ];
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.gray);
  doc.text(footer, W / 2, H - 26, { align: "center" });

  return doc.output("blob");
}

export default function OrdenCompraClient() {
  const [coordinadores, setCoordinadores] = useState<Coordinador[]>([]);
  const [coordinadorUid, setCoordinadorUid] = useState("");
  const [periodo, setPeriodo] = useState(defaultPeriodo());
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [porCuadrilla, setPorCuadrilla] = useState<RowCuadrilla[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [obs, setObs] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [lastCode, setLastCode] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/gerencia/coordinadores", { cache: "no-store" });
        const body = await res.json();
        if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
        setCoordinadores(Array.isArray(body.items) ? body.items : []);
      } catch (e: any) {
        toast.error(e?.message || "No se pudo cargar coordinadores");
      }
    })();
  }, []);

  const selected = useMemo(
    () => coordinadores.find((c) => c.uid === coordinadorUid) || null,
    [coordinadores, coordinadorUid]
  );

  const totals = useMemo(() => {
    const subtotal = Number(items.reduce((acc, it) => acc + Number(it.total || 0), 0).toFixed(2));
    const igv = Number((subtotal * 0.18).toFixed(2));
    const total = Number((subtotal + igv).toFixed(2));
    return { subtotal, igv, total };
  }, [items]);

  const loadInstalaciones = async () => {
    if (!coordinadorUid) {
      toast.error("Selecciona un coordinador");
      return;
    }
    setLoadingData(true);
    try {
      const qs = new URLSearchParams({
        coordinadorUid,
        desde: periodo.desde,
        hasta: periodo.hasta,
      });
      const res = await fetch(`/api/gerencia/orden-compra/instalaciones?${qs.toString()}`, {
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok || !body?.ok) throw new Error(String(body?.error || "ERROR"));
      setResumen(body.summary || null);
      setPorCuadrilla(Array.isArray(body.porCuadrilla) ? body.porCuadrilla : []);
      setItems(buildItemsFromResumen(body.summary || { totalInstalaciones: 0, residencial: 0, condominio: 0, cat5e: 0, cat6: 0 }));
      toast.success("Instalaciones cargadas");
    } catch (e: any) {
      toast.error(e?.message || "No se pudo cargar instalaciones");
    } finally {
      setLoadingData(false);
    }
  };

  const updateItem = (idx: number, patch: Partial<Item>) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, ...patch };
        const total = Number((Number(next.cantidad || 0) * Number(next.precio || 0)).toFixed(2));
        return { ...next, total };
      })
    );
  };

  const agregarItem = () => {
    setItems((prev) => [
      ...prev,
      { codigo: "", descripcion: "", cantidad: 0, precio: 0, total: 0 },
    ]);
  };

  const nuevaOrden = () => {
    setCoordinadorUid("");
    setPeriodo(defaultPeriodo());
    setResumen(null);
    setPorCuadrilla([]);
    setItems([]);
    setObs("");
    setPreviewUrl("");
    setLastCode("");
    toast.success("Formulario listo para nueva orden");
  };

  const generarOrden = async () => {
    if (!selected) {
      toast.error("Selecciona un coordinador");
      return;
    }
    if (!selected.razonSocial || !selected.ruc) {
      toast.error("El coordinador debe tener razón social y RUC actualizados");
      return;
    }
    if (!/^\d{11}$/.test(String(selected.ruc || "").replace(/\D/g, ""))) {
      toast.error("RUC inválido");
      return;
    }
    const cleanItems = items.filter((x) => x.codigo && x.descripcion && x.cantidad > 0);
    if (!cleanItems.length) {
      toast.error("Agrega al menos un ítem");
      return;
    }

    setSaving(true);
    try {
      const createRes = await fetch("/api/gerencia/orden-compra/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          coordinadorUid: selected.uid,
          coordinadorNombre: selected.nombre,
          razonSocial: selected.razonSocial,
          ruc: selected.ruc,
          periodo,
          items: cleanItems,
          observaciones: obs,
        }),
      });
      const createBody = await createRes.json();
      if (!createRes.ok || !createBody?.ok) throw new Error(String(createBody?.error || "ERROR_CREATE"));

      const code = String(createBody.codigo || "");
      const ordenId = String(createBody.ordenId || "");
      const blob = await makePdfBlob({
        codigo: code,
        fecha: new Date().toLocaleDateString("es-PE"),
        proveedor: {
          razonSocial: selected.razonSocial,
          ruc: String(selected.ruc).replace(/\D/g, ""),
        },
        coordinador: selected.nombre,
        periodo,
        items: cleanItems,
        subtotal: totals.subtotal,
        igv: totals.igv,
        total: totals.total,
        observaciones: obs,
      });

      const uploadRes = await fetch(`/api/gerencia/orden-compra/pdf-upload?ordenId=${encodeURIComponent(ordenId)}`, {
        method: "POST",
        headers: { "content-type": "application/pdf" },
        body: await blob.arrayBuffer(),
      });
      const uploadBody = await uploadRes.json();
      if (!uploadRes.ok || !uploadBody?.ok) throw new Error(String(uploadBody?.error || "ERROR_UPLOAD"));

      const localUrl = URL.createObjectURL(blob);
      setPreviewUrl(localUrl);
      setLastCode(code);
      toast.success("Orden de compra generada y guardada");
    } catch (e: any) {
      toast.error(e?.message || "No se pudo generar la orden");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Orden de Compra</h2>
            <p className="text-sm text-slate-500">
              Gestiona la orden, revisa instalaciones y genera el PDF final.
            </p>
          </div>
          <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${lastCode ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
            {lastCode ? `Ultima OC: ${lastCode}` : "Sin OC generada en esta sesion"}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-600">Coordinador</label>
            <select
              value={coordinadorUid}
              onChange={(e) => setCoordinadorUid(e.target.value)}
              className="h-10 w-full rounded border px-3 text-sm"
            >
              <option value="">Selecciona...</option>
              {coordinadores.map((c) => (
                <option key={c.uid} value={c.uid}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Desde</label>
            <input
              type="date"
              value={periodo.desde}
              onChange={(e) => setPeriodo((p) => ({ ...p, desde: e.target.value }))}
              className="h-10 w-full rounded border px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Hasta</label>
            <input
              type="date"
              value={periodo.hasta}
              onChange={(e) => setPeriodo((p) => ({ ...p, hasta: e.target.value }))}
              className="h-10 w-full rounded border px-3 text-sm"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={loadInstalaciones}
            disabled={loadingData}
            className="rounded bg-[#30518c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loadingData ? "Cargando..." : "Cargar Instalaciones"}
          </button>
          <button
            type="button"
            onClick={agregarItem}
            className="rounded border px-4 py-2 text-sm hover:bg-slate-50"
          >
            Agregar ítem
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
        <h2 className="mb-2 text-sm font-semibold">Proveedor (desde Coordinadores)</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded border bg-slate-50 p-2 text-sm">
            <div className="text-xs text-slate-500">Razón social</div>
            <div className="font-medium">{selected?.razonSocial || "-"}</div>
          </div>
          <div className="rounded border bg-slate-50 p-2 text-sm">
            <div className="text-xs text-slate-500">RUC</div>
            <div className="font-medium">{selected?.ruc || "-"}</div>
          </div>
          <div className="rounded border bg-slate-50 p-2 text-sm">
            <div className="text-xs text-slate-500">Coordinador</div>
            <div className="font-medium">{selected?.nombre || "-"}</div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
        <h2 className="mb-2 text-sm font-semibold">Resumen por instalaciones</h2>
        <div className="grid gap-2 md:grid-cols-5">
          <Metric title="Total instalaciones" value={String(resumen?.totalInstalaciones || 0)} />
          <Metric title="Residencial" value={String(resumen?.residencial || 0)} />
          <Metric title="Condominio" value={String(resumen?.condominio || 0)} />
          <Metric title="CAT5e" value={String(resumen?.cat5e || 0)} />
          <Metric title="CAT6" value={String(resumen?.cat6 || 0)} />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
        <h2 className="mb-2 text-sm font-semibold">Resumen por cuadrilla</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="border p-2 text-left">Cuadrilla</th>
                <th className="border p-2">Residencial</th>
                <th className="border p-2">Condominio</th>
                <th className="border p-2">CAT5e</th>
                <th className="border p-2">CAT6</th>
              </tr>
            </thead>
            <tbody>
              {!porCuadrilla.length && (
                <tr>
                  <td className="border p-3 text-center text-slate-500" colSpan={5}>
                    Sin datos
                  </td>
                </tr>
              )}
              {porCuadrilla.map((r) => (
                <tr key={r.cuadrilla}>
                  <td className="border p-2">{r.cuadrilla}</td>
                  <td className="border p-2 text-center">{r.residencial}</td>
                  <td className="border p-2 text-center">{r.condominio}</td>
                  <td className="border p-2 text-center">{r.cat5e}</td>
                  <td className="border p-2 text-center">{r.cat6}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
        <h2 className="mb-2 text-sm font-semibold">Ítems de Orden de Compra</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="border p-2">Código</th>
                <th className="border p-2 text-left">Descripción</th>
                <th className="border p-2">Cantidad</th>
                <th className="border p-2">Precio</th>
                <th className="border p-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {!items.length && (
                <tr>
                  <td className="border p-3 text-center text-slate-500" colSpan={5}>
                    Sin ítems
                  </td>
                </tr>
              )}
              {items.map((it, idx) => (
                <tr key={`${it.codigo}-${idx}`}>
                  <td className="border p-2">
                    <input
                      value={it.codigo}
                      onChange={(e) => updateItem(idx, { codigo: e.target.value })}
                      className="h-9 w-full rounded border px-2"
                    />
                  </td>
                  <td className="border p-2">
                    <input
                      value={it.descripcion}
                      onChange={(e) => updateItem(idx, { descripcion: e.target.value })}
                      className="h-9 w-full rounded border px-2"
                    />
                  </td>
                  <td className="border p-2">
                    <input
                      type="number"
                      value={it.cantidad}
                      onChange={(e) => updateItem(idx, { cantidad: Number(e.target.value || 0) })}
                      className="h-9 w-full rounded border px-2"
                    />
                  </td>
                  <td className="border p-2">
                    <input
                      type="number"
                      value={it.precio}
                      onChange={(e) => updateItem(idx, { precio: Number(e.target.value || 0) })}
                      className="h-9 w-full rounded border px-2"
                    />
                  </td>
                  <td className="border p-2 text-right">{money(it.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Observaciones</label>
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              className="min-h-[84px] w-full rounded border p-2 text-sm"
              placeholder="Observaciones de la orden..."
            />
          </div>
          <div className="rounded border bg-slate-50 p-3 text-sm">
            <div>Subtotal: <b>{money(totals.subtotal)}</b></div>
            <div>IGV (18%): <b>{money(totals.igv)}</b></div>
            <div className="text-base">Total: <b>{money(totals.total)}</b></div>
            <button
              type="button"
              disabled={saving}
              onClick={generarOrden}
              className="mt-3 rounded bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Generando..." : "Guardar + Generar PDF"}
            </button>
            {lastCode && <div className="mt-2 text-xs text-slate-600">Última OC: {lastCode}</div>}
          </div>
        </div>
      </section>

      {previewUrl && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-lg">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Orden generada</h2>
              <p className="text-sm text-emerald-800">
                {lastCode ? `La orden ${lastCode} se genero correctamente.` : "La orden se genero correctamente."}
              </p>
            </div>
            <button
              type="button"
              onClick={nuevaOrden}
              className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Crear nueva OC
            </button>
          </div>
          <div className="mb-2 flex gap-2">
            <a
              href={previewUrl}
              download={`${lastCode || "orden-compra"}.pdf`}
              className="rounded border border-emerald-300 bg-white px-3 py-2 text-sm hover:bg-emerald-50"
            >
              Descargar PDF
            </a>
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-emerald-300 bg-white px-3 py-2 text-sm hover:bg-emerald-50"
            >
              Ver PDF
            </a>
          </div>
          <iframe src={previewUrl} className="h-[680px] w-full rounded-xl border border-emerald-200 bg-white" />
        </section>
      )}
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-800">{value}</div>
    </div>
  );
}
