import type { TelegramParsedTemplate } from "./parser";

function cleanValue(value: unknown): string {
  return String(value || "").trim();
}

function isInvalidSerialValue(v: string): boolean {
  const u = v.toUpperCase().trim();
  return (
    !u ||
    u === "NO" ||
    u === "N/A" ||
    u === "NA" ||
    u === "-" ||
    u === "NO TIENE" ||
    u === "NO PRESENTA" ||
    u === "SIN SERIE" ||
    u === "S/N" ||
    u === "NINGUNO"
  );
}

function cleanSeries(values: unknown, maxItems = 4): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const v = cleanValue(raw);
    if (!v || isInvalidSerialValue(v)) continue;
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
  const normalizeScalar = (v: unknown) => {
    const s = cleanValue(v || "");
    return s && !isInvalidSerialValue(s) ? s : undefined;
  };
  return {
    pedido,
    ctoNap: normalizeScalar(raw?.ctoNap),
    puerto: normalizeScalar(raw?.puerto),
    potenciaCtoNapDbm: normalizeScalar(raw?.potenciaCtoNapDbm),
    snOnt: normalizeScalar(raw?.snOnt),
    receptorDocumento: normalizeScalar(raw?.receptorDocumento),
    receptorNombres: normalizeScalar(raw?.receptorNombres),
    receptorTelefono: normalizeScalar(raw?.receptorTelefono),
    meshes: cleanSeries(raw?.meshes, 4),
    boxes: cleanSeries(raw?.boxes, 4),
    snFono: normalizeScalar(raw?.snFono),
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
    "Eres un extractor de datos para plantillas de liquidacion tecnica de instalaciones de fibra optica.",
    "Extrae los campos del texto y devuelve SOLO JSON valido con exactamente estas keys:",
    '{"pedido":"","ctoNap":"","puerto":"","potenciaCtoNapDbm":"","snOnt":"","receptorDocumento":"","receptorNombres":"","receptorTelefono":"","meshes":[],"boxes":[],"snFono":""}',
    "",
    "Reglas:",
    "1) pedido: solo digitos, busca 'Pedido', 'Cod. de Pedido', 'N° Pedido', 'Num. Pedido', 'Pedido N°'.",
    "2) snOnt: numero de serie de la ONT. Busca 'SN ONT', 'S/N ONT', 'ID ONT', 'MAC ONT', 'Serie ONT'.",
    "3) meshes y boxes: arrays de numeros de serie. Busca 'MESH (N)', 'SN MESH', 'WINBOX', 'SN BOX'.",
    "4) ctoNap: identificador de caja NAP o CTO. Busca 'CTO/NAP', 'CTO', 'NAP'.",
    "5) receptorDocumento: DNI u otro documento del receptor. Busca 'DNI', 'DOCUMENTO DE CONTACTO RECEPTOR', 'Documento del receptor'.",
    "6) receptorNombres: nombre completo del receptor. Busca 'NOMBRES DE CONTACTO RECEPTOR', 'Nombres del receptor', 'Cliente receptor'.",
    "7) receptorTelefono: telefono del receptor. Busca 'TELEFONO DE CONTACTO RECEPTOR', 'Tel.', 'Cel.'.",
    "8) snFono: numero de serie del telefono. Busca 'FONOWIN', 'SN FONO', 'Fono Win'.",
    "9) Si un campo no existe o tiene valor 'NO', 'N/A', 'NO TIENE', 'NO PRESENTA', deja string vacio o arreglo vacio.",
    "10) Sin texto adicional, sin markdown, sin explicaciones.",
    "",
    `TEXTO:\n${text}`,
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
