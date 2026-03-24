export type TelegramMantenimientoFormat = "LONG" | "SHORT";

export type ParsedTelegramMantenimiento = {
  format: TelegramMantenimientoFormat;
  ticketNumero: string;
  codigoCaja: string;
  ctoNap: string;
  latitud: number | null;
  longitud: number | null;
  distrito: string;
  observacion: string;
  causaRaizCandidate: string;
  procedencia: string;
  nodo: string;
  proyecto: string;
  clientesAfectados: number | null;
  rawText: string;
  warnings: string[];
};

function cleanLine(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeText(value: unknown): string {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[“”"]/g, "")
    .trim();
}

function normalizeUpper(value: unknown): string {
  return cleanLine(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function looksLikeTicket(value: string): boolean {
  const clean = cleanLine(value);
  return /^[A-Z0-9]+(?:-[A-Z0-9]+){2,}$/i.test(clean) || /^\d{3,8}$/.test(clean);
}

function extractTicket(line: string): string {
  const clean = cleanLine(line);
  const tagged = clean.match(/\bTICKET\s*:\s*([A-Z0-9-]+)/i);
  if (tagged?.[1] && looksLikeTicket(tagged[1])) return cleanLine(tagged[1]).toUpperCase();
  if (looksLikeTicket(clean)) return clean.toUpperCase();
  const embedded = clean.match(/\b([A-Z0-9]+(?:-[A-Z0-9]+){2,})\b/i);
  if (embedded?.[1] && looksLikeTicket(embedded[1])) return cleanLine(embedded[1]).toUpperCase();
  const numeric = clean.match(/\b(\d{3,8})\b/);
  if (numeric?.[1]) return numeric[1];
  return "";
}

function parseCoords(raw: string): { latitud: number | null; longitud: number | null } {
  const clean = cleanLine(raw);
  const comma = clean.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  const spaced = clean.match(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/);
  const match = comma || spaced;
  if (!match) return { latitud: null, longitud: null };
  const latitud = Number(match[1]);
  const longitud = Number(match[2]);
  if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) {
    return { latitud: null, longitud: null };
  }
  if (latitud < -90 || latitud > 90 || longitud < -180 || longitud > 180) {
    return { latitud: null, longitud: null };
  }
  return { latitud, longitud };
}

function parseNumeric(raw: string): number | null {
  const digits = cleanLine(raw).replace(/[^\d]/g, "");
  if (!digits) return null;
  const out = Number(digits);
  return Number.isFinite(out) ? out : null;
}

function firstNonEmpty(values: string[]): string {
  for (const value of values) {
    const clean = cleanLine(value);
    if (clean) return clean;
  }
  return "";
}

function isLikelyCtoNapLine(line: string): boolean {
  const clean = cleanLine(line);
  if (!clean) return false;
  if (/^CTO\/NAP\b/i.test(clean)) return false;
  if (looksLikeTicket(clean)) return false;
  if (/^-?\d+(?:\.\d+)?(?:\s*,\s*|\s+)-?\d+(?:\.\d+)?$/.test(clean)) return false;
  return /^(W[N-]|W-|NAP|CTO)/i.test(clean);
}

function findLabelValue(lines: string[], label: string): string {
  const upperLabel = normalizeUpper(label);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const upper = normalizeUpper(line);
    if (upper === `${upperLabel}:`) {
      const next = cleanLine(lines[i + 1] || "");
      if (next) return next;
      continue;
    }
    if (upper.startsWith(`${upperLabel}:`)) {
      const inline = cleanLine(line.slice(line.indexOf(":") + 1));
      if (inline) return inline;
      const next = cleanLine(lines[i + 1] || "");
      if (next) return next;
    }
  }
  return "";
}

function findFirstCoords(lines: string[]): { latitud: number | null; longitud: number | null } {
  for (const line of lines) {
    const coords = parseCoords(line);
    if (coords.latitud !== null && coords.longitud !== null) return coords;
  }
  return { latitud: null, longitud: null };
}

function inferCtoNap(lines: string[], ticketNumero: string): string {
  const explicit = firstNonEmpty([
    findLabelValue(lines, "CTO/NAP"),
    findLabelValue(lines, "CTO"),
  ]);
  if (explicit) return explicit;

  for (let i = 0; i < lines.length; i += 1) {
    const line = cleanLine(lines[i]);
    if (!line) continue;
    if (line.toUpperCase() === ticketNumero.toUpperCase()) continue;
    if (isLikelyCtoNapLine(line)) return line;
  }
  return "";
}

function inferObservacion(lines: string[], ticketNumero: string, ctoNap: string): string {
  const explicit = firstNonEmpty([
    findLabelValue(lines, "OBSERVACION"),
    findLabelValue(lines, "OBSERVACIÓN"),
  ]);
  if (explicit) return explicit;

  const candidates = lines
    .map((line) => cleanLine(line))
    .filter(Boolean)
    .filter((line) => line.toUpperCase() !== ticketNumero.toUpperCase())
    .filter((line) => line.toUpperCase() !== ctoNap.toUpperCase())
    .filter((line) => !/^TICKET\s*:/i.test(line))
    .filter((line) => !/^CTO\/NAP\s*:/i.test(line))
    .filter((line) => !/^CTO\s*:/i.test(line))
    .filter((line) => !/^COORDENADAS\s*:/i.test(line))
    .filter((line) => !/^PROCEDENCIA\s*:/i.test(line))
    .filter((line) => !/^DISTRITO\s*:/i.test(line))
    .filter((line) => !/^NODO\s*:/i.test(line))
    .filter((line) => !/^PROYECTO\s*:/i.test(line))
    .filter((line) => !/^CLIENTES AFECTADOS\s*:/i.test(line))
    .filter((line) => parseCoords(line).latitud === null)
    .filter((line) => !isLikelyCtoNapLine(line));

  return candidates[0] || "";
}

function detectMessage(rawInput: string): ParsedTelegramMantenimiento | null {
  const normalized = normalizeText(rawInput);
  if (!normalized) return null;
  const lines = normalized
    .split("\n")
    .map((line) => cleanLine(line))
    .filter(Boolean);
  if (!lines.length) return null;

  const ticketNumero = lines.map(extractTicket).find(Boolean) || "";
  if (!ticketNumero) return null;

  const ctoNap = inferCtoNap(lines, ticketNumero);
  const explicitCoords = firstNonEmpty([findLabelValue(lines, "COORDENADAS")]);
  const coords = explicitCoords ? parseCoords(explicitCoords) : findFirstCoords(lines);
  const distrito = normalizeUpper(findLabelValue(lines, "DISTRITO"));
  const observacion = inferObservacion(lines, ticketNumero, ctoNap);
  const procedencia = cleanLine(findLabelValue(lines, "PROCEDENCIA"));
  const nodo = cleanLine(findLabelValue(lines, "NODO"));
  const proyecto = cleanLine(findLabelValue(lines, "PROYECTO"));
  const clientesAfectados = parseNumeric(findLabelValue(lines, "CLIENTES AFECTADOS"));

  const format =
    lines.some((line) => /^(TICKET\s*:|CTO\/NAP\s*:|COORDENADAS\s*:|PROCEDENCIA\s*:|DISTRITO\s*:|OBSERVACI[ÓO]N\s*:)/i.test(line))
      ? "LONG"
      : "SHORT";

  return {
    format,
    ticketNumero,
    codigoCaja: format === "SHORT" ? ctoNap : "",
    ctoNap,
    latitud: coords.latitud,
    longitud: coords.longitud,
    distrito,
    observacion,
    causaRaizCandidate: observacion,
    procedencia,
    nodo,
    proyecto,
    clientesAfectados,
    rawText: lines.join("\n"),
    warnings:
      coords.latitud === null || coords.longitud === null
        ? ["COORDENADAS_NO_DETECTADAS"]
        : [],
  };
}

export function parseTelegramMantenimientoMessage(rawInput: string): ParsedTelegramMantenimiento | null {
  return detectMessage(rawInput);
}
