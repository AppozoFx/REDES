import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { requireAreaScope } from "@/core/auth/apiGuards";
import { adminDb, adminStorageBucket } from "@/lib/firebase/admin";
import { openai } from "@/lib/ai/openai";
import { createHash } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

export const runtime = "nodejs";

const ROOT_PREFIX = "guias_actas/actas_servicio";
const ALLOWED_FOLDERS = new Set(["inbox", "ok", "error"]);
const LOGS_COL = "actas_renombrado_logs";
const INDEX_COL = "actas_renombrado_index";
const PROGRESS_COL = "actas_renombrado_progress";
const LOCKS_COL = "actas_renombrado_locks";
const PROGRESS_TTL_HOURS = 72;
const MAX_FILES_PER_REQUEST = 300;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const FILE_LOCK_TTL_MS = 45 * 60 * 1000;
const execFileAsync = promisify(execFile);

type DeterministicEngineMode = "off" | "shadow" | "active";

function normalizeEngineMode(raw: string): DeterministicEngineMode {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "shadow" || v === "active") return v;
  return "off";
}

const ACTA_ENGINE_URL = String(process.env.ACTA_ENGINE_URL || "").trim();
const ACTA_ENGINE_BEARER = String(process.env.ACTA_ENGINE_BEARER || "").trim();
const ACTA_ENGINE_TIMEOUT_MS = Math.max(1000, Math.min(20000, Number(process.env.ACTA_ENGINE_TIMEOUT_MS || 7000)));
const ACTA_ENGINE_MODE: DeterministicEngineMode = (() => {
  const parsed = normalizeEngineMode(process.env.ACTA_ENGINE_MODE || "");
  if (parsed === "off" && ACTA_ENGINE_URL) return "active";
  return parsed;
})();

type DayStats = {
  instalacionesDia: number;
  actasOkDia: number;
  faltanActas: number;
  sobranActas: number;
};

type InstalacionActaItem = {
  id: string;
  acta: string;
  actaDigits: string;
  codigoCliente: string;
  cliente: string;
  fechaOrdenYmd: string;
  fechaInstalacionYmd: string;
};

type InstalacionSinActaItem = {
  id: string;
  codigoCliente: string;
  cliente: string;
  fechaOrdenYmd: string;
  fechaInstalacionYmd: string;
};

type DaySnapshot = {
  instalacionesDia: number;
  instalacionesConActa: InstalacionActaItem[];
  instalacionesSinActa: InstalacionSinActaItem[];
  byActaDigits: Map<string, InstalacionActaItem[]>;
  byCodigoCliente: Map<string, InstalacionActaItem[]>;
};

function normalizeDateFolder(raw: string) {
  const v = String(raw || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
}

function normalizeMonthFolder(raw: string) {
  const v = String(raw || "").trim();
  return /^\d{4}-\d{2}$/.test(v) ? v : "";
}

function buildMonthDateFolders(month: string) {
  const [yearRaw, monthRaw] = String(month || "").split("-");
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 1 || monthIndex > 12) return [];
  const daysInMonth = new Date(year, monthIndex, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, idx) => {
    const day = String(idx + 1).padStart(2, "0");
    return `${yearRaw}-${monthRaw}-${day}`;
  });
}

function normalizeAnyDateToYmd(raw: unknown) {
  const v = String(raw || "").trim();
  if (!v) return "";
  const iso = v.match(/^(\d{4})[-\/](\d{2})[-\/](\d{2})(?:[T\s].*)?$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = v.match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})(?:[T\s].*)?$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return "";
}

function pickFirstYmd(values: unknown[]) {
  for (const v of values) {
    const ymd = normalizeAnyDateToYmd(v);
    if (ymd) return ymd;
  }
  return "";
}

function pickFirstActaRaw(values: unknown[]) {
  for (const v of values) {
    const acta = String(v || "").trim();
    if (acta) return acta;
  }
  return "";
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

function normalizeActaDigits(raw: string) {
  return String(raw || "").replace(/\D/g, "");
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

function stripPdfTechnicalMetadata(text: string) {
  let clean = String(text || "");
  // Evita falsos positivos desde el trailer/ID técnico del PDF.
  clean = clean.replace(/\/ID\s*\[\s*<[^>\r\n]{8,}>\s*<[^>\r\n]{8,}>\s*\]/gi, " ");
  clean = clean.replace(/xref[\s\S]*?trailer[\s\S]*?(?:startxref[\s\S]*?%%EOF|%%EOF)/gi, " ");
  clean = clean.replace(/startxref\s+\d+\s+%%EOF/gi, " ");
  return clean;
}

function extractActaByRegex(text: string) {
  const clean = stripPdfTechnicalMetadata(text);
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
  const clean = stripPdfTechnicalMetadata(text);
  const contextualRegex = /\b(?:acta|codigo(?:\s+de)?\s+acta|cod(?:\.|igo)?)\b[\s:#-]*([0-9][0-9\-\s]{6,18})/gi;
  for (const m of clean.matchAll(contextualRegex)) {
    const acta = normalizeActaStrict(m[1] || "");
    if (acta) return acta;
  }

  const typicalRegex = /(?:^|[^0-9])(0[0-9]{2}(?:[-\s][0-9]{4,10}|[0-9]{7}))(?=[^0-9]|$)/g;
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
  source: "pdf_text" | "det_engine" | "ai_pdf" | null;
  detail: string;
  attempts?: number;
  trace?: DetectionTraceStep[];
};

type DetectionStageStatus = "running" | "done" | "miss" | "error";
type DetectionTraceStep = {
  stage: string;
  label: string;
  status: Exclude<DetectionStageStatus, "running">;
  detail: string;
  durationMs: number;
};
type DetectionProgressReporter = (update: {
  stageKey: string;
  stageLabel: string;
  stageStatus: DetectionStageStatus;
  detail?: string;
  durationMs?: number;
  useAi?: boolean;
}) => Promise<void>;

function sanitizeRequestId(raw: string) {
  return String(raw || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 120);
}

async function writeProgress(requestId: string, payload: Record<string, any>) {
  const id = sanitizeRequestId(requestId);
  if (!id) return;
  const expiresAt = new Date(Date.now() + PROGRESS_TTL_HOURS * 60 * 60 * 1000);
  await adminDb()
    .collection(PROGRESS_COL)
    .doc(id)
    .set(
      {
        ...payload,
        requestId: id,
        updatedAt: new Date().toISOString(),
        expiresAt,
      },
      { merge: true }
    );
}

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

function sharpCanReadPdf() {
  try {
    const req = eval("require") as NodeRequire;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sharp = req("sharp") as any;
    return Boolean(sharp?.format?.pdf?.input?.buffer || sharp?.format?.pdf?.input?.file);
  } catch {
    return false;
  }
}

async function rasterizePdfWithPoppler(pdfBuffer: Buffer, density = 280): Promise<Buffer | null> {
  const tmpBase = join(tmpdir(), "actas-renombrar-");
  const dir = await mkdtemp(tmpBase);
  const src = join(dir, "in.pdf");
  const outPrefix = join(dir, "page");
  const outPng = `${outPrefix}.png`;
  try {
    await writeFile(src, pdfBuffer);
    await execFileAsync("pdftoppm", ["-f", "1", "-singlefile", "-r", String(density), "-png", src, outPrefix], {
      windowsHide: true,
    });
    const png = await readFile(outPng);
    if (!png.length) return null;
    return png;
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => null);
  }
}

async function rasterizePdfFirstPageToPng(
  pdfBuffer: Buffer,
  density = 280
): Promise<{ png: Buffer; mode: "sharp_pdf" | "poppler_pdftoppm" } | null> {
  try {
    const req = eval("require") as NodeRequire;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sharp = req("sharp") as any;
    if (sharpCanReadPdf()) {
      const png = await sharp(pdfBuffer, { density, page: 0, failOn: "none" })
        .flatten({ background: "#ffffff" })
        .png()
        .toBuffer();
      if (png.length) return { png, mode: "sharp_pdf" };
    }
  } catch {
    // fallback to poppler
  }

  const popplerPng = await rasterizePdfWithPoppler(pdfBuffer, density);
  if (popplerPng?.length) return { png: popplerPng, mode: "poppler_pdftoppm" };
  return null;
}

async function extractActaFromPdfByBarcodeDecoder(pdfBuffer: Buffer): Promise<ActaDetection> {
  try {
    const req = eval("require") as NodeRequire;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sharp = req("sharp") as any;
    // Si no esta instalado, no rompe: sigue con siguientes capas.
    req("@zxing/library");

    const raster = await rasterizePdfFirstPageToPng(pdfBuffer, 280);
    if (!raster?.png) {
      return { acta: null, source: null, detail: "ZXING_NO_RASTER_ENGINE", attempts: 1 };
    }
    const base = sharp(raster.png, { failOn: "none" }).flatten({ background: "#ffffff" });
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
          detail: `Detectada por ZXING (${v.label}; ${raster.mode})`,
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
    const raster = await rasterizePdfFirstPageToPng(pdfBuffer, 260);
    if (!raster?.png) {
      return { acta: null, source: null, detail: `No se pudo rasterizar PDF (${fileName})`, attempts: 1 };
    }
    const base = sharp(raster.png, { failOn: "none" }).flatten({ background: "#ffffff" });
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
      detail: `${details.join("; ")}; raster=${raster.mode}`,
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

async function extractActaFromPdfByDeterministicEngine(fileName: string, pdfBuffer: Buffer): Promise<ActaDetection> {
  if (!ACTA_ENGINE_URL) {
    return { acta: null, source: null, detail: "ENGINE_NOT_CONFIGURED", attempts: 1 };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ACTA_ENGINE_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (ACTA_ENGINE_BEARER) headers.Authorization = `Bearer ${ACTA_ENGINE_BEARER}`;

    const resp = await fetch(ACTA_ENGINE_URL, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        fileName,
        mimeType: "application/pdf",
        pdfBase64: pdfBuffer.toString("base64"),
      }),
    });

    const raw = await resp.text();
    if (!resp.ok) {
      return {
        acta: null,
        source: null,
        detail: `ENGINE_HTTP_${resp.status}${raw ? `: ${raw.slice(0, 180)}` : ""}`,
        attempts: 1,
      };
    }

    let payload: any = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      // no-op
    }

    const rawActa =
      payload?.acta ??
      payload?.codigoActa ??
      payload?.code ??
      payload?.data?.acta ??
      payload?.result?.acta ??
      "";
    const acta = normalizeActaStrict(String(rawActa || ""));
    if (acta) {
      return {
        acta,
        source: "det_engine",
        detail: "Detectada por motor deterministico externo",
        attempts: 1,
      };
    }

    return {
      acta: null,
      source: null,
      detail: String(payload?.detail || payload?.message || "ENGINE_NO_MATCH"),
      attempts: 1,
    };
  } catch (e: any) {
    return {
      acta: null,
      source: null,
      detail: `ENGINE_ERROR: ${String(e?.message || "UNKNOWN")}`,
      attempts: 1,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function extractActaFromPdf(
  fileName: string,
  pdfBuffer: Buffer,
  onProgress?: DetectionProgressReporter,
  options?: {
    skipEmbeddedText?: boolean;
    forceEngineActive?: boolean;
  }
): Promise<ActaDetection> {
  const trace: DetectionTraceStep[] = [];
  const skipEmbeddedText = Boolean(options?.skipEmbeddedText);
  const engineMode: "off" | "shadow" | "active" = options?.forceEngineActive ? "active" : ACTA_ENGINE_MODE;
  const pushTrace = async (
    stage: string,
    label: string,
    status: Exclude<DetectionStageStatus, "running">,
    detail: string,
    durationMs: number,
    useAi = false
  ) => {
    trace.push({ stage, label, status, detail, durationMs });
    if (onProgress) {
      await onProgress({
        stageKey: stage,
        stageLabel: label,
        stageStatus: status,
        detail,
        durationMs,
        useAi,
      });
    }
  };

  // 1) y 2) Heuristicas rapidas por texto/streams embebidos.
  if (!skipEmbeddedText) {
    if (onProgress) {
      await onProgress({
        stageKey: "pdf_text_scan",
        stageLabel: "Analizando texto embebido",
        stageStatus: "running",
        detail: "Regex deterministico sobre contenido del PDF",
        useAi: false,
      });
    }
    const tPdfText = Date.now();
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
          trace: [
            ...trace,
            {
              stage: "pdf_text_scan",
              label: "Analizando texto embebido",
              status: "done",
              detail: "Detectada por texto embebido en PDF (regex deterministico)",
              durationMs: Date.now() - tPdfText,
            },
          ],
        };
      }
    }
    await pushTrace(
      "pdf_text_scan",
      "Analizando texto embebido",
      "miss",
      "Sin coincidencias por regex deterministico",
      Date.now() - tPdfText
    );

    if (onProgress) {
      await onProgress({
        stageKey: "pdf_stream_parser",
        stageLabel: "Analizando streams PDF",
        stageStatus: "running",
        detail: "Parser deterministico de literales/hex",
        useAi: false,
      });
    }
    const tStream = Date.now();
    const streamActa = extractActaFromPdfStreams(pdfBuffer);
    if (streamActa) {
      return {
        acta: streamActa,
        source: "pdf_text",
        detail: "Detectada por parser deterministico de stream PDF",
        attempts: 1,
        trace: [
          ...trace,
          {
            stage: "pdf_stream_parser",
            label: "Analizando streams PDF",
            status: "done",
            detail: "Detectada por parser deterministico de stream PDF",
            durationMs: Date.now() - tStream,
          },
        ],
      };
    }
    await pushTrace(
      "pdf_stream_parser",
      "Analizando streams PDF",
      "miss",
      "Sin codigo valido en streams PDF",
      Date.now() - tStream
    );
  } else {
    await pushTrace(
      "pdf_text_scan",
      "Analizando texto embebido",
      "miss",
      "Omitido en modo riguroso",
      0
    );
    await pushTrace(
      "pdf_stream_parser",
      "Analizando streams PDF",
      "miss",
      "Omitido en modo riguroso",
      0
    );
  }

  // 3) Decoder real de barcode (ZXING) sobre ROI + variantes.
  if (onProgress) {
    await onProgress({
      stageKey: "barcode_zxing",
      stageLabel: "Decodificando barcode con ZXING",
      stageStatus: "running",
      detail: "ROI + variantes de imagen",
      useAi: false,
    });
  }
  const tZxing = Date.now();
  const zxing = await extractActaFromPdfByBarcodeDecoder(pdfBuffer);
  if (zxing.acta) {
    return {
      ...zxing,
      trace: [
        ...trace,
        {
          stage: "barcode_zxing",
          label: "Decodificando barcode con ZXING",
          status: "done",
          detail: zxing.detail,
          durationMs: Date.now() - tZxing,
        },
      ],
    };
  }
  await pushTrace(
    "barcode_zxing",
    "Decodificando barcode con ZXING",
    "miss",
    zxing.detail,
    Date.now() - tZxing
  );

  // 4) Motor deterministico externo opcional (feature-flag), antes de IA.
  if (engineMode !== "off") {
    if (onProgress) {
      await onProgress({
        stageKey: "det_engine",
        stageLabel: "Motor deterministico externo",
        stageStatus: "running",
        detail: engineMode === "active" ? "Modo active (resultado aplicado)" : "Modo shadow (solo observacion)",
        useAi: false,
      });
    }

    const tEngine = Date.now();
    const engine = await extractActaFromPdfByDeterministicEngine(fileName, pdfBuffer);
    const engineStatus: Exclude<DetectionStageStatus, "running"> = engine.acta
      ? "done"
      : engine.detail.startsWith("ENGINE_ERROR") || engine.detail.startsWith("ENGINE_HTTP_")
      ? "error"
      : "miss";

    if (engine.acta && engineMode === "active") {
      return {
        ...engine,
        trace: [
          ...trace,
          {
            stage: "det_engine",
            label: "Motor deterministico externo",
            status: "done",
            detail: engine.detail,
            durationMs: Date.now() - tEngine,
          },
        ],
      };
    }

    await pushTrace(
      "det_engine",
      "Motor deterministico externo",
      engineStatus,
      engine.acta && engineMode === "shadow" ? `${engine.detail} (shadow)` : engine.detail,
      Date.now() - tEngine
    );
  }

  // 5) IA sobre imagen (ROI sup-der con margen + preprocesado + pagina completa).
  if (onProgress) {
    await onProgress({
      stageKey: "ai_image_passes",
      stageLabel: "Analizando imagen con IA",
      stageStatus: "running",
      detail: "ROI superior derecha + pagina completa",
      useAi: true,
    });
  }
  const tAiImg = Date.now();
  const aiImage = await extractActaFromPdfByAiImagePasses(fileName, pdfBuffer);
  if (aiImage.acta) {
    return {
      ...aiImage,
      trace: [
        ...trace,
        {
          stage: "ai_image_passes",
          label: "Analizando imagen con IA",
          status: "done",
          detail: aiImage.detail,
          durationMs: Date.now() - tAiImg,
        },
      ],
    };
  }
  await pushTrace(
    "ai_image_passes",
    "Analizando imagen con IA",
    "miss",
    aiImage.detail,
    Date.now() - tAiImg,
    true
  );

  // 6) Fallback IA directo sobre PDF.
  if (onProgress) {
    await onProgress({
      stageKey: "ai_pdf_roi",
      stageLabel: "Analizando PDF completo con IA (ROI)",
      stageStatus: "running",
      detail: "Paso ROI en archivo PDF",
      useAi: true,
    });
  }
  const tAiRoi = Date.now();
  try {
    const ai = await extractActaFromPdfByAi(fileName, pdfBuffer, "roi");
    if (ai.acta) {
      return {
        ...ai,
        trace: [
          ...trace,
          {
            stage: "ai_pdf_roi",
            label: "Analizando PDF completo con IA (ROI)",
            status: "done",
            detail: ai.detail,
            durationMs: Date.now() - tAiRoi,
          },
        ],
      };
    }
    await pushTrace(
      "ai_pdf_roi",
      "Analizando PDF completo con IA (ROI)",
      "miss",
      ai.detail,
      Date.now() - tAiRoi,
      true
    );

    if (onProgress) {
      await onProgress({
        stageKey: "ai_pdf_full",
        stageLabel: "Analizando PDF completo con IA (full page)",
        stageStatus: "running",
        detail: "Paso full page en archivo PDF",
        useAi: true,
      });
    }
    const tAiFull = Date.now();
    const aiRetry = await extractActaFromPdfByAi(fileName, pdfBuffer, "full");
    if (aiRetry.acta) {
      return {
        ...aiRetry,
        attempts: 2,
        trace: [
          ...trace,
          {
            stage: "ai_pdf_full",
            label: "Analizando PDF completo con IA (full page)",
            status: "done",
            detail: aiRetry.detail,
            durationMs: Date.now() - tAiFull,
          },
        ],
      };
    }
    await pushTrace(
      "ai_pdf_full",
      "Analizando PDF completo con IA (full page)",
      "miss",
      aiRetry.detail,
      Date.now() - tAiFull,
      true
    );
    return {
      acta: null,
      source: null,
      detail: `${zxing.detail}; ${aiImage.detail}; ${ai.detail}; ${aiRetry.detail}`,
      attempts: 2,
      trace,
    };
  } catch (e: any) {
    await pushTrace(
      "ai_pdf_roi",
      "Analizando PDF completo con IA (ROI)",
      "error",
      `Error IA PDF: ${String(e?.message || "UNKNOWN_AI_ERROR")}`,
      Date.now() - tAiRoi,
      true
    );
    return {
      acta: null,
      source: null,
      detail: `${zxing.detail}; ${aiImage.detail}; Error IA PDF: ${String(e?.message || "UNKNOWN_AI_ERROR")}`,
      attempts: 2,
      trace,
    };
  }

  return {
    acta: null,
    source: null,
    detail: "No se detecto acta por heuristica deterministica ni por IA",
    trace,
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

function buildRunId(uid: string, dateFolder: string, baseRequestId: string) {
  const seed = baseRequestId || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  return sanitizeRequestId(`${uid}_${dateFolder}_${seed}`.slice(0, 128));
}


function buildFileLockId(dateFolder: string, fileHash: string) {
  return `${dateFolder}_${fileHash}`;
}

async function acquireFileLock(params: {
  lockId: string;
  dateFolder: string;
  fileHash: string;
  uid: string;
  runId: string;
  requestId: string;
  fileName: string;
}) {
  const now = Date.now();
  const expiresAtMs = now + FILE_LOCK_TTL_MS;
  const db = adminDb();
  const ref = db.collection(LOCKS_COL).doc(params.lockId);
  let blockedBy: string | null = null;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const row = (snap.data() as any) || {};
      const ownerRunId = sanitizeRequestId(String(row.runId || ""));
      const status = String(row.status || "");
      const exp = Number(row.expiresAtMs || 0);
      if (status === "processing" && exp > now && ownerRunId && ownerRunId !== params.runId) {
        blockedBy = ownerRunId;
        return;
      }
    }
    tx.set(
      ref,
      {
        lockId: params.lockId,
        dateFolder: params.dateFolder,
        fileHash: params.fileHash,
        uid: params.uid,
        runId: params.runId,
        requestId: params.requestId,
        fileName: params.fileName,
        status: "processing",
        startedAt: new Date().toISOString(),
        expiresAtMs,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  });

  if (blockedBy) return { ok: false as const, blockedBy };
  return { ok: true as const };
}

async function releaseFileLock(params: { lockId: string; runId: string }) {
  try {
    const db = adminDb();
    const ref = db.collection(LOCKS_COL).doc(params.lockId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const row = (snap.data() as any) || {};
      const ownerRunId = sanitizeRequestId(String(row.runId || ""));
      if (ownerRunId && ownerRunId !== params.runId) return;
      tx.delete(ref);
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
  pdfBuffer: Buffer,
  onProgress?: DetectionProgressReporter
) {
  const detected = await extractActaFromPdf(fileName, pdfBuffer, onProgress);
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
      attempts: Number(detected.attempts || 0),
      trace: detected.trace || [],
    };
  }

  const found = await resolveClienteFromActa(acta);
  if (!found) {
    if (detected.source !== "ai_pdf") {
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
            attempts: Number(detected.attempts || 0),
            trace: detected.trace || [],
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
      attempts: Number(detected.attempts || 0),
      trace: detected.trace || [],
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
    attempts: Number(detected.attempts || 0),
    trace: detected.trace || [],
  };
}

async function reanalyzeErrorFileRigorous(
  bucket: any,
  fromPath: string,
  dateFolder: string,
  onProgress?: DetectionProgressReporter
) {
  const split = splitPath(fromPath);
  const fileName = ensurePdfName(split.fileName || "archivo.pdf");
  const srcFile = bucket.file(fromPath);
  const [exists] = await srcFile.exists();
  if (!exists) {
    return {
      originalName: fileName,
      acta: null,
      source: null,
      status: "error" as const,
      finalPath: fromPath,
      finalName: fileName,
      reason: "SOURCE_NOT_FOUND",
      detail: "El archivo ya no existe en la carpeta error",
      attempts: 0,
      trace: [],
      durationMs: 0,
    };
  }

  const startedAt = Date.now();
  const [buffer] = await srcFile.download();
  const detected = await extractActaFromPdf(fileName, buffer, onProgress, {
    skipEmbeddedText: true,
    forceEngineActive: true,
  });
  const acta = detected.acta || "";
  if (!acta) {
    return {
      originalName: fileName,
      acta: null,
      source: detected.source,
      status: "error" as const,
      finalPath: fromPath,
      finalName: fileName,
      reason: "ACTA_NO_DETECTADA_EN_PDF",
      detail: `${detected.detail} (reanálisis riguroso)`,
      attempts: Number(detected.attempts || 0),
      trace: detected.trace || [],
      durationMs: Date.now() - startedAt,
    };
  }

  const found = await resolveClienteFromActa(acta);
  if (!found) {
    return {
      originalName: fileName,
      acta,
      source: detected.source,
      status: "error" as const,
      finalPath: fromPath,
      finalName: fileName,
      reason: "SIN_CLIENTE_ASOCIADO",
      detail: `Acta detectada (${acta}) pero sin cliente/codigo en Firestore (reanálisis riguroso)`,
      attempts: Number(detected.attempts || 0),
      trace: detected.trace || [],
      durationMs: Date.now() - startedAt,
    };
  }

  const targetName = `${safeNameStrict(found.codigoCliente)} - ${safeNameStrict(found.cliente)}.pdf`;
  const dstPath = await ensureUniqueDestinationPath(bucket, `${ROOT_PREFIX}/ok/${dateFolder}`, targetName);
  await srcFile.move(dstPath);

  return {
    originalName: fileName,
    acta,
    source: detected.source,
    status: "ok" as const,
    finalPath: dstPath,
    finalName: splitPath(dstPath).fileName,
    reason: "RENOMBRADO_OK",
    detail: `Renombrado a ${targetName} (reanálisis riguroso)`,
    attempts: Number(detected.attempts || 0),
    trace: detected.trace || [],
    durationMs: Date.now() - startedAt,
  };
}

async function listByPrefix(bucket: any, prefix: string) {
  const [files] = await bucket.getFiles({ prefix });
  return files
    .filter((f: any) => String(f.name || "").toLowerCase().endsWith(".pdf"))
    .map(mapStorageFile)
    .sort((a: any, b: any) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
}

function mapInstalacionActaItem(docId: string, data: any): InstalacionActaItem | null {
  const actaRaw = pickFirstActaRaw([
    data?.ACTA,
    data?.acta,
    data?.materialesLiquidacion?.acta,
    data?.liquidacion?.acta,
    data?.orden?.ACTA,
    data?.orden?.acta,
    data?.orden?.codigoActa,
    data?.orden?.codActa,
  ]);
  if (!actaRaw) return null;
  const acta = normalizeActaStrict(actaRaw) || actaRaw;
  const actaDigits = normalizeActaDigits(actaRaw);
  return {
    id: docId,
    acta,
    actaDigits,
    codigoCliente: String(data?.codigoCliente || data?.orden?.codiSeguiClien || docId || "").trim(),
    cliente: String(data?.cliente || data?.orden?.cliente || "").trim(),
    fechaOrdenYmd: pickFirstYmd([
      data?.fechaOrdenYmd,
      data?.fechaOrden,
      data?.orden?.fechaFinVisiYmd,
      data?.orden?.fechaFinVisi,
      data?.orden?.fSoliYmd,
      data?.orden?.fSoli,
    ]),
    fechaInstalacionYmd: pickFirstYmd([
      data?.fechaInstalacionYmd,
      data?.fechaInstalacion,
      data?.liquidacion?.ymd,
      data?.liquidacion?.fecha,
    ]),
  };
}

async function loadDaySnapshot(dateFolder: string): Promise<DaySnapshot> {
  const db = adminDb();
  const fields = [
    "ACTA",
    "acta",
    "codigoCliente",
    "cliente",
    "fechaOrdenYmd",
    "fechaOrden",
    "fechaInstalacionYmd",
    "fechaInstalacion",
    "materialesLiquidacion.acta",
    "liquidacion.acta",
    "liquidacion.ymd",
    "liquidacion.fecha",
    "orden.ACTA",
    "orden.acta",
    "orden.codigoActa",
    "orden.codActa",
    "orden.codiSeguiClien",
    "orden.cliente",
    "orden.fechaFinVisiYmd",
    "orden.fechaFinVisi",
    "orden.fSoliYmd",
    "orden.fSoli",
  ];
  const [byOrden, byInst] = await Promise.all([
    db.collection("instalaciones").where("fechaOrdenYmd", "==", dateFolder).select(...fields).limit(10000).get(),
    db.collection("instalaciones").where("fechaInstalacionYmd", "==", dateFolder).select(...fields).limit(10000).get(),
  ]);
  const docById = new Map<string, any>();
  [...byOrden.docs, ...byInst.docs].forEach((d) => {
    if (!docById.has(d.id)) docById.set(d.id, d.data() as any);
  });

  const instalacionesConActa: InstalacionActaItem[] = [];
  const instalacionesSinActa: InstalacionSinActaItem[] = [];
  const byActaDigits = new Map<string, InstalacionActaItem[]>();
  const byCodigoCliente = new Map<string, InstalacionActaItem[]>();
  docById.forEach((data, docId) => {
    const item = mapInstalacionActaItem(docId, data);
    if (!item) {
      instalacionesSinActa.push({
        id: docId,
        codigoCliente: String(data?.codigoCliente || data?.orden?.codiSeguiClien || docId || "").trim(),
        cliente: String(data?.cliente || data?.orden?.cliente || "").trim(),
        fechaOrdenYmd: pickFirstYmd([
          data?.fechaOrdenYmd,
          data?.fechaOrden,
          data?.orden?.fechaFinVisiYmd,
          data?.orden?.fechaFinVisi,
          data?.orden?.fSoliYmd,
          data?.orden?.fSoli,
        ]),
        fechaInstalacionYmd: pickFirstYmd([
          data?.fechaInstalacionYmd,
          data?.fechaInstalacion,
          data?.liquidacion?.ymd,
          data?.liquidacion?.fecha,
        ]),
      });
      return;
    }
    instalacionesConActa.push(item);
    const list = byActaDigits.get(item.actaDigits) || [];
    list.push(item);
    byActaDigits.set(item.actaDigits, list);
    const code = String(item.codigoCliente || "").trim();
    if (code) {
      const byCode = byCodigoCliente.get(code) || [];
      byCode.push(item);
      byCodigoCliente.set(code, byCode);
    }
  });

  return {
    instalacionesDia: docById.size,
    instalacionesConActa,
    instalacionesSinActa,
    byActaDigits,
    byCodigoCliente,
  };
}

async function lookupActaDateHints(acta: string) {
  const clean = normalizeActaStrict(acta);
  if (!clean) return [] as string[];
  const db = adminDb();
  const [byActa, byMatActa] = await Promise.all([
    db.collection("instalaciones").where("ACTA", "==", clean).limit(30).get(),
    db.collection("instalaciones").where("materialesLiquidacion.acta", "==", clean).limit(30).get(),
  ]);
  const dates = new Set<string>();
  [...byActa.docs, ...byMatActa.docs].forEach((doc) => {
    const row = doc.data() as any;
    const d1 = pickFirstYmd([
      row?.fechaOrdenYmd,
      row?.fechaOrden,
      row?.orden?.fechaFinVisiYmd,
      row?.orden?.fechaFinVisi,
      row?.orden?.fSoliYmd,
      row?.orden?.fSoli,
    ]);
    const d2 = pickFirstYmd([
      row?.fechaInstalacionYmd,
      row?.fechaInstalacion,
      row?.liquidacion?.ymd,
      row?.liquidacion?.fecha,
    ]);
    if (d1) dates.add(d1);
    if (d2) dates.add(d2);
  });
  const actaDoc = await db.collection("actas").doc(clean).get().catch(() => null);
  if (actaDoc?.exists) {
    const row = actaDoc.data() as any;
    const d0 = pickFirstYmd([
      row?.fechaYmd,
      row?.fecha,
      row?.fechaInstalacionYmd,
      row?.fechaInstalacion,
      row?.fSoliYmd,
      row?.fSoli,
    ]);
    if (d0) dates.add(d0);
  }
  return Array.from(dates).sort((a, b) => a.localeCompare(b));
}

async function relinkIndexFinalPath(params: {
  fromPath: string;
  toPath: string;
  status: "ok" | "error";
  reason?: string;
}) {
  const db = adminDb();
  const snap = await db.collection(INDEX_COL).where("finalPath", "==", params.fromPath).limit(200).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach((d) => {
    batch.set(
      d.ref,
      {
        finalPath: params.toPath,
        status: params.status,
        reason: params.reason || "",
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  });
  await batch.commit();
  return snap.size;
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
    const requestId = sanitizeRequestId(String(searchParams.get("requestId") || ""));
    if (requestId) {
      const snap = await adminDb().collection(PROGRESS_COL).doc(requestId).get();
      return NextResponse.json({
        ok: true,
        requestId,
        progress: snap.exists ? (snap.data() as any) : null,
      });
    }

    const month = normalizeMonthFolder(String(searchParams.get("month") || ""));
    if (month) {
      const bucket = adminStorageBucket();
      const days = buildMonthDateFolders(month);
      const rows = await Promise.all(
        days.map(async (day) => {
          const [inbox, okFiles, errorFiles, daySnapshot] = await Promise.all([
            listByPrefix(bucket, `${ROOT_PREFIX}/inbox/${day}/`),
            listByPrefix(bucket, `${ROOT_PREFIX}/ok/${day}/`),
            listByPrefix(bucket, `${ROOT_PREFIX}/error/${day}/`),
            loadDaySnapshot(day),
          ]);
          const stats: DayStats = {
            instalacionesDia: daySnapshot.instalacionesDia,
            actasOkDia: okFiles.length,
            faltanActas: Math.max(0, daySnapshot.instalacionesDia - okFiles.length),
            sobranActas: Math.max(0, okFiles.length - daySnapshot.instalacionesDia),
          };
          return {
            dateFolder: day,
            inboxCount: inbox.length,
            okCount: okFiles.length,
            errorCount: errorFiles.length,
            instalacionesDia: stats.instalacionesDia,
            actasOkDia: stats.actasOkDia,
            faltanActas: stats.faltanActas,
            sobranActas: stats.sobranActas,
            instalacionesSinActa: daySnapshot.instalacionesSinActa.length,
          };
        })
      );

      return NextResponse.json({
        ok: true,
        month,
        days: rows,
      });
    }

    const dateFolder = normalizeDateFolder(String(searchParams.get("dateFolder") || ""));
    const liteMode = ["1", "true", "yes"].includes(String(searchParams.get("lite") || "").trim().toLowerCase());
    if (!dateFolder) {
      return NextResponse.json({ ok: false, error: "DATE_REQUIRED_YYYY_MM_DD" }, { status: 400 });
    }

    const bucket = adminStorageBucket();
    if (liteMode) {
      const [inbox, okFiles, errorFiles, daySnapshot] = await Promise.all([
        listByPrefix(bucket, `${ROOT_PREFIX}/inbox/${dateFolder}/`),
        listByPrefix(bucket, `${ROOT_PREFIX}/ok/${dateFolder}/`),
        listByPrefix(bucket, `${ROOT_PREFIX}/error/${dateFolder}/`),
        loadDaySnapshot(dateFolder),
      ]);

      const stats: DayStats = {
        instalacionesDia: daySnapshot.instalacionesDia,
        actasOkDia: okFiles.length,
        faltanActas: Math.max(0, daySnapshot.instalacionesDia - okFiles.length),
        sobranActas: Math.max(0, okFiles.length - daySnapshot.instalacionesDia),
      };

      return NextResponse.json({
        ok: true,
        dateFolder,
        inbox,
        okFiles,
        errorFiles,
        stats,
      });
    }

    const [inbox, okFiles, errorFiles, daySnapshot, indexSnap] = await Promise.all([
      listByPrefix(bucket, `${ROOT_PREFIX}/inbox/${dateFolder}/`),
      listByPrefix(bucket, `${ROOT_PREFIX}/ok/${dateFolder}/`),
      listByPrefix(bucket, `${ROOT_PREFIX}/error/${dateFolder}/`),
      loadDaySnapshot(dateFolder),
      adminDb().collection(INDEX_COL).where("dateFolder", "==", dateFolder).limit(10000).get(),
    ]);

    const indexByFinalPath = new Map<string, { acta: string; updatedAt: number }>();
    indexSnap.docs.forEach((doc) => {
      const row = doc.data() as any;
      const finalPath = String(row?.finalPath || "").trim();
      const acta = normalizeActaStrict(String(row?.acta || ""));
      if (!finalPath || !acta) return;
      const updatedAt = Date.parse(String(row?.updatedAt || "")) || 0;
      const prev = indexByFinalPath.get(finalPath);
      if (!prev || updatedAt >= prev.updatedAt) {
        indexByFinalPath.set(finalPath, { acta, updatedAt });
      }
    });

    const okDentroFecha: Array<{
      fileName: string;
      fullPath: string;
      acta: string;
      codigoCliente: string;
      cliente: string;
      fechaOrdenYmd: string;
      fechaInstalacionYmd: string;
    }> = [];
    const okFueraFechaRaw: Array<{ fileName: string; fullPath: string; acta: string; actaDigits: string }> = [];
    const okSinTrazabilidad: Array<{ fileName: string; fullPath: string }> = [];
    const okDuplicatesRaw: Array<{
      fileName: string;
      fullPath: string;
      acta: string;
      actaDigits: string;
      codigoCliente: string;
      cliente: string;
    }> = [];
    const okActasDetectadas = new Set<string>();
    const okSeenByActaDigits = new Set<string>();

    okFiles.forEach((item: any) => {
      const idx = indexByFinalPath.get(String(item.fullPath || ""));
      if (!idx?.acta) {
        okSinTrazabilidad.push({ fileName: item.name, fullPath: item.fullPath });
        return;
      }
      const actaDigits = normalizeActaDigits(idx.acta);
      if (!actaDigits) {
        okSinTrazabilidad.push({ fileName: item.name, fullPath: item.fullPath });
        return;
      }
      const matches = daySnapshot.byActaDigits.get(actaDigits) || [];
      if (matches.length) {
        const m = matches[0];
        if (okSeenByActaDigits.has(actaDigits)) {
          okDuplicatesRaw.push({
            fileName: item.name,
            fullPath: item.fullPath,
            acta: idx.acta,
            actaDigits,
            codigoCliente: m.codigoCliente,
            cliente: m.cliente,
          });
          return;
        }
        okSeenByActaDigits.add(actaDigits);
        okActasDetectadas.add(actaDigits);
        okDentroFecha.push({
          fileName: item.name,
          fullPath: item.fullPath,
          acta: idx.acta,
          codigoCliente: m.codigoCliente,
          cliente: m.cliente,
          fechaOrdenYmd: m.fechaOrdenYmd,
          fechaInstalacionYmd: m.fechaInstalacionYmd,
        });
      } else {
        const codigoFromName = String(item.name || "").split(" - ")[0]?.trim() || "";
        const byCode = codigoFromName ? daySnapshot.byCodigoCliente.get(codigoFromName) || [] : [];
        if (byCode.length) {
          const m = byCode[0];
          if (okSeenByActaDigits.has(actaDigits)) {
            okDuplicatesRaw.push({
              fileName: item.name,
              fullPath: item.fullPath,
              acta: idx.acta,
              actaDigits,
              codigoCliente: m.codigoCliente,
              cliente: m.cliente,
            });
            return;
          }
          okSeenByActaDigits.add(actaDigits);
          okActasDetectadas.add(actaDigits);
          okDentroFecha.push({
            fileName: item.name,
            fullPath: item.fullPath,
            acta: idx.acta,
            codigoCliente: m.codigoCliente,
            cliente: m.cliente,
            fechaOrdenYmd: m.fechaOrdenYmd,
            fechaInstalacionYmd: m.fechaInstalacionYmd,
          });
        } else {
          okFueraFechaRaw.push({ fileName: item.name, fullPath: item.fullPath, acta: idx.acta, actaDigits });
        }
      }
    });

    const hintsByActaDigits = new Map<string, string[]>();
    const actasFueraUnicas = Array.from(new Set(okFueraFechaRaw.map((x) => x.actaDigits))).slice(0, 100);
    await Promise.all(
      actasFueraUnicas.map(async (digits) => {
        const hints = await lookupActaDateHints(normalizeActa(digits)).catch(() => []);
        hintsByActaDigits.set(digits, hints);
      })
    );

    const okFueraFecha: Array<{
      fileName: string;
      fullPath: string;
      acta: string;
      fechasSugeridas: string[];
    }> = [];
    okFueraFechaRaw.forEach((x) => {
      const fechasSugeridas = hintsByActaDigits.get(x.actaDigits) || [];
      if (fechasSugeridas.includes(dateFolder)) {
        if (okSeenByActaDigits.has(x.actaDigits)) {
          okDuplicatesRaw.push({
            fileName: x.fileName,
            fullPath: x.fullPath,
            acta: x.acta,
            actaDigits: x.actaDigits,
            codigoCliente: "-",
            cliente: "-",
          });
          return;
        }
        okSeenByActaDigits.add(x.actaDigits);
        okActasDetectadas.add(x.actaDigits);
        okDentroFecha.push({
          fileName: x.fileName,
          fullPath: x.fullPath,
          acta: x.acta,
          codigoCliente: "-",
          cliente: "-",
          fechaOrdenYmd: dateFolder,
          fechaInstalacionYmd: dateFolder,
        });
      } else {
        okFueraFecha.push({
          fileName: x.fileName,
          fullPath: x.fullPath,
          acta: x.acta,
          fechasSugeridas,
        });
      }
    });

    const sobrantes = [
      ...okDuplicatesRaw.map((x) => ({
        fileName: x.fileName,
        fullPath: x.fullPath,
        tipo: "duplicada" as const,
        acta: x.acta,
        fechasSugeridas: [] as string[],
        codigoCliente: x.codigoCliente,
        cliente: x.cliente,
      })),
      ...okFueraFecha.map((x) => ({
        fileName: x.fileName,
        fullPath: x.fullPath,
        tipo: "fuera_fecha" as const,
        acta: x.acta,
        fechasSugeridas: x.fechasSugeridas,
        codigoCliente: "",
        cliente: "",
      })),
      ...okSinTrazabilidad.map((x) => ({
        fileName: x.fileName,
        fullPath: x.fullPath,
        tipo: "sin_trazabilidad" as const,
        acta: "",
        fechasSugeridas: [] as string[],
        codigoCliente: "",
        cliente: "",
      })),
    ].sort((a, b) => a.fileName.localeCompare(b.fileName, "es", { sensitivity: "base" }));

    const faltantes = Array.from(daySnapshot.byActaDigits.entries())
      .filter(([actaDigits]) => !okActasDetectadas.has(actaDigits))
      .map(([, rows]) => rows[0])
      .sort((a, b) => a.acta.localeCompare(b.acta, "es", { sensitivity: "base" }))
      .map((row) => ({
        id: row.id,
        acta: row.acta,
        codigoCliente: row.codigoCliente,
        cliente: row.cliente,
        fechaOrdenYmd: row.fechaOrdenYmd,
        fechaInstalacionYmd: row.fechaInstalacionYmd,
      }));

    const stats: DayStats = {
      instalacionesDia: daySnapshot.instalacionesDia,
      actasOkDia: okFiles.length,
      faltanActas: Math.max(0, daySnapshot.instalacionesDia - okFiles.length),
      sobranActas: Math.max(0, okFiles.length - daySnapshot.instalacionesDia),
    };

    return NextResponse.json({
      ok: true,
      dateFolder,
      inbox,
      okFiles,
      errorFiles,
      stats,
      actaAudit: {
        summary: {
          esperadasConActa: daySnapshot.instalacionesConActa.length,
          instalacionesSinActa: daySnapshot.instalacionesSinActa.length,
          okConActa: okFiles.length - okSinTrazabilidad.length,
          okDentroFecha: okDentroFecha.length,
          okFueraFecha: okFueraFecha.length,
          sobrantes: sobrantes.length,
          faltantes: faltantes.length,
          okSinTrazabilidad: okSinTrazabilidad.length,
        },
        okDentroFecha,
        okFueraFecha,
        sobrantes,
        faltantes,
        sinActa: daySnapshot.instalacionesSinActa,
        okSinTrazabilidad,
      },
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
    const baseRequestId = sanitizeRequestId(String(form.get("requestId") || ""));
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

    const runId = buildRunId(session.uid, dateFolder, baseRequestId);

    const bucket = adminStorageBucket();
    const uploaded: Array<{
      originalName: string;
      acta: string | null;
      source: "pdf_text" | "det_engine" | "ai_pdf" | null;
      status: "ok" | "error";
      finalPath: string;
      finalName: string;
      reason: string;
      detail: string;
      attempts: number;
      trace: DetectionTraceStep[];
      durationMs: number;
    }> = [];

    for (let idx = 0; idx < rawFiles.length; idx += 1) {
        const file = rawFiles[idx];
        const fileStartedAt = Date.now();
        const requestId = sanitizeRequestId(
          rawFiles.length === 1
            ? baseRequestId
            : `${baseRequestId || `r_${Date.now().toString(36)}`}_${String(idx + 1)}`
        );
        const originalName = String(file.name || "archivo.pdf");
      if (requestId) {
        await writeProgress(requestId, {
          status: "processing",
          dateFolder,
          fileName: originalName,
          stageKey: "upload_precheck",
          stageLabel: "Validando archivo",
          stageStatus: "running",
          useAi: false,
          startedAt: new Date().toISOString(),
        });
      }
      const isPdf = originalName.toLowerCase().endsWith(".pdf") || String(file.type || "").toLowerCase().includes("pdf");
      if (!isPdf) {
        const row = {
          originalName,
          acta: null,
          source: null,
          status: "error" as const,
          finalPath: "",
          finalName: "",
          reason: "NO_PDF",
          detail: "El archivo no es PDF",
          attempts: 0,
          trace: [],
          durationMs: Date.now() - fileStartedAt,
        };
        uploaded.push(row);
        if (requestId) {
          await writeProgress(requestId, {
            status: "error",
            stageKey: "upload_precheck",
            stageLabel: "Validando archivo",
            stageStatus: "error",
            detail: row.detail,
            durationMs: row.durationMs,
            useAi: false,
            completedAt: new Date().toISOString(),
          });
        }
        continue;
      }
      const fileBytes = Number(file.size || 0);
      if (!fileBytes || fileBytes > MAX_PDF_BYTES) {
        const row = {
          originalName,
          acta: null,
          source: null,
          status: "error" as const,
          finalPath: "",
          finalName: "",
          reason: "PDF_SIZE_INVALID",
          detail: `El PDF debe tener tamaño entre 1 byte y ${Math.floor(MAX_PDF_BYTES / (1024 * 1024))} MB`,
          attempts: 0,
          trace: [],
          durationMs: Date.now() - fileStartedAt,
        };
        uploaded.push(row);
        if (requestId) {
          await writeProgress(requestId, {
            status: "error",
            stageKey: "upload_precheck",
            stageLabel: "Validando archivo",
            stageStatus: "error",
            detail: row.detail,
            durationMs: row.durationMs,
            useAi: false,
            completedAt: new Date().toISOString(),
          });
        }
        continue;
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const fileHash = hashBuffer(buffer);
      const lockId = buildFileLockId(dateFolder, fileHash);
      if (requestId) {
        await writeProgress(requestId, {
          fileHash,
          stageKey: "cache_lookup",
          stageLabel: "Buscando en cache",
          stageStatus: "running",
          useAi: false,
        });
      }
      const cached = await loadCachedResult(dateFolder, fileHash);
      if (cached) {
        const cachedRow = {
          originalName,
          ...cached,
          attempts: 0,
          trace: [],
          durationMs: Date.now() - fileStartedAt,
        };
        uploaded.push(cachedRow);
        if (requestId) {
          await writeProgress(requestId, {
            status: cachedRow.status,
            stageKey: "cache_lookup",
            stageLabel: "Buscando en cache",
            stageStatus: "done",
            detail: "Resultado recuperado por cache hash",
            durationMs: cachedRow.durationMs,
            source: cachedRow.source,
            reason: "IDEMPOTENTE_CACHE",
            useAi: false,
            completedAt: new Date().toISOString(),
          });
        }
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

      const lock = await acquireFileLock({
        lockId,
        dateFolder,
        fileHash,
        uid: session.uid,
        runId,
        requestId,
        fileName: originalName,
      });
      if (!lock.ok) {
        const cachedAfterLock = await loadCachedResult(dateFolder, fileHash);
        if (cachedAfterLock) {
          const cachedRow = {
            originalName,
            ...cachedAfterLock,
            attempts: 0,
            trace: [],
            durationMs: Date.now() - fileStartedAt,
          };
          uploaded.push(cachedRow);
          if (requestId) {
            await writeProgress(requestId, {
              status: cachedRow.status,
              stageKey: "cache_lookup",
              stageLabel: "Buscando en cache",
              stageStatus: "done",
              detail: "Resultado recuperado por cache hash",
              durationMs: cachedRow.durationMs,
              source: cachedRow.source,
              reason: "IDEMPOTENTE_CACHE",
              useAi: false,
              completedAt: new Date().toISOString(),
            });
          }
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
        const row = {
          originalName,
          acta: null,
          source: null,
          status: "error" as const,
          finalPath: "",
          finalName: "",
          reason: "ALREADY_PROCESSING",
          detail: "El archivo ya se esta procesando en otra pestana. Reintenta en unos segundos.",
          attempts: 0,
          trace: [],
          durationMs: Date.now() - fileStartedAt,
        };
        uploaded.push(row);
        if (requestId) {
          await writeProgress(requestId, {
            status: "error",
            stageKey: "cache_lookup",
            stageLabel: "Buscando en cache",
            stageStatus: "error",
            detail: row.detail,
            reason: row.reason,
            durationMs: row.durationMs,
            useAi: false,
            completedAt: new Date().toISOString(),
          });
        }
        await writeProcessLog({
          dateFolder,
          fileName: originalName,
          fileHash,
          status: row.status,
          source: row.source,
          reason: row.reason,
          detail: row.detail,
          durationMs: row.durationMs,
          fromCache: false,
        });
        continue;
      }

      try {
        const safeOriginal = ensurePdfName(originalName);
        const inboxDir = `${ROOT_PREFIX}/inbox/${dateFolder}`;
        const inboxPath = await ensureUniqueDestinationPath(bucket, inboxDir, safeOriginal);
        if (requestId) {
          await writeProgress(requestId, {
            stageKey: "upload_storage",
            stageLabel: "Subiendo PDF a Storage",
            stageStatus: "running",
            useAi: false,
          });
        }

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

        if (requestId) {
          await writeProgress(requestId, {
            stageKey: "classify",
            stageLabel: "Clasificando acta",
            stageStatus: "running",
            useAi: false,
          });
        }

        const processed = await autoClassifyUploaded(bucket, inboxPath, safeOriginal, dateFolder, buffer, async (update) => {
          if (!requestId) return;
          await writeProgress(requestId, {
            status: "processing",
            stageKey: update.stageKey,
            stageLabel: update.stageLabel,
            stageStatus: update.stageStatus,
            detail: update.detail || "",
            stageDurationMs: Number(update.durationMs || 0),
            useAi: Boolean(update.useAi),
          });
        });
        const row = {
          originalName,
          ...processed,
          durationMs: Date.now() - fileStartedAt,
        };
        uploaded.push(row);
        if (requestId) {
          const usedAi = row.source === "ai_pdf" || (row.trace || []).some((x) => x.stage.startsWith("ai_"));
          await writeProgress(requestId, {
            status: row.status,
            stageKey: "completed",
            stageLabel: row.status === "ok" ? "Completado" : "Completado con error",
            stageStatus: row.status === "ok" ? "done" : "error",
            detail: row.detail,
            source: row.source,
            reason: row.reason,
            useAi: usedAi,
            attempts: row.attempts,
            trace: row.trace,
            durationMs: row.durationMs,
            finalPath: row.finalPath,
            completedAt: new Date().toISOString(),
          });
        }
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
          durationMs: row.durationMs,
          attempts: row.attempts,
          trace: row.trace,
          fromCache: false,
        });
      } finally {
        await releaseFileLock({ lockId, runId });
      }
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
    const action = String(body?.action || "").trim();
    const dateFolder = normalizeDateFolder(String(body?.dateFolder || ""));
    const fromPath = String(body?.fromPath || "").trim();
    const requestId = sanitizeRequestId(String(body?.requestId || ""));

    if (action === "move_ok_to_date") {
      const toDateFolder = normalizeDateFolder(String(body?.toDateFolder || ""));
      if (!dateFolder || !toDateFolder) {
        return NextResponse.json({ ok: false, error: "DATE_REQUIRED_YYYY_MM_DD" }, { status: 400 });
      }
      if (!fromPath || !isAllowedPath(fromPath)) {
        return NextResponse.json({ ok: false, error: "INVALID_SOURCE_PATH" }, { status: 400 });
      }
      const split = splitPath(fromPath);
      if (split.folder !== "ok" || split.dateFolder !== dateFolder) {
        return NextResponse.json({ ok: false, error: "SOURCE_MUST_BE_OK_OF_DATE" }, { status: 400 });
      }
      if (toDateFolder === dateFolder) {
        return NextResponse.json({ ok: false, error: "TARGET_DATE_MUST_DIFFERENT" }, { status: 400 });
      }

      const bucket = adminStorageBucket();
      const srcFile = bucket.file(fromPath);
      const [exists] = await srcFile.exists();
      if (!exists) return NextResponse.json({ ok: false, error: "SOURCE_NOT_FOUND" }, { status: 404 });

      const dstPath = await ensureUniqueDestinationPath(bucket, `${ROOT_PREFIX}/ok/${toDateFolder}`, split.fileName);
      await srcFile.move(dstPath);
      await relinkIndexFinalPath({
        fromPath,
        toPath: dstPath,
        status: "ok",
        reason: "MOVE_OK_TO_OK_SUGGESTED_DATE",
      }).catch(() => 0);

      return NextResponse.json({
        ok: true,
        fromPath,
        toPath: dstPath,
        toName: splitPath(dstPath).fileName,
        toDateFolder,
      });
    }

    if (action === "move_ok_to_error") {
      if (!dateFolder) {
        return NextResponse.json({ ok: false, error: "DATE_REQUIRED_YYYY_MM_DD" }, { status: 400 });
      }
      if (!fromPath || !isAllowedPath(fromPath)) {
        return NextResponse.json({ ok: false, error: "INVALID_SOURCE_PATH" }, { status: 400 });
      }
      const split = splitPath(fromPath);
      if (split.folder !== "ok" || split.dateFolder !== dateFolder) {
        return NextResponse.json({ ok: false, error: "SOURCE_MUST_BE_OK_OF_DATE" }, { status: 400 });
      }

      const bucket = adminStorageBucket();
      const srcFile = bucket.file(fromPath);
      const [exists] = await srcFile.exists();
      if (!exists) return NextResponse.json({ ok: false, error: "SOURCE_NOT_FOUND" }, { status: 404 });

      const dstPath = await ensureUniqueDestinationPath(bucket, `${ROOT_PREFIX}/error/${dateFolder}`, split.fileName);
      await srcFile.move(dstPath);
      await relinkIndexFinalPath({
        fromPath,
        toPath: dstPath,
        status: "error",
        reason: "MOVE_OK_TO_ERROR_MANUAL",
      }).catch(() => 0);

      return NextResponse.json({
        ok: true,
        fromPath,
        toPath: dstPath,
        toName: splitPath(dstPath).fileName,
      });
    }

    if (action === "move_error_to_inbox") {
      if (!dateFolder) {
        return NextResponse.json({ ok: false, error: "DATE_REQUIRED_YYYY_MM_DD" }, { status: 400 });
      }
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

      const dstPath = await ensureUniqueDestinationPath(bucket, `${ROOT_PREFIX}/inbox/${dateFolder}`, split.fileName);
      await srcFile.move(dstPath);
      await relinkIndexFinalPath({
        fromPath,
        toPath: dstPath,
        status: "error",
        reason: "MOVE_ERROR_TO_INBOX_MANUAL",
      }).catch(() => 0);

      return NextResponse.json({
        ok: true,
        fromPath,
        toPath: dstPath,
        toName: splitPath(dstPath).fileName,
      });
    }

    if (action === "reprocess_inbox") {
      if (!dateFolder) return NextResponse.json({ ok: false, error: "DATE_REQUIRED_YYYY_MM_DD" }, { status: 400 });
      if (!fromPath || !isAllowedPath(fromPath)) {
        return NextResponse.json({ ok: false, error: "INVALID_SOURCE_PATH" }, { status: 400 });
      }
      const split = splitPath(fromPath);
      if (split.folder !== "inbox" || split.dateFolder !== dateFolder) {
        return NextResponse.json({ ok: false, error: "SOURCE_MUST_BE_INBOX_OF_DATE" }, { status: 400 });
      }

      const bucket = adminStorageBucket();
      const srcFile = bucket.file(fromPath);
      const [exists] = await srcFile.exists();
      if (!exists) return NextResponse.json({ ok: false, error: "SOURCE_NOT_FOUND" }, { status: 404 });

      const [buffer] = await srcFile.download();
      const fileHash = hashBuffer(buffer);
      const fileName = ensurePdfName(split.fileName || "archivo.pdf");
      const result = await autoClassifyUploaded(bucket, fromPath, fileName, dateFolder, buffer);
      await saveResultIndex(dateFolder, fileHash, result).catch(() => undefined);
      if (result.finalPath !== fromPath) {
        await relinkIndexFinalPath({
          fromPath,
          toPath: result.finalPath,
          status: result.status,
          reason: result.status === "ok" ? "REPROCESS_INBOX_OK" : "REPROCESS_INBOX_ERROR",
        }).catch(() => 0);
      }

      return NextResponse.json({ ok: true, mode: "reprocess_inbox", result });
    }

    if (action === "delete_inbox") {
      if (!dateFolder) return NextResponse.json({ ok: false, error: "DATE_REQUIRED_YYYY_MM_DD" }, { status: 400 });
      if (!fromPath || !isAllowedPath(fromPath)) {
        return NextResponse.json({ ok: false, error: "INVALID_SOURCE_PATH" }, { status: 400 });
      }
      const split = splitPath(fromPath);
      if (split.folder !== "inbox" || split.dateFolder !== dateFolder) {
        return NextResponse.json({ ok: false, error: "SOURCE_MUST_BE_INBOX_OF_DATE" }, { status: 400 });
      }

      const bucket = adminStorageBucket();
      const srcFile = bucket.file(fromPath);
      const [exists] = await srcFile.exists();
      if (!exists) return NextResponse.json({ ok: false, error: "SOURCE_NOT_FOUND" }, { status: 404 });

      await srcFile.delete();

      return NextResponse.json({
        ok: true,
        fromPath,
        deleted: true,
      });
    }

    if (action === "reprocess_ok") {
      if (!dateFolder) return NextResponse.json({ ok: false, error: "DATE_REQUIRED_YYYY_MM_DD" }, { status: 400 });
      if (!fromPath || !isAllowedPath(fromPath)) {
        return NextResponse.json({ ok: false, error: "INVALID_SOURCE_PATH" }, { status: 400 });
      }
      const split = splitPath(fromPath);
      if (split.folder !== "ok" || split.dateFolder !== dateFolder) {
        return NextResponse.json({ ok: false, error: "SOURCE_MUST_BE_OK_OF_DATE" }, { status: 400 });
      }

      const bucket = adminStorageBucket();
      const srcFile = bucket.file(fromPath);
      const [exists] = await srcFile.exists();
      if (!exists) return NextResponse.json({ ok: false, error: "SOURCE_NOT_FOUND" }, { status: 404 });

      const tempInboxPath = await ensureUniqueDestinationPath(bucket, `${ROOT_PREFIX}/inbox/${dateFolder}`, split.fileName);
      await srcFile.move(tempInboxPath);

      const [buffer] = await bucket.file(tempInboxPath).download();
      const fileHash = hashBuffer(buffer);
      const fileName = ensurePdfName(split.fileName || "archivo.pdf");
      const result = await autoClassifyUploaded(bucket, tempInboxPath, fileName, dateFolder, buffer);
      await saveResultIndex(dateFolder, fileHash, result).catch(() => undefined);
      await relinkIndexFinalPath({
        fromPath,
        toPath: result.finalPath,
        status: result.status,
        reason: result.status === "ok" ? "REPROCESS_OK_OK" : "REPROCESS_OK_ERROR",
      }).catch(() => 0);

      return NextResponse.json({ ok: true, mode: "reprocess_ok", result });
    }

    if (action === "reprocess_rigorous") {
      if (!dateFolder) return NextResponse.json({ ok: false, error: "DATE_REQUIRED_YYYY_MM_DD" }, { status: 400 });
      if (!fromPath || !isAllowedPath(fromPath)) {
        return NextResponse.json({ ok: false, error: "INVALID_SOURCE_PATH" }, { status: 400 });
      }
      const split = splitPath(fromPath);
      if (split.folder !== "error" || split.dateFolder !== dateFolder) {
        return NextResponse.json({ ok: false, error: "SOURCE_MUST_BE_ERROR_OF_DATE" }, { status: 400 });
      }
      if (requestId) {
        await writeProgress(requestId, {
          status: "processing",
          dateFolder,
          fileName: split.fileName,
          stageKey: "rigorous_reprocess",
          stageLabel: "Reanalisis riguroso",
          stageStatus: "running",
          detail: "Omitiendo lectura rapida por texto embebido",
          useAi: false,
          startedAt: new Date().toISOString(),
        });
      }
      const bucket = adminStorageBucket();
      const srcFile = bucket.file(fromPath);
      const [buffer] = await srcFile.download();
      const fileHash = hashBuffer(buffer);
      const result = await reanalyzeErrorFileRigorous(bucket, fromPath, dateFolder, async (update) => {
        if (!requestId) return;
        await writeProgress(requestId, {
          status: "processing",
          stageKey: update.stageKey,
          stageLabel: update.stageLabel,
          stageStatus: update.stageStatus,
          detail: update.detail || "",
          stageDurationMs: Number(update.durationMs || 0),
          useAi: Boolean(update.useAi),
        });
      });
      await saveResultIndex(dateFolder, fileHash, result).catch(() => undefined);
      if (result.status === "ok" && result.finalPath !== fromPath) {
        await relinkIndexFinalPath({
          fromPath,
          toPath: result.finalPath,
          status: "ok",
          reason: "REPROCESS_RIGOROUS_OK",
        }).catch(() => 0);
      }
      if (requestId) {
        const usedAi = result.source === "ai_pdf" || (result.trace || []).some((x) => x.stage.startsWith("ai_"));
        await writeProgress(requestId, {
          status: result.status,
          stageKey: "completed",
          stageLabel: result.status === "ok" ? "Completado" : "Completado con error",
          stageStatus: result.status === "ok" ? "done" : "error",
          detail: result.detail,
          source: result.source,
          reason: result.reason,
          useAi: usedAi,
          attempts: result.attempts,
          trace: result.trace,
          durationMs: result.durationMs,
          finalPath: result.finalPath,
          completedAt: new Date().toISOString(),
        });
      }
      return NextResponse.json({ ok: true, mode: "rigorous", result });
    }

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
    const [buffer] = await srcFile.download();
    const fileHash = hashBuffer(buffer);
    const detected = await extractActaFromPdf(newName, buffer).catch(() => ({
      acta: null,
      source: null,
      detail: "",
      attempts: 0,
      trace: [],
    }));

    const dstPath = await ensureUniqueDestinationPath(bucket, `${ROOT_PREFIX}/ok/${dateFolder}`, newName);
    await srcFile.move(dstPath);
    if (detected?.acta) {
      await saveResultIndex(dateFolder, fileHash, {
        status: "ok",
        source: detected.source || null,
        acta: detected.acta,
        finalPath: dstPath,
        reason: "MOVE_ERROR_TO_OK_MANUAL",
      }).catch(() => undefined);
    }
    await relinkIndexFinalPath({
      fromPath,
      toPath: dstPath,
      status: "ok",
      reason: "MOVE_ERROR_TO_OK_MANUAL",
    }).catch(() => 0);

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
