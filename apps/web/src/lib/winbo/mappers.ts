export type OrdenImportInput = {
  ordenId: string;
  tipoOrden?: string;
  tipoTraba?: string;
  fSoli?: Date | null;
  cliente?: string;
  tipo?: string;
  tipoClienId?: string;
  cuadrilla?: string;
  estado?: string;
  direccion?: string;
  direccion1?: string;
  idenServi?: string;
  region?: string;
  zonaDistrito?: string;
  codiSeguiClien?: string;
  numeroDocumento?: string;
  telefono?: string;
  fechaFinVisi?: Date | null;
  fechaIniVisi?: Date | null;
  motivoCancelacion?: string;
  georeferencia?: string;
};

export type ParsedWinboRow = Record<string, unknown>;

export type WinboMapIssue = {
  rowNumber: number;
  level: "warning" | "error";
  code: string;
  detail?: string;
};

export type MapWinboRowsResult = {
  payloads: OrdenImportInput[];
  invalidos: number;
  warnings: string[];
  issues: WinboMapIssue[];
};

function asTrimmedString(value: unknown): string {
  return String(value ?? "").trim();
}

function emptyToUndefined(value: unknown): string | undefined {
  const txt = asTrimmedString(value);
  return txt || undefined;
}

function parseExcelDateLike(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = Math.round((value - 25569) * 86400 * 1000);
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const raw = asTrimmedString(value);
  if (!raw) return null;

  const isoLike = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (isoLike) {
    const [, y, m, d, hh = "00", mm = "00", ss = "00"] = isoLike;
    const date = new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      Number(ss)
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const dmyLike = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmyLike) {
    let [, d, m, y, hh = "00", mm = "00", ss = "00"] = dmyLike;
    let year = Number(y);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    const date = new Date(
      year,
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      Number(ss)
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const native = new Date(raw);
  if (!Number.isNaN(native.getTime())) return native;
  return null;
}

function firstNonEmpty(row: ParsedWinboRow, aliases: string[]) {
  for (const alias of aliases) {
    const value = row[alias];
    const txt = asTrimmedString(value);
    if (txt) return value;
  }
  return undefined;
}

function buildPayload(row: ParsedWinboRow): OrdenImportInput | null {
  const ordenId = emptyToUndefined(firstNonEmpty(row, ["ordenid", "orden", "nroorden", "numeroorden"]));
  if (!ordenId) return null;

  return {
    ordenId,
    tipoOrden: emptyToUndefined(firstNonEmpty(row, ["tipoorden", "tipoordenservicio"])),
    tipoTraba: emptyToUndefined(firstNonEmpty(row, ["tipotraba", "tipotrabajo", "tiposervicio"])),
    fSoli: parseExcelDateLike(firstNonEmpty(row, ["fsoli", "fechasolicitud", "fechasoli", "fechaorden"])),
    cliente: emptyToUndefined(firstNonEmpty(row, ["cliente", "nombrecliente"])),
    tipo: emptyToUndefined(firstNonEmpty(row, ["tipo", "segmento"])),
    tipoClienId: emptyToUndefined(firstNonEmpty(row, ["tipoclienid", "tipoclienteid", "tipocliente"])),
    cuadrilla: emptyToUndefined(firstNonEmpty(row, ["cuadrilla", "cuadrillanombre"])),
    estado: emptyToUndefined(firstNonEmpty(row, ["estado", "estadoorden"])),
    direccion: emptyToUndefined(firstNonEmpty(row, ["direccion", "direccionprincipal"])),
    direccion1: emptyToUndefined(firstNonEmpty(row, ["direccion1", "direccionsecundaria"])),
    idenServi: emptyToUndefined(firstNonEmpty(row, ["idenservi", "identservicio", "plan", "servicio"])),
    region: emptyToUndefined(firstNonEmpty(row, ["region"])),
    zonaDistrito: emptyToUndefined(firstNonEmpty(row, ["zonadistrito", "zona", "distrito"])),
    codiSeguiClien: emptyToUndefined(firstNonEmpty(row, ["codiseguiclien", "codigoseguimientocliente", "codigocliente"])),
    numeroDocumento: emptyToUndefined(firstNonEmpty(row, ["numerodocumento", "documento", "dni"])),
    telefono: emptyToUndefined(
      firstNonEmpty(row, ["telefono", "telefono1", "celular", "telemovilnume", "telemovil", "movil"])
    ),
    fechaFinVisi: parseExcelDateLike(firstNonEmpty(row, ["fechafinvisi", "fechavisitafin", "fechavisita", "fechafin"])),
    fechaIniVisi: parseExcelDateLike(firstNonEmpty(row, ["fechainivisi", "fechavisitainicio", "fechainicio"])),
    motivoCancelacion: emptyToUndefined(firstNonEmpty(row, ["motivocancelacion", "motivo", "motivocancela"])),
    georeferencia: emptyToUndefined(firstNonEmpty(row, ["georeferencia", "geo", "coordenadas"])),
  };
}

export function mapWinboRowsToOrdenImport(rows: ParsedWinboRow[]): MapWinboRowsResult {
  const payloads: OrdenImportInput[] = [];
  const issues: WinboMapIssue[] = [];
  const warnings = new Set<string>();
  let invalidos = 0;

  rows.forEach((row, index) => {
    const rowNumber = Number(row.__rowNumber || index + 2);
    const payload = buildPayload(row);
    if (!payload) {
      invalidos += 1;
      issues.push({ rowNumber, level: "error", code: "ORDEN_ID_REQUIRED" });
      return;
    }

    if (!payload.fechaFinVisi && !payload.fSoli) {
      warnings.add("Hay filas sin fechaFinVisi ni fSoli; se importan igual si tienen ordenId.");
      issues.push({
        rowNumber,
        level: "warning",
        code: "MISSING_PRIMARY_DATE",
        detail: payload.ordenId,
      });
    }

    payloads.push(payload);
  });

  return {
    payloads,
    invalidos,
    warnings: Array.from(warnings),
    issues,
  };
}
