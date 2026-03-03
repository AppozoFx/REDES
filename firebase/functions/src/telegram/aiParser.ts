import type { TelegramParsedTemplate } from "./parser";

function cleanValue(value: unknown): string {
  return String(value || "").trim();
}

function cleanSeries(values: unknown, maxItems = 4): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const v = cleanValue(raw);
    if (!v) continue;
    const key = v.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= maxItems) break;
  }
  return out;
}

function extractJson(text: string): unknown | null {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {}

  const md = raw.match(/```json\s*([\s\S]*?)\s*```/i) || raw.match(/```\s*([\s\S]*?)\s*```/i);
  if (md?.[1]) {
    try {
      return JSON.parse(md[1].trim());
    } catch {}
  }

  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(raw.slice(first, last + 1));
    } catch {}
  }
  return null;
}

function normalizeParsed(raw: any, inputText: string): TelegramParsedTemplate | null {
  const pedido = cleanValue(raw?.pedido || "").replace(/\D/g, "");
  if (!pedido) return null;
  return {
    pedido,
    ctoNap: cleanValue(raw?.ctoNap || "") || undefined,
    puerto: cleanValue(raw?.puerto || "") || undefined,
    potenciaCtoNapDbm: cleanValue(raw?.potenciaCtoNapDbm || "") || undefined,
    snOnt: cleanValue(raw?.snOnt || "") || undefined,
    meshes: cleanSeries(raw?.meshes, 4),
    boxes: cleanSeries(raw?.boxes, 4),
    snFono: cleanValue(raw?.snFono || "") || undefined,
    rawText: String(inputText || "").trim(),
  };
}

export async function parseTelegramTemplateWithAI(params: {
  apiKey: string;
  text: string;
  model?: string;
}): Promise<TelegramParsedTemplate | null> {
  const apiKey = String(params.apiKey || "").trim();
  const text = String(params.text || "").trim();
  if (!apiKey || !text) return null;

  const model = String(params.model || "gpt-4.1-mini").trim() || "gpt-4.1-mini";
  const prompt = [
    "Extrae campos de plantilla de liquidacion tecnica.",
    "Devuelve SOLO JSON valido con estas keys:",
    '{"pedido":"","ctoNap":"","puerto":"","potenciaCtoNapDbm":"","snOnt":"","meshes":[],"boxes":[],"snFono":""}',
    "Reglas:",
    "1) pedido solo digitos.",
    "2) si no encuentras un campo, deja string vacio o arreglo vacio.",
    "3) sin texto adicional, sin markdown.",
    `TEXTO=${text}`,
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: prompt,
      text: {
        format: {
          type: "json_object",
        },
      },
    }),
  });

  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as any;
  const outText = String(body?.output_text || "").trim();
  const json = extractJson(outText);
  if (!json) return null;
  return normalizeParsed(json, text);
}

