import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { FieldValue, type DocumentReference, type WriteBatch } from "firebase-admin/firestore";
import * as XLSX from "xlsx";

import { adminDb } from "@/lib/firebase/admin";

export const DEFAULT_INST_YM = "2026-04";
export const WORKBOOK_NAME = "BBDD_M&D_01-06-2026.xlsx";
export const WORKBOOK_SHEET = "Garantia";
export const POWER_BI_GARANTIAS_URL =
  "https://app.powerbi.com/view?r=eyJrIjoiNzNlNDg4YTQtZmQ5Yy00OGNlLTlhZDUtZDQxNjBhNGIyYTJlIiwidCI6ImZhY2I1NjA3LTBhNDMtNDQwOS1hY2MxLWIxZTI2OWZhZjdhOCIsImMiOjR9";

const IMPORTS_COLLECTION = "garantias_cruce_imports";
const PERIODS_COLLECTION = "garantias_cruce_periods";

export type ProviderGarantia = {
  key: string;
  id: string;
  codPedido: string;
  nombre: string;
  fechaAtencionYmd: string;
  fechaInstalacionYmd: string;
  solucionado: string;
  partner: string;
  tipoCierre: string;
  cuadrilla: string;
  diasDesdeInstalacion: number | null;
  rowNumber: number;
};

export type ProviderMonthSummary = {
  instYm: string;
  total: number;
  attentionMonths: Array<{ ym: string; total: number }>;
};

export type ProviderParseResult = {
  sheetName: string;
  totalRows: number;
  validRows: number;
  omittedRows: number;
  omittedByReason: Record<string, number>;
  rows: ProviderGarantia[];
  months: ProviderMonthSummary[];
};

export type ProviderRowsSource = {
  mode: "firestore" | "local";
  importId: string;
  fileName: string;
  sheetName: string;
  uploadedAtText: string;
};

export type ProviderRowsForMonth = {
  rows: ProviderGarantia[];
  source: ProviderRowsSource;
};

function parseLimaYmd(ymd: string) {
  const parts = String(ymd || "").split("-");
  if (parts.length !== 3) return Number.NaN;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!y || !m || !d) return Number.NaN;
  return Date.UTC(y, m - 1, d, 5, 0, 0);
}

function diffDays(fromYmd: string, toYmd: string) {
  const from = parseLimaYmd(fromYmd);
  const to = parseLimaYmd(toYmd);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.floor((to - from) / (24 * 60 * 60 * 1000));
}

function parseExcelDate(value: unknown) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return "";
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const s = String(value || "").trim();
  const iso = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const dmy = /(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(s);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return "";
}

export function normalizeText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeHeader(value: unknown) {
  return normalizeText(value).replace(/\s+/g, "");
}

function toStr(value: unknown) {
  return String(value || "").trim();
}

function isMydPartner(raw: string) {
  const s = normalizeText(raw);
  return s === "M D" || s === "M D SGI" || s.includes("M D");
}

function getValue(row: Record<string, unknown>, header: string) {
  const desired = normalizeHeader(header);
  const key = Object.keys(row).find((candidate) => normalizeHeader(candidate) === desired);
  return key ? row[key] : "";
}

function addReason(target: Record<string, number>, reason: string) {
  target[reason] = (target[reason] || 0) + 1;
}

function resolveSheet(workbook: XLSX.WorkBook) {
  const sheetName =
    workbook.SheetNames.find((name) => normalizeText(name) === "GARANTIA") ||
    workbook.SheetNames.find((name) => normalizeText(name).includes("GARANTIA")) ||
    workbook.SheetNames[1] ||
    workbook.SheetNames[0];
  return sheetName ? { sheetName, sheet: workbook.Sheets[sheetName] } : null;
}

export function parseProviderWorkbook(input: Buffer | ArrayBuffer): ProviderParseResult {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: true });
  const resolved = resolveSheet(workbook);
  if (!resolved?.sheet) throw new Error("SHEET_GARANTIA_NOT_FOUND");

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(resolved.sheet, { defval: "", raw: true });
  const rows: ProviderGarantia[] = [];
  const omittedByReason: Record<string, number> = {};

  rawRows.forEach((row, index) => {
    const fechaInstalacionYmd = parseExcelDate(getValue(row, "FECHA DE INSTALACION"));
    const fechaAtencionYmd = parseExcelDate(getValue(row, "Fecha atencion"));
    const codPedido = toStr(getValue(row, "cod_pedido"));
    const nombre = toStr(getValue(row, "nombre"));
    const partner = toStr(getValue(row, "PARTNER_INSTALADOR"));

    if (!fechaInstalacionYmd) {
      addReason(omittedByReason, "sin_fecha_instalacion");
      return;
    }
    if (!fechaAtencionYmd) {
      addReason(omittedByReason, "sin_fecha_atencion");
      return;
    }
    if (!codPedido && !nombre) {
      addReason(omittedByReason, "sin_codigo_y_cliente");
      return;
    }
    if (partner && !isMydPartner(partner)) {
      addReason(omittedByReason, "otro_partner");
      return;
    }

    const diasDesdeInstalacion = diffDays(fechaInstalacionYmd, fechaAtencionYmd);
    if (diasDesdeInstalacion != null && (diasDesdeInstalacion < 0 || diasDesdeInstalacion > 30)) {
      addReason(omittedByReason, "fuera_ventana_30_dias");
      return;
    }

    const id = toStr(getValue(row, "id"));
    const rowNumber = index + 2;
    rows.push({
      key: `${codPedido || normalizeText(nombre)}|${fechaInstalacionYmd}|${fechaAtencionYmd}|${id}|${rowNumber}`,
      id,
      codPedido,
      nombre,
      fechaAtencionYmd,
      fechaInstalacionYmd,
      solucionado: toStr(getValue(row, "Solucionado")),
      partner,
      tipoCierre: toStr(getValue(row, "TIPO_CIERRE")),
      cuadrilla: toStr(getValue(row, "CUADRILLA")),
      diasDesdeInstalacion,
      rowNumber,
    });
  });

  rows.sort((a, b) => {
    const instCmp = a.fechaInstalacionYmd.localeCompare(b.fechaInstalacionYmd);
    if (instCmp !== 0) return instCmp;
    const atCmp = a.fechaAtencionYmd.localeCompare(b.fechaAtencionYmd);
    if (atCmp !== 0) return atCmp;
    return a.nombre.localeCompare(b.nombre);
  });

  return {
    sheetName: resolved.sheetName,
    totalRows: rawRows.length,
    validRows: rows.length,
    omittedRows: rawRows.length - rows.length,
    omittedByReason,
    rows,
    months: summarizeProviderMonths(rows),
  };
}

export function summarizeProviderMonths(rows: ProviderGarantia[]): ProviderMonthSummary[] {
  const byMonth = new Map<string, ProviderGarantia[]>();
  for (const row of rows) {
    const instYm = row.fechaInstalacionYmd.slice(0, 7);
    if (!instYm) continue;
    const bucket = byMonth.get(instYm);
    if (bucket) bucket.push(row);
    else byMonth.set(instYm, [row]);
  }

  return Array.from(byMonth.entries())
    .map(([instYm, items]) => ({
      instYm,
      total: items.length,
      attentionMonths: countByAttentionMonth(items),
    }))
    .sort((a, b) => a.instYm.localeCompare(b.instYm));
}

export function countByAttentionMonth(rows: ProviderGarantia[]) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const ym = row.fechaAtencionYmd.slice(0, 7) || "Sin fecha";
    map.set(ym, (map.get(ym) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([ym, total]) => ({ ym, total }))
    .sort((a, b) => a.ym.localeCompare(b.ym));
}

async function resolveWorkbookPath() {
  const candidates = [
    path.join(process.cwd(), WORKBOOK_NAME),
    path.join(process.cwd(), "..", WORKBOOK_NAME),
    path.join(process.cwd(), "..", "..", WORKBOOK_NAME),
    path.join(process.cwd(), "..", "..", "..", WORKBOOK_NAME),
  ];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // next known local/standalone layout
    }
  }
  return "";
}

async function loadProviderRowsFromLocalWorkbook(instYm: string): Promise<ProviderRowsForMonth> {
  const workbookPath = await resolveWorkbookPath();
  if (!workbookPath) throw new Error(`No se encontro ${WORKBOOK_NAME}`);
  const buffer = await fs.readFile(workbookPath);
  const parsed = parseProviderWorkbook(buffer);
  return {
    rows: parsed.rows.filter((row) => row.fechaInstalacionYmd.startsWith(instYm)),
    source: {
      mode: "local",
      importId: "",
      fileName: WORKBOOK_NAME,
      sheetName: parsed.sheetName,
      uploadedAtText: "",
    },
  };
}

async function loadProviderRowsFromFirestore(instYm: string): Promise<ProviderRowsForMonth | null> {
  const periodRef = adminDb().collection(PERIODS_COLLECTION).doc(instYm);
  const periodSnap = await periodRef.get();
  if (!periodSnap.exists) return null;

  const period = periodSnap.data() as any;
  const rowsSnap = await periodRef.collection("rows").orderBy("fechaAtencionYmd", "asc").get();
  const rows = rowsSnap.docs.map((doc) => doc.data() as ProviderGarantia);

  return {
    rows,
    source: {
      mode: "firestore",
      importId: String(period?.importId || ""),
      fileName: String(period?.fileName || ""),
      sheetName: String(period?.sheetName || WORKBOOK_SHEET),
      uploadedAtText: String(period?.uploadedAtText || ""),
    },
  };
}

export async function loadProviderRowsForMonth(instYm: string): Promise<ProviderRowsForMonth> {
  const persisted = await loadProviderRowsFromFirestore(instYm);
  if (persisted) return persisted;
  return loadProviderRowsFromLocalWorkbook(instYm);
}

function rowDocId(row: ProviderGarantia) {
  return crypto.createHash("sha1").update(row.key).digest("hex");
}

async function deleteExistingRows(periodRef: DocumentReference) {
  while (true) {
    const snap = await periodRef.collection("rows").limit(450).get();
    if (snap.empty) return;
    const batch = adminDb().batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

async function commitChunked(writes: Array<(batch: WriteBatch) => void>) {
  for (let start = 0; start < writes.length; start += 450) {
    const batch = adminDb().batch();
    writes.slice(start, start + 450).forEach((write) => write(batch));
    await batch.commit();
  }
}

export async function saveProviderImport(params: {
  fileName: string;
  buffer: Buffer | ArrayBuffer;
  actorUid: string;
  actorName?: string;
}) {
  const parsed = parseProviderWorkbook(params.buffer);
  if (!parsed.rows.length) throw new Error("SIN_FILAS_VALIDAS");

  const db = adminDb();
  const importRef = db.collection(IMPORTS_COLLECTION).doc();
  const uploadedAtText = new Date().toISOString();

  await importRef.set({
    fileName: params.fileName,
    sheetName: parsed.sheetName,
    totalRows: parsed.totalRows,
    validRows: parsed.validRows,
    omittedRows: parsed.omittedRows,
    omittedByReason: parsed.omittedByReason,
    months: parsed.months,
    uploadedByUid: params.actorUid,
    uploadedByName: params.actorName || "",
    uploadedAtText,
    uploadedAt: FieldValue.serverTimestamp(),
  });

  const rowsByMonth = new Map<string, ProviderGarantia[]>();
  for (const row of parsed.rows) {
    const instYm = row.fechaInstalacionYmd.slice(0, 7);
    const bucket = rowsByMonth.get(instYm);
    if (bucket) bucket.push(row);
    else rowsByMonth.set(instYm, [row]);
  }

  for (const [instYm, rows] of rowsByMonth.entries()) {
    const periodRef = db.collection(PERIODS_COLLECTION).doc(instYm);
    await deleteExistingRows(periodRef);

    await periodRef.set(
      {
        instYm,
        importId: importRef.id,
        fileName: params.fileName,
        sheetName: parsed.sheetName,
        totalRows: rows.length,
        attentionMonths: countByAttentionMonth(rows),
        uploadedByUid: params.actorUid,
        uploadedByName: params.actorName || "",
        uploadedAtText,
        uploadedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await commitChunked(
      rows.map((row) => (batch) => {
        batch.set(periodRef.collection("rows").doc(rowDocId(row)), {
          ...row,
          instYm,
          importId: importRef.id,
          uploadedAtText,
        });
      })
    );
  }

  return {
    importId: importRef.id,
    fileName: params.fileName,
    sheetName: parsed.sheetName,
    totalRows: parsed.totalRows,
    validRows: parsed.validRows,
    omittedRows: parsed.omittedRows,
    omittedByReason: parsed.omittedByReason,
    months: parsed.months,
  };
}

export async function listProviderPeriods() {
  const snap = await adminDb().collection(PERIODS_COLLECTION).orderBy("instYm", "desc").limit(24).get();
  return snap.docs.map((doc) => {
    const data = doc.data() as any;
    return {
      instYm: String(data?.instYm || doc.id),
      totalRows: Number(data?.totalRows || 0),
      fileName: String(data?.fileName || ""),
      sheetName: String(data?.sheetName || ""),
      importId: String(data?.importId || ""),
      uploadedAtText: String(data?.uploadedAtText || ""),
      attentionMonths: Array.isArray(data?.attentionMonths) ? data.attentionMonths : [],
    };
  });
}
