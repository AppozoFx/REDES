export type TelegramParsedTemplate = {
  pedido: string;
  ctoNap?: string;
  puerto?: string;
  potenciaCtoNapDbm?: string;
  snOnt?: string;
  meshes: string[];
  boxes: string[];
  snFono?: string;
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
  const patterns = [
    /\bPedido\s*:\s*([0-9]+)\b/im,
    /\bCod(?:igo|\.)?\s*de\s*Pedido\s*:\s*([0-9]+)\b/im,
    /\bCod(?:igo|\.)?\s*Pedido\s*:\s*([0-9]+)\b/im,
  ];
  for (const pattern of patterns) {
    const raw = matchLine(text, pattern);
    if (!raw) continue;
    const compact = raw.replace(/\D/g, "");
    if (compact) return compact;
  }
  return undefined;
}

function pushUniqueSeries(target: string[], value: string): void {
  const normalized = normalizeSpaces(String(value || ""));
  if (!normalized) return;
  const key = normalized.toUpperCase();
  if (target.some((item) => item.toUpperCase() === key)) return;
  target.push(normalized);
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
  const snOnt =
    matchLine(normalized, /^.*\bSN\s*ONT\s*:\s*(.+)\s*$/im) ||
    matchLine(normalized, /^.*\bS\s*\/\s*N\s*ONT\s*:\s*(.+)\s*$/im) ||
    matchLine(normalized, /^.*\bID\s*ONT\s*:\s*(.+)\s*$/im);
  const snFono =
    matchLine(normalized, /^.*\bFONOWIN\b\s*,?\s*N[UÚ]MERO\s+DE\s+SERIE\s*:\s*(.+)\s*$/im) ||
    matchLine(normalized, /^.*\bSN\s*FONO\s*:\s*(.+)\s*$/im);

  const meshes: string[] = [];
  const meshRegex = /^.*\bMESH\s*\(\s*\d+\s*\)\s*:\s*(.+)\s*$/gim;
  for (const match of normalized.matchAll(meshRegex)) {
    pushUniqueSeries(meshes, String(match[1] || ""));
  }
  const meshAltRegexes = [
    /^.*\b(?:S\s*\/\s*N|SN)\s*MESH(?:\s*\d+)?\s*:\s*(.+)\s*$/gim,
    /^\s*MESH\s+\d+\s*:\s*(.+)\s*$/gim,
  ];
  for (const regex of meshAltRegexes) {
    for (const match of normalized.matchAll(regex)) {
      pushUniqueSeries(meshes, String(match[1] || ""));
    }
  }

  const boxes: string[] = [];
  const boxRegex = /^.*\b(?:WINBOX|SN\s*BOX|BOX)\s*\(\s*\d+\s*\)\s*:\s*(.+)\s*$/gim;
  for (const match of normalized.matchAll(boxRegex)) {
    pushUniqueSeries(boxes, String(match[1] || ""));
  }
  const boxAltRegex = /^.*\b(?:S\s*\/\s*N|SN)\s*BOX(?:\s*\d+)?\s*:\s*(.+)\s*$/gim;
  for (const match of normalized.matchAll(boxAltRegex)) {
    pushUniqueSeries(boxes, String(match[1] || ""));
  }

  return {
    pedido,
    ctoNap,
    puerto,
    potenciaCtoNapDbm,
    snOnt,
    meshes,
    boxes,
    snFono,
    rawText: normalized,
  };
}
