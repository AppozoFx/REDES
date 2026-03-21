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
    .trim();
}

function normalizeUpper(value: unknown): string {
  return cleanLine(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function parseCoords(raw: string): { latitud: number | null; longitud: number | null } {
  const clean = cleanLine(raw);
  const match = clean.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
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

function findLabelValue(lines: string[], label: string): string {
  const upperLabel = normalizeUpper(label);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const upper = normalizeUpper(line);
    if (upper === `${upperLabel}:`) {
      return cleanLine(lines[i + 1] || "");
    }
    if (upper.startsWith(`${upperLabel}:`)) {
      return cleanLine(line.slice(line.indexOf(":") + 1));
    }
  }
  return "";
}

function looksLikeTicket(value: string): boolean {
  const clean = cleanLine(value);
  return /^[A-Z0-9]+(?:-[A-Z0-9]+){2,}$/i.test(clean);
}

function detectShort(lines: string[]): ParsedTelegramMantenimiento | null {
  if (lines.length < 3) return null;
  const ticketNumero = cleanLine(lines[0]);
  if (!looksLikeTicket(ticketNumero)) return null;

  const coordsLine = lines.find((line) => /-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?/.test(line)) || "";
  const coords = parseCoords(coordsLine);
  const codigoCaja = cleanLine(lines[1] || "");
  const observacion = cleanLine(lines[2] || "");

  return {
    format: "SHORT",
    ticketNumero,
    codigoCaja,
    ctoNap: codigoCaja,
    latitud: coords.latitud,
    longitud: coords.longitud,
    distrito: "",
    observacion,
    causaRaizCandidate: observacion,
    procedencia: "",
    nodo: "",
    proyecto: "",
    clientesAfectados: null,
    rawText: lines.join("\n"),
    warnings: coords.latitud === null || coords.longitud === null ? ["COORDENADAS_NO_DETECTADAS"] : [],
  };
}

function detectLong(lines: string[]): ParsedTelegramMantenimiento | null {
  const ticketNumero = cleanLine(lines[0] || "");
  if (!looksLikeTicket(ticketNumero)) return null;
  const ctoNap = findLabelValue(lines, "CTO/NAP");
  const coordsRaw = findLabelValue(lines, "COORDENADAS");
  const coords = parseCoords(coordsRaw);
  const distrito = normalizeUpper(findLabelValue(lines, "DISTRITO"));
  const observacion = cleanLine(findLabelValue(lines, "OBSERVACION") || findLabelValue(lines, "OBSERVACIÓN"));
  const procedencia = cleanLine(findLabelValue(lines, "PROCEDENCIA"));
  const nodo = cleanLine(findLabelValue(lines, "NODO"));
  const proyecto = cleanLine(findLabelValue(lines, "PROYECTO"));
  const clientesAfectados = parseNumeric(findLabelValue(lines, "CLIENTES AFECTADOS"));

  if (!ctoNap && !coordsRaw && !distrito && !observacion) return null;

  return {
    format: "LONG",
    ticketNumero,
    codigoCaja: "",
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
    warnings: coordsRaw && (coords.latitud === null || coords.longitud === null) ? ["COORDENADAS_INVALIDAS"] : [],
  };
}

export function parseTelegramMantenimientoMessage(rawInput: string): ParsedTelegramMantenimiento | null {
  const normalized = normalizeText(rawInput);
  if (!normalized) return null;
  const lines = normalized
    .split("\n")
    .map((line) => cleanLine(line))
    .filter(Boolean);
  if (!lines.length) return null;

  return detectLong(lines) || detectShort(lines);
}
