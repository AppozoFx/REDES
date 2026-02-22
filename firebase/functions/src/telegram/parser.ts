export type TelegramParsedTemplate = {
  pedido: string;
  ctoNap?: string;
  puerto?: string;
  potenciaCtoNapDbm?: string;
  snOnt?: string;
  meshes: string[];
  rawText: string;
};

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripTrailingSeparators(value: string): string {
  return value.replace(/\s*[-_]{3,}\s*$/g, "").trim();
}

function normalizeLines(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => normalizeSpaces(line))
    .join("\n")
    .trim();
}

function matchLine(text: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(text);
  if (!match || !match[1]) return undefined;
  return stripTrailingSeparators(normalizeSpaces(String(match[1])));
}

function parsePedido(text: string): string | undefined {
  const raw = matchLine(text, /\bPedido\s*:\s*([0-9]+)\b/im);
  if (!raw) return undefined;
  const compact = raw.replace(/\D/g, "");
  return compact || undefined;
}

export function parseTelegramTemplate(rawInput: string): TelegramParsedTemplate | null {
  const rawText = String(rawInput || "");
  const normalized = normalizeLines(rawText);
  if (!normalized) return null;

  const pedido = parsePedido(normalized);
  if (!pedido) return null;

  const ctoNap = matchLine(normalized, /^.*\bCTO\s*\/\s*NAP\s*:\s*(.+)\s*$/im);
  const puerto = matchLine(normalized, /^.*\bPuerto\s*:\s*(.+)\s*$/im);
  const potenciaCtoNapDbm = matchLine(
    normalized,
    /^.*\bPotencia\s*CTO\s*\/\s*NAP\s*\(\s*Dbm\s*\)\s*:\s*(.+)\s*$/im
  ) || matchLine(normalized, /^.*\bPotencia\s*CTO\s*\/\s*NAP\s*:\s*(.+)\s*$/im);
  const snOnt = matchLine(normalized, /^.*\bSN\s*ONT\s*:\s*(.+)\s*$/im);

  const meshes: string[] = [];
  const meshRegex = /^.*\bMESH\s*\(\s*\d+\s*\)\s*:\s*(.+)\s*$/gim;
  for (const match of normalized.matchAll(meshRegex)) {
    const value = normalizeSpaces(String(match[1] || ""));
    if (value) meshes.push(value);
  }

  return {
    pedido,
    ctoNap,
    puerto,
    potenciaCtoNapDbm,
    snOnt,
    meshes,
    rawText: normalized,
  };
}
