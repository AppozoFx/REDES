import * as XLSX from "xlsx";
import type { ParsedWinboRow } from "./mappers";

export type ParseWinboExportResult = {
  sheetName: string;
  totalRows: number;
  rowsValidas: number;
  rowsOmitidas: number;
  columnasFaltantes: string[];
  warnings: string[];
  rows: ParsedWinboRow[];
};

type HeaderCandidate = {
  rowIndex: number;
  headers: string[];
  score: number;
};

const REQUIRED_HEADER_GROUPS = [
  ["orden", "ordenid", "nroorden", "numeroorden"],
];

const OPTIONAL_SIGNAL_HEADERS = [
  "cliente",
  "estado",
  "direccion",
  "fecha",
  "telefono",
  "cuadrilla",
  "region",
  "zona",
];

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function isMeaningfulRow(values: unknown[]) {
  return values.some((value) => String(value ?? "").trim() !== "");
}

function scoreHeaderRow(values: unknown[]): HeaderCandidate {
  const headers = values.map(normalizeHeader);
  let score = 0;

  for (const group of REQUIRED_HEADER_GROUPS) {
    if (group.some((candidate) => headers.includes(candidate))) score += 10;
  }
  for (const signal of OPTIONAL_SIGNAL_HEADERS) {
    if (headers.some((header) => header.includes(signal))) score += 1;
  }

  return { rowIndex: 0, headers, score };
}

function pickHeaderRow(rows: unknown[][]): HeaderCandidate | null {
  let best: HeaderCandidate | null = null;
  const maxScan = Math.min(rows.length, 12);
  for (let i = 0; i < maxScan; i += 1) {
    const values = rows[i] || [];
    if (!isMeaningfulRow(values)) continue;
    const candidate = scoreHeaderRow(values);
    candidate.rowIndex = i;
    if (!best || candidate.score > best.score) best = candidate;
  }
  return best && best.score >= 10 ? best : null;
}

function resolveSheet(workbook: XLSX.WorkBook) {
  const preferred = workbook.Sheets["Hoja de Datos"];
  if (preferred) return { name: "Hoja de Datos", sheet: preferred };

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
    if (rows.some((row) => isMeaningfulRow(row || []))) {
      return { name, sheet };
    }
  }
  return null;
}

function buildCanonicalRow(headers: string[], values: unknown[], rowNumber: number): ParsedWinboRow {
  const row: ParsedWinboRow = { __rowNumber: rowNumber };
  headers.forEach((header, index) => {
    if (!header) return;
    row[header] = values[index];
  });
  return row;
}

export function parseWinboOrdenesExport(input: Buffer): ParseWinboExportResult {
  const workbook = XLSX.read(input, { type: "buffer", cellDates: true, raw: true });
  const resolved = resolveSheet(workbook);
  if (!resolved) {
    throw new Error("WINBO_SHEET_NOT_FOUND");
  }

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(resolved.sheet, { header: 1, defval: "" });
  const headerCandidate = pickHeaderRow(matrix);
  if (!headerCandidate) {
    throw new Error("WINBO_HEADERS_NOT_FOUND");
  }

  const columnasFaltantes = REQUIRED_HEADER_GROUPS.flatMap((group) =>
    group.some((candidate) => headerCandidate.headers.includes(candidate)) ? [] : [group[0]]
  );

  const warnings: string[] = [];
  if (columnasFaltantes.length > 0) {
    warnings.push("No se reconocieron todos los encabezados esperados del export WinBo.");
  }

  const dataRows = matrix.slice(headerCandidate.rowIndex + 1);
  const rows: ParsedWinboRow[] = [];
  let rowsOmitidas = 0;

  dataRows.forEach((values, index) => {
    if (!isMeaningfulRow(values || [])) {
      rowsOmitidas += 1;
      return;
    }
    rows.push(buildCanonicalRow(headerCandidate.headers, values || [], headerCandidate.rowIndex + index + 2));
  });

  return {
    sheetName: resolved.name,
    totalRows: dataRows.length,
    rowsValidas: rows.length,
    rowsOmitidas,
    columnasFaltantes,
    warnings,
    rows,
  };
}
