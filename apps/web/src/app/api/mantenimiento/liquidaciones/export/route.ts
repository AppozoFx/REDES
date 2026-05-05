import { NextResponse } from "next/server";
import * as XLSX from "xlsx-js-style";
import { getServerSession } from "@/core/auth/session";
import { requireAreaScope } from "@/core/auth/apiGuards";
import { listMantenimientoLiquidaciones } from "@/domain/mantenimientoLiquidaciones/repo";

export const runtime = "nodejs";

type Row = {
  fechaAtencionYmd: string;
  distrito: string;
  codigoCaja: string;
  horaInicio: string;
  horaFin: string;
  causaRaiz: string;
  solucion: string;
  observacion: string;
  cuadrillaNombre: string;
  ticketNumero: string;
  estado: string;
  materiales: any[];
};

function toStr(v: unknown) {
  return String(v || "").trim();
}

function toNum(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatDateDisplay(ymd: string) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd || "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatMonthDisplay(month: string) {
  const m = String(month || "").match(/^(\d{4})-(\d{2})$/);
  if (!m) return month || "";
  return `${m[2]}/${m[1]}`;
}

function materialesBase(it: any): any[] {
  return Array.isArray(it.materialesSnapshot) && it.materialesSnapshot.length
    ? it.materialesSnapshot
    : Array.isArray(it.materialesConsumidos)
    ? it.materialesConsumidos
    : [];
}

function materialesTexto(items: any[]) {
  if (!Array.isArray(items) || !items.length) return "";
  return items
    .map((it) => {
      const nombre = toStr(it?.descripcion || it?.materialId);
      const unidad = toStr(it?.unidadTipo || "UND").toUpperCase();
      const qty = unidad === "METROS" ? toNum(it?.metros) : toNum(it?.und);
      return nombre ? `${nombre}: ${qty}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function materialQty(it: any) {
  return toStr(it?.unidadTipo).toUpperCase() === "METROS" ? toNum(it?.metros) : toNum(it?.und);
}

const MATERIALES_SHEET_HEADERS = [
  "CABLE DE FIBRA OPTICA ADSS MONOMODO 48 HILOS",
  "CABLE DE FIBRA OPTICA ADSS MONOMODO 24 HILOS",
  "CABLE DE FIBRA OPTICA ADSS MONOMODO 12 HILOS",
  "Fibra Drop 4H",
  "Acerado PVC 3/16: ",
  "MUFA DE 144H TIPO DOMO",
  "CAJA DE EMPALME CTO DE 16 CORE",
  "Caja NAP (8 core): ",
  "BANDEJA DE EMPALME PARA MUFA",
  "PROTECTOR DE EMPALME TERMOCONTRAIBLE",
  "PIGTAIL",
  "ACOPLADOR DE FIBRA ÓPTICA MONOMODO SC/APC SIMPLEX VERDE",
  "SPLITTER 1x16",
  "SPLITTER 1x8",
  "SPLITTER 1x4",
  "SPLITTER 1x2",
  "FLEJES DE 1/2\"",
  "HEBILLAS DE 1/2 \"",
  "PREFORMADO DE 2 HILOS PARA FIBRA DE 96H",
  "PREFORMADO DE 2 HILOS PARA FIBRA DE 48H",
  "PREFORMADO DE 2 HILOS PARA FIBRA DE 24H",
  "PREFORMADO DE 2 HILOS PARA FIBRA DE 12H",
  "CLEVIS + AISLADORES",
  "Brazo 0.4 MT",
  "Brazo 0.6 MT",
  "Brazo 0.8 MT",
  "Brazo 1.0 MT",
  "SOPORTE TIPO J",
  "CHAPA TENSORA DE 3 PERNOS",
  "CINTILLO DE 10CM",
  "CINTILLO DE 30CM",
  "ETIQUETA PARA F.O COLOR NARANJA CON LAMINA DE PROTECCION",
  "CINTA AISLANTE",
] as const;

function normalizeMaterialMatchName(v: unknown) {
  return toStr(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MATERIALES_SHEET_ALIAS_TO_HEADER = new Map<string, string>([
  ["CABLE DE FIBRA ADSS 48H", "CABLE DE FIBRA OPTICA ADSS MONOMODO 48 HILOS"],
  ["CABLE DE FIBRA ADSS 24H", "CABLE DE FIBRA OPTICA ADSS MONOMODO 24 HILOS"],
  ["CABLE DE FIBRA ADSS 12H", "CABLE DE FIBRA OPTICA ADSS MONOMODO 12 HILOS"],
  ["CAJA CTO", "CAJA DE EMPALME CTO DE 16 CORE"],
  ["CAJA NAP", "Caja NAP (8 core): "],
  ["BANDEJA DE MUFA", "BANDEJA DE EMPALME PARA MUFA"],
  ["BANDEJA DE MUFA", "BANDEJA DE EMPALME PARA MUFA"],
  ["PROTECTOR SMOV", "PROTECTOR DE EMPALME TERMOCONTRAIBLE"],
  ["PIGTEL", "PIGTAIL"],
  ["ACOPLADOR", "ACOPLADOR DE FIBRA ÓPTICA MONOMODO SC/APC SIMPLEX VERDE"],
  ["SPLITER 1X16", "SPLITTER 1x16"],
  ["SPLITER 1 8", "SPLITTER 1x8"],
  ["SPLITER 1X4", "SPLITTER 1x4"],
  ["CINTA BANDI 1 2", "FLEJES DE 1/2\""],
  ["HEBILLA 1 2", "HEBILLAS DE 1/2 \""],
  ["PREFORME 24H", "PREFORMADO DE 2 HILOS PARA FIBRA DE 24H"],
  ["CLEVI", "CLEVIS + AISLADORES"],
  ["AISLADOR", "CLEVIS + AISLADORES"],
  ["BRAZO DE EXTENCION 60CM", "Brazo 0.6 MT"],
  ["BRAZO DE EXTENCION 80CM", "Brazo 0.8 MT"],
  ["SOPORTE J", "SOPORTE TIPO J"],
  ["CINTILLO 10", "CINTILLO DE 10CM"],
  ["CINTILLO 30", "CINTILLO DE 30CM"],
  ["CINTA AISLANTE", "CINTA AISLANTE"],
]);

function resolveMaterialesSheetHeader(mat: any): string | null {
  const candidates = [
    normalizeMaterialMatchName(mat?.descripcion),
    normalizeMaterialMatchName(mat?.nombre),
    normalizeMaterialMatchName(mat?.materialId),
  ].filter(Boolean);
  for (const candidate of candidates) {
    const mapped = MATERIALES_SHEET_ALIAS_TO_HEADER.get(candidate);
    if (mapped) return mapped;
  }
  return null;
}

function solucionConObservacion(row: Row) {
  const solucion = toStr(row.solucion);
  const observacion = toStr(row.observacion);
  if (solucion && observacion) return `${solucion}\nObservacion: ${observacion}`;
  if (solucion) return solucion;
  if (observacion) return `Observacion: ${observacion}`;
  return "";
}

function ensureCell(ws: XLSX.WorkSheet, row1: number, col0: number) {
  const addr = XLSX.utils.encode_cell({ r: row1 - 1, c: col0 });
  if (!ws[addr]) ws[addr] = { t: "s", v: "" };
  return addr;
}

function setCell(ws: XLSX.WorkSheet, row1: number, col0: number, value: any, style?: any) {
  const addr = ensureCell(ws, row1, col0);
  ws[addr] = {
    ...(ws[addr] || {}),
    t: typeof value === "number" ? "n" : "s",
    v: typeof value === "number" ? value : String(value ?? ""),
    s: style ? { ...(ws[addr]?.s || {}), ...style } : ws[addr]?.s,
  };
}

function applyStyleRange(ws: XLSX.WorkSheet, range: XLSX.Range, style: any) {
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const addr = ensureCell(ws, r + 1, c);
      ws[addr] = { ...(ws[addr] || {}), s: { ...(ws[addr]?.s || {}), ...style } };
    }
  }
}

const borderThin = {
  top: { style: "thin", color: { rgb: "FFBFC7D1" } },
  bottom: { style: "thin", color: { rgb: "FFBFC7D1" } },
  left: { style: "thin", color: { rgb: "FFBFC7D1" } },
  right: { style: "thin", color: { rgb: "FFBFC7D1" } },
};

const sectionTitleStyle = {
  font: { bold: true, color: { rgb: "FF1E293B" }, sz: 12 },
  alignment: { horizontal: "center", vertical: "center" },
  fill: { patternType: "solid", fgColor: { rgb: "FFE8EEF7" } },
  border: borderThin,
};

const headerStyle = {
  font: { bold: true, color: { rgb: "FFFFFFFF" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  fill: { patternType: "solid", fgColor: { rgb: "FF1F4E79" } },
  border: borderThin,
};

const verticalHeaderStyle = {
  ...headerStyle,
  alignment: {
    ...headerStyle.alignment,
    textRotation: 90,
    wrapText: true,
  },
};

const bodyStyle = {
  alignment: { vertical: "top", wrapText: true },
  border: borderThin,
};

const labelStyle = {
  font: { bold: true, color: { rgb: "FF334155" } },
  fill: { patternType: "solid", fgColor: { rgb: "FFF8FAFC" } },
  border: borderThin,
};

const valueStyle = {
  alignment: { vertical: "center" },
  border: borderThin,
};

function buildMaterialAgg(rows: Row[]) {
  const materialAgg = new Map<string, { tipo: string; nombre: string; unidad: string; cantidad: number; precio: number; total: number }>();
  for (const row of rows) {
    for (const mat of row.materiales) {
      const nombre = toStr(mat?.descripcion || mat?.materialId);
      if (!nombre) continue;
      const unidadTipo = toStr(mat?.unidadTipo || "UND").toUpperCase();
      const key = `${nombre}__${unidadTipo}`;
      const qty = materialQty(mat);
      const precio = toNum(mat?.precioUnitario);
      const prev = materialAgg.get(key) || {
        tipo: unidadTipo === "METROS" ? "FIBRA_OPTICA" : "EQUIPO",
        nombre,
        unidad: unidadTipo === "METROS" ? "MTS" : "UND",
        cantidad: 0,
        precio,
        total: 0,
      };
      prev.cantidad += qty;
      prev.total = Number((prev.total + toNum(mat?.total)).toFixed(2));
      if (!prev.precio && precio) prev.precio = precio;
      materialAgg.set(key, prev);
    }
  }
  return Array.from(materialAgg.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

function sanitizeSheetName(name: string, used: Set<string>) {
  const base = toStr(name).replace(/[\\\/\?\*\[\]\:]/g, " ").replace(/\s+/g, " ").trim() || "Sin cuadrilla";
  let candidate = base.slice(0, 31);
  let index = 2;
  while (used.has(candidate)) {
    const suffix = ` (${index})`;
    candidate = `${base.slice(0, Math.max(0, 31 - suffix.length))}${suffix}`;
    index += 1;
  }
  used.add(candidate);
  return candidate;
}

function buildResumenSheet(rows: Row[], month: string) {
  const ws: XLSX.WorkSheet = {};
  ws["!cols"] = [
    { wch: 2 },
    { wch: 8 },
    { wch: 16 },
    { wch: 18 },
    { wch: 30 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 34 },
    { wch: 18 },
    { wch: 14 },
    { wch: 2 },
  ];
  ws["!merges"] = [
    { s: { r: 2, c: 8 }, e: { r: 2, c: 9 } },
    { s: { r: 4, c: 4 }, e: { r: 4, c: 7 } },
    { s: { r: 8, c: 1 }, e: { r: 8, c: 9 } },
    { s: { r: 10, c: 1 }, e: { r: 10, c: 3 } },
    { s: { r: 10, c: 4 }, e: { r: 10, c: 6 } },
    { s: { r: 10, c: 7 }, e: { r: 10, c: 8 } },
    { s: { r: 11, c: 1 }, e: { r: 11, c: 3 } },
    { s: { r: 11, c: 4 }, e: { r: 11, c: 6 } },
    { s: { r: 12, c: 1 }, e: { r: 12, c: 3 } },
    { s: { r: 12, c: 4 }, e: { r: 12, c: 6 } },
    { s: { r: 13, c: 1 }, e: { r: 13, c: 3 } },
    { s: { r: 13, c: 4 }, e: { r: 13, c: 6 } },
    { s: { r: 14, c: 1 }, e: { r: 14, c: 3 } },
    { s: { r: 14, c: 4 }, e: { r: 14, c: 6 } },
    { s: { r: 21, c: 1 }, e: { r: 21, c: 9 } },
    { s: { r: 30, c: 1 }, e: { r: 30, c: 9 } },
    { s: { r: 61, c: 1 }, e: { r: 61, c: 9 } },
  ];

  setCell(ws, 3, 8, "Version 001", valueStyle);
  setCell(ws, 5, 4, "RESUMEN DE LIQUIDACION", sectionTitleStyle);
  setCell(ws, 9, 1, "DATOS DE LIQUIDACION", sectionTitleStyle);

  const firstDate = rows[0]?.fechaAtencionYmd || "";
  const lastDate = rows[rows.length - 1]?.fechaAtencionYmd || "";

  setCell(ws, 11, 1, "CLIENTE:", labelStyle);
  setCell(ws, 11, 4, "WINET TELECOM", valueStyle);
  setCell(ws, 11, 7, "N° DE CORRELATIVO", labelStyle);
  setCell(ws, 11, 9, formatMonthDisplay(month), valueStyle);

  setCell(ws, 12, 1, "CONTRATISTA:", labelStyle);
  setCell(ws, 12, 4, "CONSTRUCCION DE REDES M&D", valueStyle);
  setCell(ws, 12, 7, "LIMA", valueStyle);

  setCell(ws, 13, 1, "RUC Contratista:", labelStyle);
  setCell(ws, 13, 4, 20601345979, valueStyle);

  setCell(ws, 14, 1, "Fecha de inicio de trabajos", labelStyle);
  setCell(ws, 14, 4, formatDateDisplay(firstDate), valueStyle);

  setCell(ws, 15, 1, "Fecha de fin de trabajos", labelStyle);
  setCell(ws, 15, 4, formatDateDisplay(lastDate), valueStyle);

  setCell(ws, 17, 1, "N°", headerStyle);
  setCell(ws, 17, 2, "Codigo de Partida WIN", headerStyle);
  setCell(ws, 17, 3, "Nombre de la partida", headerStyle);
  setCell(ws, 17, 4, "Cantidad", headerStyle);
  setCell(ws, 17, 5, "Precio Unitario", headerStyle);
  setCell(ws, 17, 9, "Subtotal", headerStyle);

  const cuadrillaStats = new Map<string, { tickets: number; days: Set<string> }>();
  for (const row of rows) {
    const key = row.cuadrillaNombre || "(SIN CUADRILLA)";
    const prev = cuadrillaStats.get(key) || { tickets: 0, days: new Set<string>() };
    prev.tickets += 1;
    if (row.fechaAtencionYmd) prev.days.add(row.fechaAtencionYmd);
    cuadrillaStats.set(key, prev);
  }

  const serviceQty = cuadrillaStats.size;
  const serviceUnitPrice = 15000;

  const materialRows = buildMaterialAgg(rows);
  const materialTotal = materialRows.reduce((acc, it) => acc + it.total, 0);
  const serviceSubtotal = serviceQty * serviceUnitPrice;

  setCell(ws, 18, 1, 1, bodyStyle);
  setCell(ws, 18, 2, "11125213200001", bodyStyle);
  setCell(ws, 18, 3, "ATENCION DE REQUERIMIENTOS PLANTA EXTERNA", bodyStyle);
  setCell(ws, 18, 4, serviceQty, bodyStyle);
  setCell(ws, 18, 5, serviceUnitPrice, bodyStyle);
  setCell(ws, 18, 9, serviceSubtotal, bodyStyle);

  setCell(ws, 19, 1, 2, bodyStyle);
  setCell(ws, 19, 2, "11125112900001", bodyStyle);
  setCell(ws, 19, 3, "INSUMOS Y MATERIALES PLANTA EXTERNA", bodyStyle);
  setCell(ws, 19, 4, 1, bodyStyle);
  setCell(ws, 19, 5, Number(materialTotal.toFixed(2)), bodyStyle);
  setCell(ws, 19, 9, Number(materialTotal.toFixed(2)), bodyStyle);

  setCell(ws, 20, 9, Number((serviceSubtotal + materialTotal).toFixed(2)), {
    ...bodyStyle,
    font: { bold: true },
    fill: { patternType: "solid", fgColor: { rgb: "FFF8FAFC" } },
  });

  setCell(ws, 22, 1, "DETALLE DEL MONTO A PAGAR POR SERVICIOS", sectionTitleStyle);
  ["N°", "Codigo de Partida WIN", "Nombre de la partida", "Cantidad Cuadrillas", "Cajas Trabajadas", "Dias Trabajados", "Monto diario", "Monto mensual"].forEach((label, idx) => {
    const colMap = [1, 2, 3, 4, 5, 6, 7, 9][idx];
    setCell(ws, 23, colMap, label, headerStyle);
  });

  let serviceRow = 24;
  let idx = 1;
  for (const [cuadrilla, stats] of Array.from(cuadrillaStats.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    setCell(ws, serviceRow, 1, idx, bodyStyle);
    setCell(ws, serviceRow, 2, "-", bodyStyle);
    setCell(ws, serviceRow, 3, "ATENCION DE REQUERIMIENTOS PLANTA EXTERNA", bodyStyle);
    setCell(ws, serviceRow, 4, cuadrilla, bodyStyle);
    setCell(ws, serviceRow, 5, stats.tickets, bodyStyle);
    setCell(ws, serviceRow, 6, stats.days.size, bodyStyle);
    setCell(ws, serviceRow, 7, 500, bodyStyle);
    setCell(ws, serviceRow, 9, stats.days.size * 500, bodyStyle);
    serviceRow += 1;
    idx += 1;
  }

  setCell(ws, 31, 1, "MATERIALES UTILIZADOS", sectionTitleStyle);
  setCell(ws, 32, 1, "ITEM", headerStyle);
  setCell(ws, 32, 2, "TIPO", headerStyle);
  setCell(ws, 32, 3, "DESCRIPCION", headerStyle);
  setCell(ws, 32, 5, "MEDIDA", headerStyle);
  setCell(ws, 32, 6, "CANT. DE SUMINISTROS", headerStyle);
  setCell(ws, 33, 6, "CANT. DE SUMINISTROS", headerStyle);
  setCell(ws, 33, 7, "MARCA", headerStyle);
  setCell(ws, 33, 8, "PRECIO", headerStyle);
  setCell(ws, 33, 9, "TOTAL", headerStyle);

  let materialRowCursor = 34;
  materialRows.forEach((mat, index) => {
    setCell(ws, materialRowCursor, 1, index + 1, bodyStyle);
    setCell(ws, materialRowCursor, 2, mat.tipo, bodyStyle);
    setCell(ws, materialRowCursor, 3, mat.nombre, bodyStyle);
    setCell(ws, materialRowCursor, 5, mat.unidad, bodyStyle);
    setCell(ws, materialRowCursor, 6, Number(mat.cantidad.toFixed(2)), bodyStyle);
    setCell(ws, materialRowCursor, 8, Number(mat.precio.toFixed(2)), bodyStyle);
    setCell(ws, materialRowCursor, 9, Number(mat.total.toFixed(2)), bodyStyle);
    materialRowCursor += 1;
  });
  setCell(ws, materialRowCursor, 3, "TOTAL", {
    ...bodyStyle,
    font: { bold: true },
  });
  setCell(ws, materialRowCursor, 9, Number(materialTotal.toFixed(2)), {
    ...bodyStyle,
    font: { bold: true },
  });

  setCell(ws, 62, 1, "RESUMEN DE TRABAJOS", sectionTitleStyle);
  ["FECHA DE ATENCION", "DISTRITO", "CODIGO DE TICKET", "INICIO DE TRABAJOS", "FIN DE TRABAJOS", "CAUSA RAIZ MOTIVO", "SOLUCION", "CUADRILLA", "MATERIALES"].forEach((label, idx) => {
    const col = idx + 2;
    setCell(ws, 64, col, label, headerStyle);
  });

  let detailRow = 65;
  for (const row of rows) {
    setCell(ws, detailRow, 2, row.fechaAtencionYmd, bodyStyle);
    setCell(ws, detailRow, 3, row.distrito, bodyStyle);
    setCell(ws, detailRow, 4, row.ticketNumero, bodyStyle);
    setCell(ws, detailRow, 5, row.horaInicio, bodyStyle);
    setCell(ws, detailRow, 6, row.horaFin, bodyStyle);
    setCell(ws, detailRow, 7, row.causaRaiz, bodyStyle);
    setCell(ws, detailRow, 8, solucionConObservacion(row), bodyStyle);
    setCell(ws, detailRow, 9, row.cuadrillaNombre, bodyStyle);
    setCell(ws, detailRow, 10, materialesTexto(row.materiales), bodyStyle);
    detailRow += 1;
  }

  const lastRow = Math.max(detailRow, materialRowCursor + 2, serviceRow + 1, 20);
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow - 1, c: 10 } });
  return ws;
}

function buildInternoSheet(rows: Row[]) {
  const ws: XLSX.WorkSheet = {};
  ws["!cols"] = [
    { wch: 22 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 18 },
    { wch: 20 },
    { wch: 40 },
    { wch: 18 },
    { wch: 18 },
  ];

  ["CUADRILLA", "FECHA", "HORA DE ENTRADA", "HORA DE SALIDA", "CTO/NAP ATENDIDAS", "MATERIALES", "OBSERVACION", "DIFERENCIA (minutos)", "HORAS TRABAJADAS"].forEach((h, idx) => {
    setCell(ws, 1, idx, h, headerStyle);
  });

  const grouped = new Map<string, Row[]>();
  for (const row of rows) {
    const key = `${row.cuadrillaNombre}__${row.fechaAtencionYmd}`;
    const arr = grouped.get(key) || [];
    arr.push(row);
    grouped.set(key, arr);
  }

  let r = 2;
  for (const [key, items] of Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const [cuadrilla, fecha] = key.split("__");
    const horasInicio = items.map((x) => x.horaInicio).filter(Boolean).sort();
    const horasFin = items.map((x) => x.horaFin).filter(Boolean).sort();
    const inicio = horasInicio[0] || "";
    const fin = horasFin[horasFin.length - 1] || "";
    const observacion = items.map((x) => x.causaRaiz).filter(Boolean).slice(0, 2).join(" | ");
    setCell(ws, r, 0, cuadrilla, bodyStyle);
    setCell(ws, r, 1, fecha, bodyStyle);
    setCell(ws, r, 2, inicio, bodyStyle);
    setCell(ws, r, 3, fin, bodyStyle);
    setCell(ws, r, 4, items.length, bodyStyle);
    setCell(ws, r, 5, items.reduce((acc, row) => acc + row.materiales.length, 0), bodyStyle);
    setCell(ws, r, 6, observacion, bodyStyle);
    setCell(ws, r, 7, "", bodyStyle);
    setCell(ws, r, 8, "", bodyStyle);
    r += 1;
  }
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(1, r - 1), c: 8 } });
  return ws;
}

function buildTotalesSheet(rows: Row[]) {
  const ws: XLSX.WorkSheet = {};
  ws["!cols"] = [{ wch: 24 }, { wch: 24 }, { wch: 24 }];
  setCell(ws, 1, 0, "Etiquetas de fila", headerStyle);
  setCell(ws, 1, 1, "Suma de CTO/NAP ATENDIDAS", headerStyle);
  setCell(ws, 1, 2, "Suma de MATERIALES", headerStyle);

  const grouped = new Map<string, { tickets: number; materiales: number }>();
  for (const row of rows) {
    const key = row.cuadrillaNombre || "(SIN CUADRILLA)";
    const prev = grouped.get(key) || { tickets: 0, materiales: 0 };
    prev.tickets += 1;
    prev.materiales += row.materiales.reduce((acc, m) => acc + materialQty(m), 0);
    grouped.set(key, prev);
  }

  let row1 = 2;
  let totalTickets = 0;
  let totalMateriales = 0;
  for (const [cuadrilla, agg] of Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    setCell(ws, row1, 0, cuadrilla, bodyStyle);
    setCell(ws, row1, 1, agg.tickets, bodyStyle);
    setCell(ws, row1, 2, Number(agg.materiales.toFixed(2)), bodyStyle);
    totalTickets += agg.tickets;
    totalMateriales += agg.materiales;
    row1 += 1;
  }
  setCell(ws, row1, 0, "Total general", { ...bodyStyle, font: { bold: true } });
  setCell(ws, row1, 1, totalTickets, { ...bodyStyle, font: { bold: true } });
  setCell(ws, row1, 2, Number(totalMateriales.toFixed(2)), { ...bodyStyle, font: { bold: true } });
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(1, row1 - 1), c: 2 } });
  return ws;
}

function buildMaterialesFlatSheet(rows: Row[]) {
  const ws: XLSX.WorkSheet = {};
  const baseHeaders = [
    "FECHA DE ATENCION",
    "DISTRITO",
    "CODIGO DE CAJA",
    "INICIO DE TRABAJOS",
    "FIN DE TRABAJOS",
    "CAUSA RAIZ MOTIVO",
    "SOLUCION",
    "CUADRILLA",
  ];
  const headers = [...baseHeaders, ...MATERIALES_SHEET_HEADERS];

  ws["!cols"] = headers.map((header, idx) => {
    if (idx === 0) return { wch: 16 };
    if (idx === 1) return { wch: 20 };
    if (idx === 2) return { wch: 18 };
    if (idx === 3 || idx === 4) return { wch: 14 };
    if (idx === 5) return { wch: 28 };
    if (idx === 6) return { wch: 60 };
    if (idx === 7) return { wch: 24 };
    return { wch: 5 };
  });
  ws["!rows"] = [{ hpt: 140 }];

  headers.forEach((header, idx) => setCell(ws, 1, idx, header, idx >= 8 ? verticalHeaderStyle : headerStyle));

  let row1 = 2;
  for (const row of rows) {
    const materialValues = new Map<string, number>();
    for (const mat of row.materiales) {
      const header = resolveMaterialesSheetHeader(mat);
      if (!header) continue;
      const prev = materialValues.get(header) || 0;
      materialValues.set(header, Number((prev + materialQty(mat)).toFixed(2)));
    }

    setCell(ws, row1, 0, row.fechaAtencionYmd, bodyStyle);
    setCell(ws, row1, 1, row.distrito, bodyStyle);
    setCell(ws, row1, 2, row.codigoCaja || row.ticketNumero, bodyStyle);
    setCell(ws, row1, 3, row.horaInicio, bodyStyle);
    setCell(ws, row1, 4, row.horaFin, bodyStyle);
    setCell(ws, row1, 5, row.causaRaiz, bodyStyle);
    setCell(ws, row1, 6, solucionConObservacion(row), bodyStyle);
    setCell(ws, row1, 7, row.cuadrillaNombre, bodyStyle);

    MATERIALES_SHEET_HEADERS.forEach((header, idx) => {
      const value = materialValues.get(header);
      setCell(ws, row1, 8 + idx, value ? Number(value.toFixed(2)) : "", bodyStyle);
    });

    row1 += 1;
  }

  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(1, row1 - 1), c: headers.length - 1 } });
  return ws;
}

function buildCuadrillaConsumoSheet(cuadrilla: string, rows: Row[]) {
  const ws: XLSX.WorkSheet = {};
  ws["!cols"] = [
    { wch: 16 },
    { wch: 20 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 24 },
    { wch: 18 },
  ];

  setCell(ws, 1, 0, `CONSUMO DE MATERIALES - ${cuadrilla || "SIN CUADRILLA"}`, sectionTitleStyle);
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];

  setCell(ws, 3, 0, "CUADRILLA", labelStyle);
  setCell(ws, 3, 1, cuadrilla || "SIN CUADRILLA", valueStyle);
  setCell(ws, 3, 3, "TICKETS", labelStyle);
  setCell(ws, 3, 4, rows.length, valueStyle);

  setCell(ws, 5, 0, "RESUMEN DE CONSUMO", sectionTitleStyle);
  ws["!merges"].push({ s: { r: 4, c: 0 }, e: { r: 4, c: 7 } });

  ["ITEM", "TIPO", "DESCRIPCION", "UNIDAD", "CANTIDAD", "PRECIO UNITARIO", "TOTAL"].forEach((label, idx) => {
    setCell(ws, 6, idx, label, headerStyle);
  });

  const materialRows = buildMaterialAgg(rows);
  let row1 = 7;
  materialRows.forEach((mat, index) => {
    setCell(ws, row1, 0, index + 1, bodyStyle);
    setCell(ws, row1, 1, mat.tipo, bodyStyle);
    setCell(ws, row1, 2, mat.nombre, bodyStyle);
    setCell(ws, row1, 3, mat.unidad, bodyStyle);
    setCell(ws, row1, 4, Number(mat.cantidad.toFixed(2)), bodyStyle);
    setCell(ws, row1, 5, Number(mat.precio.toFixed(2)), bodyStyle);
    setCell(ws, row1, 6, Number(mat.total.toFixed(2)), bodyStyle);
    row1 += 1;
  });

  const materialTotal = materialRows.reduce((acc, it) => acc + it.total, 0);
  setCell(ws, row1, 2, "TOTAL", { ...bodyStyle, font: { bold: true } });
  setCell(ws, row1, 6, Number(materialTotal.toFixed(2)), { ...bodyStyle, font: { bold: true } });
  row1 += 2;

  setCell(ws, row1, 0, "DETALLE POR TICKET", sectionTitleStyle);
  ws["!merges"].push({ s: { r: row1 - 1, c: 0 }, e: { r: row1 - 1, c: 7 } });
  row1 += 1;

  ["FECHA", "TICKET", "DISTRITO", "CAUSA RAIZ", "SOLUCION", "MATERIALES", "TOTAL MATERIALES"].forEach((label, idx) => {
    setCell(ws, row1, idx, label, headerStyle);
  });
  row1 += 1;

  for (const row of rows) {
    const rowTotal = row.materiales.reduce((acc, mat) => acc + toNum(mat?.total), 0);
    setCell(ws, row1, 0, row.fechaAtencionYmd, bodyStyle);
    setCell(ws, row1, 1, row.ticketNumero, bodyStyle);
    setCell(ws, row1, 2, row.distrito, bodyStyle);
    setCell(ws, row1, 3, row.causaRaiz, bodyStyle);
    setCell(ws, row1, 4, solucionConObservacion(row), bodyStyle);
    setCell(ws, row1, 5, materialesTexto(row.materiales), bodyStyle);
    setCell(ws, row1, 6, Number(rowTotal.toFixed(2)), bodyStyle);
    row1 += 1;
  }

  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(1, row1 - 1), c: 7 } });
  return ws;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    requireAreaScope(session, ["MANTENIMIENTO"]);

    const { searchParams } = new URL(req.url);
    const month = toStr(searchParams.get("month"));

    const all = await listMantenimientoLiquidaciones();
    const rows: Row[] = all
      .filter((it: any) => !month || toStr(it.fechaAtencionYmd).slice(0, 7) === month)
      .sort((a: any, b: any) => toStr(a.fechaAtencionYmd).localeCompare(toStr(b.fechaAtencionYmd)))
      .map((it: any) => ({
        fechaAtencionYmd: toStr(it.fechaAtencionYmd),
        distrito: toStr(it.distrito),
        codigoCaja: toStr(it.codigoCaja),
        horaInicio: toStr(it.horaInicio),
        horaFin: toStr(it.horaFin),
        causaRaiz: toStr(it.causaRaiz),
        solucion: toStr(it.solucion),
        observacion: toStr(it.observacion),
        cuadrillaNombre: toStr(it.cuadrillaNombre),
        ticketNumero: toStr(it.ticketNumero),
        estado: toStr(it.estado),
        materiales: materialesBase(it),
      }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, buildResumenSheet(rows, month), "Resumen de liquidaciones");
    XLSX.utils.book_append_sheet(wb, buildMaterialesFlatSheet(rows), "MATERIALES");
    XLSX.utils.book_append_sheet(wb, buildInternoSheet(rows), "Interno");
    XLSX.utils.book_append_sheet(wb, buildTotalesSheet(rows), "Totales");
    const usedSheetNames = new Set(wb.SheetNames);
    const rowsByCuadrilla = new Map<string, Row[]>();
    for (const row of rows) {
      const key = row.cuadrillaNombre || "Sin cuadrilla";
      const items = rowsByCuadrilla.get(key) || [];
      items.push(row);
      rowsByCuadrilla.set(key, items);
    }
    for (const [cuadrilla, items] of Array.from(rowsByCuadrilla.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      const sheetName = sanitizeSheetName(cuadrilla, usedSheetNames);
      XLSX.utils.book_append_sheet(wb, buildCuadrillaConsumoSheet(cuadrilla, items), sheetName);
    }

    const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellStyles: true });
    const name = `mantenimiento_liquidaciones_${month || "all"}.xlsx`;

    return new Response(out, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}"`,
      },
    });
  } catch (e: any) {
    const msg = String(e?.message || "ERROR");
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "ACCESS_DISABLED" || msg === "AREA_FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
