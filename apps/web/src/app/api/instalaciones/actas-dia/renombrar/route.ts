import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { requireAreaScope } from "@/core/auth/apiGuards";
import { adminDb, adminStorageBucket } from "@/lib/firebase/admin";
import { openai } from "@/lib/ai/openai";
import { createHash } from "crypto";

export const runtime = "nodejs";

const ROOT_PREFIX = "guias_actas/actas_servicio";
const ALLOWED_FOLDERS = new Set(["inbox", "ok", "error"]);
const LOGS_COL = "actas_renombrado_logs";
const INDEX_COL = "actas_renombrado_index";
const MAX_FILES_PER_REQUEST = 300;
const MAX_PDF_BYTES = 20 * 1024 * 1024;

function normalizeDateFolder(raw: string) {
  const v = String(raw || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
}

function sanitizeFileName(v: string) {
  return String(v || "")
    .replace(/[\/\\:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeNameStrict(v: string) {
  return sanitizeFileName(v).replace(/[^a-zA-Z0-9._ -]/g, "_");
}

function ensurePdfName(v: string) {
  const base = safeNameStrict(v);
  if (!base) return "archivo.pdf";
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

function stripPdf(v: string) {
  return String(v || "").replace(/\.pdf$/i, "");
}

function normalizeActa(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

function normalizeActaStrict(raw: string) {
  const acta = normalizeActa(raw);
  const digits = acta.replace(/\D/g, "");
  if (digits.length < 7) return "";
  if (/^0+$/.test(digits)) return "";
  if (digits.startsWith("000")) return "";
  if (/^0+$/.test(digits.slice(3))) return "";
  return acta;
}

function extractActaByRegex(text: string) {
  const clean = String(text || "");
  const contextual = clean.match(
    /\b(?:acta|codigo(?:\s+de)?\s+acta|cod(?:\.|igo)?)\b[\s:#-]*([0-9]{3}[-\s]?[0-9]{4,})/i
  );
  if (contextual?.[1]) {
    const acta = normalizeActaStrict(contextual[1]);
    if (acta) return acta;
  }
  const hyphen = clean.match(/\b([0-9]{3}-[0-9]{4,})\b/);
  if (hyphen?.[1]) {
    const acta = normalizeActaStrict(hyphen[1]);
    if (acta) return acta;
  }
  return "";
}

function extractActaByLooseDigits(text: string) {
  const clean = String(text || "");
  const contextualRegex = /\b(?:acta|codigo(?:\s+de)?\s+acta|cod(?:\.|igo)?)\b[\s:#-]*([0-9][0-9\-\s]{6,18})/gi;
  for (const m of clean.matchAll(contextualRegex)) {
    const acta = normalizeActaStrict(m[1] || "");
    if (acta) return acta;
  }

  const typicalRegex = /(?:^|[^0-9])(0[0-9]{2}[-\s]?[0-9]{6,10})(?=[^0-9]|$)/g;
  for (const m of clean.matchAll(typicalRegex)) {
    const acta = normalizeActaStrict(m[1] || "");
    if (acta) return acta;
  }
  return "";
}

function decodePdfLiteralToken(raw: string) {
  if (!raw) return "";
  let out = "";
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const nxt = raw[i + 1];
    if (!nxt) break;
    if (/[0-7]/.test(nxt)) {
      let oct = nxt;
      let j = i + 2;
      while (j < raw.length && oct.length < 3 && /[0-7]/.test(raw[j])) {
        oct += raw[j];
        j += 1;
      }
      out += String.fromCharCode(parseInt(oct, 8));
      i = j - 1;
      continue;
    }
    const map: Record<string, string> = {
      n: "\n",
      r: "\r",
      t: "\t",
      b: "\b",
      f: "\f",
      "(": "(",
      ")": ")",
      "\\": "\\",
    };
    out += map[nxt] ?? nxt;
    i += 1;
  }
  return out;
}

function extractActaFromPdfStreams(pdfBuffer: Buffer) {
  const latin = pdfBuffer.toString("latin1");

  const direct = extractActaByRegex(latin) || extractActaByLooseDigits(latin);
  if (direct) return direct;

  const literalRegex = /\(([^()\\]*(?:\\.[^()\\]*)*)\)/g;
  for (const m of latin.matchAll(literalRegex)) {
    const decoded = decodePdfLiteralToken(m[1] || "");
    const acta = extractActaByRegex(decoded) || extractActaByLooseDigits(decoded);
    if (acta) return acta;
  }

  const hexRegex = /<([0-9A-Fa-f]{8,})>/g;
  for (const m of latin.matchAll(hexRegex)) {
    const hex = String(m[1] || "").replace(/\s+/g, "");
    if (!hex || hex.length % 2 !== 0) continue;
    try {
      const decoded = Buffer.from(hex, "hex").toString("latin1");
      const acta = extractActaByRegex(decoded) || extractActaByLooseDigits(decoded);
      if (acta) return acta;
    } catch {
      // no-op
    }
  }

  return "";
}

function extractJsonPayload(rawText: string): unknown | null {
  const text = String(rawText || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {}
  const md = text.match(/```json\s*([\s\S]*?)\s*```/i) || text.match(/```\s*([\s\S]*?)\s*```/i);
  if (md?.[1]) {
    try {
      return JSON.parse(md[1].trim());
    } catch {}
  }
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(text.slice(first, last + 1));
    } catch {}
  }
  return null;
}

type ActaDetection = {
  acta: string | null;
  source: "pdf_text" | "ai_pdf" | null;
  detail: string;
  attempts?: number;
};

async function decodeBarcodeWithZxing(imageBuffer: Buffer): Promise<string> {
  try {
    const req = eval("require") as NodeRequire;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sharp = req("sharp") as any;
    const zxing = req("@zxing/library") as any;
    const {
      MultiFormatReader,
      BinaryBitmap,
      HybridBinarizer,
      RGBLuminanceSource,
      DecodeHintType,
      BarcodeFormat,
    } = zxing;

    const rendered = await sharp(imageBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const width = Number(rendered.info?.width || 0);
    const height = Number(rendered.info?.height || 0);
    if (!width || !height) return "";

    const data = new Uint8ClampedArray(rendered.data);
    const luminance = new RGBLuminanceSource(data, width, height);
    const bitmap = new BinaryBitmap(new HybridBinarizer(luminance));
    const hints = new Map();
    hints.set(DecodeHintType.TRY_HARDER, true);
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.CODABAR,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.ITF,
    ]);

    const reader = new MultiFormatReader();
    reader.setHints(hints);
    const result = reader.decode(bitmap);
    const text = String(result?.getText?.() || "").trim();
    return normalizeActaStrict(text);
  } catch {
    return "";
  }
}

async function extractActaFromPdfByBarcodeDecoder(pdfBuffer: Buffer): Promise<ActaDetection> {
  try {
    const req = eval("require") as NodeRequire;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sharp = req("sharp") as any;
    // Si no esta instalado, no rompe: sigue con siguientes capas.
    req("@zxing/library");

    const base = sharp(pdfBuffer, { density: 280, page: 0, failOn: "none" }).flatten({ background: "#ffffff" });
    const meta = await base.metadata();
    const width = Number(meta.width || 0);
    const height = Number(meta.height || 0);
    if (!width || !height) {
      return { acta: null, source: null, detail: "ZXING_NO_RASTER", attempts: 1 };
    }

    const rois = [
      {
        label: "roi_top_right_strict",
        left: Math.max(0, Math.floor(width * 0.54)),
        top: 0,
        width: Math.max(1, Math.floor(width * 0.46)),
        height: Math.max(1, Math.floor(height * 0.34)),
      },
      {
        label: "roi_top_right_margin",
        left: Math.max(0, Math.floor(width * 0.44)),
        top: 0,
        width: Math.max(1, Math.floor(width * 0.56)),
        height: Math.max(1, Math.floor(height * 0.50)),
      },
      {
        label: "roi_top_wide",
        left: Math.max(0, Math.floor(width * 0.30)),
        top: 0,
        width: Math.max(1, Math.floor(width * 0.70)),
        height: Math.max(1, Math.floor(height * 0.55)),
      },
    ];

    const variants: Array<{ label: string; img: Buffer }> = [];
    for (const r of rois) {
      const roiBase = base.clone().extract(r);
      variants.push({
        label: `${r.label}_normal`,
        img: await roiBase
          .clone()
          .resize({ width: Math.min(2600, r.width + 500), withoutEnlargement: false })
          .png()
          .toBuffer(),
      });
      variants.push({
        label: `${r.label}_enhanced`,
        img: await roiBase
          .clone()
          .grayscale()
          .normalize()
          .linear(1.25, -12)
          .threshold(165)
          .resize({ width: Math.min(2800, r.width + 700), withoutEnlargement: false })
          .png()
          .toBuffer(),
      });
    }
    variants.push({
      label: "full_page_enhanced",
      img: await base
        .clone()
        .grayscale()
        .normalize()
        .linear(1.15, -8)
        .resize({ width: 2200, withoutEnlargement: false })
        .png()
        .toBuffer(),
    });

    for (const v of variants) {
      const acta = await decodeBarcodeWithZxing(v.img);
      if (acta) {
        return {
          acta,
          source: "pdf_text",
          detail: `Detectada por ZXING (${v.label})`,
          attempts: variants.length,
        };
      }
    }

    return {
      acta: null,
      source: null,
      detail: "ZXING_NO_MATCH",
      attempts: variants.length,
    };
  } catch {
    return {
      acta: null,
      source: null,
      detail: "ZXING_NOT_AVAILABLE",
      attempts: 1,
    };
  }
}

async function extractActaFromImageByAi(imagePng: Buffer, modeLabel: string): Promise<ActaDetection> {
  const model = process.env.OPENAI_PRELIQ_MODEL || process.env.PREDESPACHO_AI_MODEL || "gpt-4.1-mini";
  const imageDataUrl = `data:image/png;base64,${imagePng.toString("base64")}`;
  const response = await openai.responses.create({
    model,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              "Lee SOLO el codigo de acta del barcode o del texto visible en esta imagen de acta. " +
              "Devuelve JSON valido: {\"acta\":\"...\"} o {\"acta\":null}. " +
              "Acepta formatos 0050068681 o 005-0068681. Descarta codigos todo-cero.",
          },
          {
            type: "input_image",
            image_url: imageDataUrl,
            detail: "high",
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "acta_extract_image",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            acta: {
              anyOf: [{ type: "string" }, { type: "null" }],
            },
          },
          required: ["acta"],
        },
        strict: true,
      },
    } as any,
  });
  const raw = String(response.output_text || "").trim();
  const json = extractJsonPayload(raw) as any;
  const acta = normalizeActaStrict(String(json?.acta || ""));
  if (acta) {
    return {
      acta,
      source: "ai_pdf",
      detail: `Detectada por IA sobre imagen (${modeLabel})`,
      attempts: 1,
    };
  }
  return {
    acta: null,
    source: null,
    detail: `IA imagen sin codigo valido (${modeLabel})`,
    attempts: 1,
  };
}

async function extractActaFromPdfByAiImagePasses(fileName: string, pdfBuffer: Buffer): Promise<ActaDetection> {
  try {
    // sharp ya esta presente en el lockfile del workspace.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sharp = require("sharp") as any;
    const base = sharp(pdfBuffer, { density: 260, page: 0, failOn: "none" }).flatten({ background: "#ffffff" });
    const meta = await base.metadata();
    const width = Number(meta.width || 0);
    const height = Number(meta.height || 0);
    if (!width || !height) {
      return { acta: null, source: null, detail: `No se pudo rasterizar PDF (${fileName})`, attempts: 1 };
    }

    const roiA = {
      left: Math.max(0, Math.floor(width * 0.50)),
      top: 0,
      width: Math.max(1, Math.floor(width * 0.50)),
      height: Math.max(1, Math.floor(height * 0.42)),
    };
    const roiB = {
      left: Math.max(0, Math.floor(width * 0.44)),
      top: 0,
      width: Math.max(1, Math.floor(width * 0.56)),
      height: Math.max(1, Math.floor(height * 0.50)),
    };

    const roiNormal = await base
      .clone()
      .extract(roiA)
      .resize({ width: Math.min(2200, roiA.width), withoutEnlargement: false })
      .png()
      .toBuffer();
    const roiEnhanced = await base
      .clone()
      .extract(roiB)
      .grayscale()
      .normalize()
      .linear(1.2, -10)
      .threshold(170)
      .resize({ width: Math.min(2400, roiB.width + 300), withoutEnlargement: false })
      .png()
      .toBuffer();
    const pageEnhanced = await base
      .clone()
      .grayscale()
      .normalize()
      .linear(1.15, -8)
      .resize({ width: 1800, withoutEnlargement: false })
      .png()
      .toBuffer();

    const passes: Array<{ label: string; img: Buffer }> = [
      { label: "roi_top_right", img: roiNormal },
      { label: "roi_top_right_enhanced", img: roiEnhanced },
      { label: "full_page_enhanced", img: pageEnhanced },
    ];
    const details: string[] = [];

    for (const pass of passes) {
      const res = await extractActaFromImageByAi(pass.img, pass.label);
      if (res.acta) return { ...res, attempts: 1 };
      details.push(res.detail);
    }

    return {
      acta: null,
      source: null,
      detail: details.join("; "),
      attempts: passes.length,
    };
  } catch (e: any) {
    return {
      acta: null,
      source: null,
      detail: `Fallo lectura por imagen: ${String(e?.message || "IMAGE_PASS_ERROR")}`,
      attempts: 1,
    };
  }
}

async function extractActaFromPdf(fileName: string, pdfBuffer: Buffer): Promise<ActaDetection> {
  // 1) Heuristica local por texto embebido en PDF (cuando existe).
  const candidates = [
    pdfBuffer.toString("utf8"),
    pdfBuffer.toString("latin1"),
  ];
  for (const text of candidates) {
    const acta = extractActaByRegex(text) || extractActaByLooseDigits(text);
    if (acta) {
      return {
        acta,
        source: "pdf_text",
        detail: "Detectada por texto embebido en PDF (regex deterministico)",
        attempts: 1,
      };
    }
  }

  // 2) Parser deterministico de streams PDF (literales/hex) antes de IA.
  const streamActa = extractActaFromPdfStreams(pdfBuffer);
  if (streamActa) {
    return {
      acta: streamActa,
      source: "pdf_text",
      detail: "Detectada por parser deterministico de stream PDF",
      attempts: 1,
    };
  }

  // 3) Decoder real de barcode (ZXING) sobre ROI + variantes.
  const zxing = await extractActaFromPdfByBarcodeDecoder(pdfBuffer);
  if (zxing.acta) return zxing;

  // 4) IA sobre imagen (ROI sup-der con margen + preprocesado + pagina completa).
  const aiImage = await extractActaFromPdfByAiImagePasses(fileName, pdfBuffer);
  if (aiImage.acta) return aiImage;

  // 5) Fallback IA directo sobre PDF.
  try {
    const ai = await extractActaFromPdfByAi(fileName, pdfBuffer, "roi");
    if (ai.acta) return ai;
    const aiRetry = await extractActaFromPdfByAi(fileName, pdfBuffer, "full");
    if (aiRetry.acta) return { ...aiRetry, attempts: 2 };
    return {
      acta: null,
      source: null,
      detail: `${zxing.detail}; ${aiImage.detail}; ${ai.detail}; ${aiRetry.detail}`,
      attempts: 2,
    };
  } catch (e: any) {
    return {
      acta: null,
      source: null,
      detail: `${zxing.detail}; ${aiImage.detail}; Error IA PDF: ${String(e?.message || "UNKNOWN_AI_ERROR")}`,
      attempts: 2,
    };
  }

  return {
    acta: null,
    source: null,
    detail: "No se detecto acta por heuristica deterministica ni por IA",
  };
}

async function extractActaFromPdfByAi(fileName: string, pdfBuffer: Buffer, mode: "roi" | "full"): Promise<ActaDetection> {
  const file = new File([new Uint8Array(pdfBuffer)], String(fileName || "acta.pdf"), { type: "application/pdf" });
  const uploaded = await openai.files.create({
    file,
    purpose: "user_data",
  });
  try {
    const model = process.env.OPENAI_PRELIQ_MODEL || process.env.PREDESPACHO_AI_MODEL || "gpt-4.1-mini";
    const response = await openai.responses.create({
      model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Extrae SOLO el codigo de acta desde el PDF (barcode o texto visible). " +
                (mode === "roi"
                  ? "El barcode esta en la zona superior derecha: considera un recuadro con margen amplio " +
                    "(aprox 40% del ancho x 35% del alto desde la esquina superior derecha). "
                  : "Escanea toda la pagina completa (todas las paginas) y no solo una region. ") +
                "Responde JSON valido con: {\"acta\":\"...\"} o {\"acta\":null}. " +
                "Si encuentras 0050068681 puedes devolver 005-0068681 o 0050068681. " +
                "Descarta codigos todo-cero como 0000000000.",
            },
            {
              type: "input_file",
              file_id: uploaded.id,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "acta_extract",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              acta: {
                anyOf: [{ type: "string" }, { type: "null" }],
              },
            },
            required: ["acta"],
          },
          strict: true,
        },
      } as any,
    });

    const raw = String(response.output_text || "").trim();
    const json = extractJsonPayload(raw) as any;
    const acta = normalizeActaStrict(String(json?.acta || ""));
    if (acta) {
      return {
        acta,
        source: "ai_pdf",
        detail: `Detectada por IA (${mode === "roi" ? "ROI sup-der" : "pagina completa"})`,
        attempts: mode === "roi" ? 1 : 2,
      };
    }
    return {
      acta: null,
      source: null,
      detail: `IA no encontro un codigo de acta valido (${mode})`,
      attempts: mode === "roi" ? 1 : 2,
    };
  } finally {
    await openai.files.delete(uploaded.id).catch(() => null);
  }
}

function hashBuffer(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function loadCachedResult(dateFolder: string, fileHash: string) {
  const db = adminDb();
  const cacheId = `${dateFolder}_${fileHash}`;
  const snap = await db.collection(INDEX_COL).doc(cacheId).get();
  if (!snap.exists) return null;
  const data = snap.data() as any;
  if (!data?.finalPath) return null;
  try {
    const bucket = adminStorageBucket();
    const [exists] = await bucket.file(String(data.finalPath)).exists();
    if (!exists) return null;
  } catch {
    return null;
  }
  return {
    acta: data.acta ?? null,
    source: data.source ?? null,
    status: data.status === "ok" ? "ok" : "error",
    finalPath: String(data.finalPath || ""),
    finalName: splitPath(String(data.finalPath || "")).fileName,
    reason: String(data.reason || "IDEMPOTENTE_CACHE"),
    detail: "Resultado recuperado por hash (idempotencia)",
  } as const;
}

async function saveResultIndex(dateFolder: string, fileHash: string, result: any) {
  const db = adminDb();
  const cacheId = `${dateFolder}_${fileHash}`;
  await db.collection(INDEX_COL).doc(cacheId).set(
    {
      dateFolder,
      fileHash,
      status: result.status,
      source: result.source || null,
      acta: result.acta || null,
      finalPath: result.finalPath || "",
      reason: result.reason || "",
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

async function writeProcessLog(payload: Record<string, any>) {
  try {
    await adminDb().collection(LOGS_COL).add({
      ...payload,
      ts: new Date().toISOString(),
    });
  } catch {
    // no-op
  }
}

function splitPath(path: string) {
  const parts = String(path || "").split("/").filter(Boolean);
  return {
    rootA: parts[0] || "",
    rootB: parts[1] || "",
    folder: parts[2] || "",
    dateFolder: parts[3] || "",
    fileName: parts.slice(4).join("/"),
  };
}

function isAllowedPath(path: string) {
  const p = splitPath(path);
  return p.rootA === "guias_actas" && p.rootB === "actas_servicio" && ALLOWED_FOLDERS.has(p.folder);
}

function mapStorageFile(f: any) {
  const name = String(f.name || "");
  return {
    name: name.split("/").pop() || name,
    fullPath: name,
    size: Number(f.metadata?.size || 0),
    updatedAt: String(f.metadata?.updated || ""),
  };
}

async function ensureUniqueDestinationPath(bucket: any, dir: string, desiredName: string) {
  const input = ensurePdfName(desiredName);
  const base = stripPdf(input);
  let candidate = `${dir}/${input}`;
  let idx = 1;
  while (true) {
    const [exists] = await bucket.file(candidate).exists();
    if (!exists) return candidate;
    candidate = `${dir}/${base} (${idx}).pdf`;
    idx += 1;
  }
}

async function resolveClienteFromActa(acta: string) {
  const db = adminDb();
  const actaRef = db.collection("actas").doc(acta);
  const actaSnap = await actaRef.get();
  const actaData = actaSnap.exists ? (actaSnap.data() as any) : null;
  let codigoCliente = String(actaData?.codigoCliente || actaData?.codigo || "").trim();
  let cliente = String(actaData?.cliente || "").trim();

  if (codigoCliente && cliente) return { codigoCliente, cliente };

  const [byActaSnap, byMatActaSnap] = await Promise.all([
    db.collection("instalaciones").where("ACTA", "==", acta).limit(1).get(),
    db.collection("instalaciones").where("materialesLiquidacion.acta", "==", acta).limit(1).get(),
  ]);

  const docs = [...byActaSnap.docs, ...byMatActaSnap.docs];
  if (docs.length) {
    const row = docs[0].data() as any;
    codigoCliente = codigoCliente || String(row?.codigoCliente || row?.codigo || docs[0].id || "").trim();
    cliente = cliente || String(row?.cliente || row?.nombreCliente || "").trim();
  }

  if (!codigoCliente || !cliente) return null;
  return { codigoCliente, cliente };
}

async function moveToFolder(bucket: any, srcPath: string, folder: "ok" | "error", dateFolder: string, desiredName: string) {
  const dir = `${ROOT_PREFIX}/${folder}/${dateFolder}`;
  const dstPath = await ensureUniqueDestinationPath(bucket, dir, desiredName);
  await bucket.file(srcPath).move(dstPath);
  return dstPath;
}

async function autoClassifyUploaded(
  bucket: any,
  srcPath: string,
  fileName: string,
  dateFolder: string,
  pdfBuffer: Buffer
) {
  const detected = await extractActaFromPdf(fileName, pdfBuffer);
  const acta = detected.acta || "";
  if (!acta) {
    const dstPath = await moveToFolder(bucket, srcPath, "error", dateFolder, fileName);
    return {
      acta: null,
      source: detected.source,
      status: "error" as const,
      finalPath: dstPath,
      finalName: splitPath(dstPath).fileName,
      reason: "ACTA_NO_DETECTADA_EN_PDF",
      detail: detected.detail,
    };
  }

  const found = await resolveClienteFromActa(acta);
  if (!found) {
    if (detected.source === "pdf_text") {
      const aiRetry = await extractActaFromPdfByAi(fileName, pdfBuffer, "full").catch(() => null);
      const aiActa = aiRetry?.acta || "";
      if (aiActa && aiActa !== acta) {
        const foundByAi = await resolveClienteFromActa(aiActa);
        if (foundByAi) {
          const targetNameAi = `${safeNameStrict(foundByAi.codigoCliente)} - ${safeNameStrict(foundByAi.cliente)}.pdf`;
          const dstPathAi = await moveToFolder(bucket, srcPath, "ok", dateFolder, targetNameAi);
          return {
            acta: aiActa,
            source: "ai_pdf" as const,
            status: "ok" as const,
            finalPath: dstPathAi,
            finalName: splitPath(dstPathAi).fileName,
            reason: "RENOMBRADO_OK",
            detail: `Renombrado por reintento IA a ${targetNameAi}`,
          };
        }
      }
    }

    const dstPath = await moveToFolder(bucket, srcPath, "error", dateFolder, fileName);
    return {
      acta,
      source: detected.source,
      status: "error" as const,
      finalPath: dstPath,
      finalName: splitPath(dstPath).fileName,
      reason: "SIN_CLIENTE_ASOCIADO",
      detail: `Acta detectada (${acta}) pero sin cliente/codigo en Firestore`,
    };
  }

  const targetName = `${safeNameStrict(found.codigoCliente)} - ${safeNameStrict(found.cliente)}.pdf`;
  const dstPath = await moveToFolder(bucket, srcPath, "ok", dateFolder, targetName);
  return {
    acta,
    source: detected.source,
    status: "ok" as const,
    finalPath: dstPath,
    finalName: splitPath(dstPath).fileName,
    reason: "RENOMBRADO_OK",
    detail: `Renombrado a ${targetName}`,
  };
}

async function listByPrefix(bucket: any, prefix: string) {
  const [files] = await bucket.getFiles({ prefix });
  return files
    .filter((f: any) => String(f.name || "").toLowerCase().endsWith(".pdf"))
    .map(mapStorageFile)
    .sort((a: any, b: any) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
}

function requireSessionAndScopeErrorMessage(msg: string) {
  if (msg === "UNAUTHENTICATED") return { status: 401, error: "UNAUTHENTICATED" };
  if (msg === "ACCESS_DISABLED") return { status: 403, error: "ACCESS_DISABLED" };
  if (msg === "AREA_FORBIDDEN" || msg === "FORBIDDEN") return { status: 403, error: "FORBIDDEN" };
  return null;
}

async function resolveSession() {
  const session = await getServerSession({ forceAccessRefresh: true });
  if (!session) throw new Error("UNAUTHENTICATED");
  requireAreaScope(session, ["INSTALACIONES"]);
  return session;
}

export async function GET(req: Request) {
  try {
    await resolveSession();
    const { searchParams } = new URL(req.url);
    const dateFolder = normalizeDateFolder(String(searchParams.get("dateFolder") || ""));
    if (!dateFolder) {
      return NextResponse.json({ ok: false, error: "DATE_REQUIRED_YYYY_MM_DD" }, { status: 400 });
    }

    const bucket = adminStorageBucket();
    const [inbox, okFiles, errorFiles] = await Promise.all([
      listByPrefix(bucket, `${ROOT_PREFIX}/inbox/${dateFolder}/`),
      listByPrefix(bucket, `${ROOT_PREFIX}/ok/${dateFolder}/`),
      listByPrefix(bucket, `${ROOT_PREFIX}/error/${dateFolder}/`),
    ]);

    return NextResponse.json({
      ok: true,
      dateFolder,
      inbox,
      okFiles,
      errorFiles,
    });
  } catch (e: any) {
    const mapped = requireSessionAndScopeErrorMessage(String(e?.message || ""));
    if (mapped) return NextResponse.json({ ok: false, error: mapped.error }, { status: mapped.status });
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await resolveSession();
    const ct = String(req.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("multipart/form-data")) {
      return NextResponse.json({ ok: false, error: "CONTENT_TYPE_MULTIPART_REQUIRED" }, { status: 400 });
    }

    const form = await req.formData();
    const dateFolder = normalizeDateFolder(String(form.get("dateFolder") || ""));
    if (!dateFolder) {
      return NextResponse.json({ ok: false, error: "DATE_REQUIRED_YYYY_MM_DD" }, { status: 400 });
    }
    const rawFiles = form.getAll("files").filter((x) => x instanceof File) as File[];
    if (!rawFiles.length) {
      return NextResponse.json({ ok: false, error: "FILES_REQUIRED" }, { status: 400 });
    }
    if (rawFiles.length > MAX_FILES_PER_REQUEST) {
      return NextResponse.json(
        { ok: false, error: `MAX_${MAX_FILES_PER_REQUEST}_FILES_PER_REQUEST` },
        { status: 400 }
      );
    }

    const bucket = adminStorageBucket();
    const uploaded: Array<{
      originalName: string;
      acta: string | null;
      source: "pdf_text" | "ai_pdf" | null;
      status: "ok" | "error";
      finalPath: string;
      finalName: string;
      reason: string;
      detail: string;
    }> = [];

    for (const file of rawFiles) {
      const fileStartedAt = Date.now();
      const originalName = String(file.name || "archivo.pdf");
      const isPdf = originalName.toLowerCase().endsWith(".pdf") || String(file.type || "").toLowerCase().includes("pdf");
      if (!isPdf) {
        uploaded.push({
          originalName,
          acta: null,
          source: null,
          status: "error",
          finalPath: "",
          finalName: "",
          reason: "NO_PDF",
          detail: "El archivo no es PDF",
        });
        continue;
      }
      const fileBytes = Number(file.size || 0);
      if (!fileBytes || fileBytes > MAX_PDF_BYTES) {
        uploaded.push({
          originalName,
          acta: null,
          source: null,
          status: "error",
          finalPath: "",
          finalName: "",
          reason: "PDF_SIZE_INVALID",
          detail: `El PDF debe tener tamaño entre 1 byte y ${Math.floor(MAX_PDF_BYTES / (1024 * 1024))} MB`,
        });
        continue;
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const fileHash = hashBuffer(buffer);
      const cached = await loadCachedResult(dateFolder, fileHash);
      if (cached) {
        const cachedRow = {
          originalName,
          ...cached,
        };
        uploaded.push(cachedRow);
        await writeProcessLog({
          dateFolder,
          fileName: originalName,
          fileHash,
          status: cachedRow.status,
          source: cachedRow.source,
          reason: "IDEMPOTENTE_CACHE",
          detail: cachedRow.detail,
          durationMs: Date.now() - fileStartedAt,
          fromCache: true,
        });
        continue;
      }

      const safeOriginal = ensurePdfName(originalName);
      const inboxDir = `${ROOT_PREFIX}/inbox/${dateFolder}`;
      const inboxPath = await ensureUniqueDestinationPath(bucket, inboxDir, safeOriginal);

      await bucket.file(inboxPath).save(buffer, {
        contentType: "application/pdf",
        metadata: {
          metadata: {
            uploadedBy: session.uid,
            uploadedAt: new Date().toISOString(),
            originalName: originalName,
          },
        },
      });

      const processed = await autoClassifyUploaded(bucket, inboxPath, safeOriginal, dateFolder, buffer);
      const row = {
        originalName,
        ...processed,
      };
      uploaded.push(row);
      await saveResultIndex(dateFolder, fileHash, row);
      await writeProcessLog({
        dateFolder,
        fileName: originalName,
        fileHash,
        status: row.status,
        source: row.source,
        reason: row.reason,
        detail: row.detail,
        finalPath: row.finalPath,
        durationMs: Date.now() - fileStartedAt,
        fromCache: false,
      });
    }

    const summary = uploaded.reduce(
      (acc, item) => {
        acc.total += 1;
        if (item.status === "ok") acc.ok += 1;
        else acc.error += 1;
        return acc;
      },
      { total: 0, ok: 0, error: 0 }
    );

    return NextResponse.json({
      ok: true,
      dateFolder,
      uploaded,
      summary,
    });
  } catch (e: any) {
    const mapped = requireSessionAndScopeErrorMessage(String(e?.message || ""));
    if (mapped) return NextResponse.json({ ok: false, error: mapped.error }, { status: mapped.status });
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    await resolveSession();
    const body = await req.json().catch(() => ({}));
    const dateFolder = normalizeDateFolder(String(body?.dateFolder || ""));
    const fromPath = String(body?.fromPath || "").trim();
    const newName = ensurePdfName(String(body?.newName || ""));

    if (!dateFolder) return NextResponse.json({ ok: false, error: "DATE_REQUIRED_YYYY_MM_DD" }, { status: 400 });
    if (!fromPath || !isAllowedPath(fromPath)) {
      return NextResponse.json({ ok: false, error: "INVALID_SOURCE_PATH" }, { status: 400 });
    }
    const split = splitPath(fromPath);
    if (split.folder !== "error" || split.dateFolder !== dateFolder) {
      return NextResponse.json({ ok: false, error: "SOURCE_MUST_BE_ERROR_OF_DATE" }, { status: 400 });
    }

    const bucket = adminStorageBucket();
    const srcFile = bucket.file(fromPath);
    const [exists] = await srcFile.exists();
    if (!exists) return NextResponse.json({ ok: false, error: "SOURCE_NOT_FOUND" }, { status: 404 });

    const dstPath = await ensureUniqueDestinationPath(bucket, `${ROOT_PREFIX}/ok/${dateFolder}`, newName);
    await srcFile.move(dstPath);

    return NextResponse.json({
      ok: true,
      fromPath,
      toPath: dstPath,
      toName: splitPath(dstPath).fileName,
    });
  } catch (e: any) {
    const mapped = requireSessionAndScopeErrorMessage(String(e?.message || ""));
    if (mapped) return NextResponse.json({ ok: false, error: mapped.error }, { status: mapped.status });
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}


