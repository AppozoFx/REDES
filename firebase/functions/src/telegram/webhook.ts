import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret, defineString } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";

import { db, FieldValue } from "../lib/admin";
import { writeAudit } from "../lib/audit";
import { parseTelegramTemplate } from "./parser";
import { parseTelegramTemplateWithAI } from "./aiParser";
import {
  answerTelegramCallbackQuery,
  sendTelegramMessage,
} from "./telegramApi";

const TELEGRAM_BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN");
const TELEGRAM_WEBHOOK_SECRET = defineSecret("TELEGRAM_WEBHOOK_SECRET");
const TELEGRAM_ALLOWED_CHAT_IDS = defineString("TELEGRAM_ALLOWED_CHAT_IDS", {
  default: "",
});
const TELEGRAM_ALLOWED_USER_IDS = defineString("TELEGRAM_ALLOWED_USER_IDS", {
  default: "",
});
const OPENAI_API_KEY_PRELIQUIDACION = defineSecret("OPENAI_API_KEY_PRELIQUIDACION");
const OPENAI_PRELIQ_MODEL = defineString("OPENAI_PRELIQ_MODEL", {
  default: "gpt-4.1-mini",
});

const UPDATES_COLLECTION = "telegram_updates";
const PRELIQ_COLLECTION = "telegram_preliquidaciones";
const PRELIQ_RETRY_COLLECTION = "telegram_preliquidacion_retries";
const CUADRILLA_RESPONSABLES_COLLECTION = "telegram_cuadrilla_responsables";
const ORDENES_COLLECTION = "ordenes";
const FOUND_GUARDS_COLLECTION = "telegram_found_guards";
const PRELIQ_RETRY_MAX_ATTEMPTS = 10;
const PRELIQ_RETRY_INTERVAL_MS = 30 * 60 * 1000;
const PRELIQ_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;
const RESPONSABLE_CONFIDENCE_MIN_MENTION = 45;
const RESPONSABLE_SWITCH_CANDIDATE_MIN = 1;

type TelegramChat = { id?: number | string };
type TelegramFrom = {
  id?: number | string;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TelegramMessage = {
  message_id?: number;
  text?: string;
  caption?: string;
  photo?: unknown[];
  chat?: TelegramChat;
  from?: TelegramFrom;
};

type TelegramCallbackQuery = {
  id?: string;
  data?: string;
  from?: TelegramFrom;
  message?: TelegramMessage;
};

type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

type OrdenResumen = {
  pedido: string;
  cliente: string;
  fecha: string;
  tramo: string;
  cuadrillaId: string;
  cuadrillaNombre: string;
};
type ParsedTemplate = NonNullable<ReturnType<typeof parseTelegramTemplate>>;
type CuadrillaResponsableState = {
  key: string;
  currentUserId: string;
  currentDisplayName?: string;
  currentUsername?: string;
  confidence: number;
};

function isOrdenEstadoValido(estadoRaw: unknown): boolean {
  const estado = String(estadoRaw || "").trim().toUpperCase();
  return estado === "FINALIZADA" || estado === "INICIADA";
}

function isOrdenEstadoFinalizada(estadoRaw: unknown): boolean {
  return String(estadoRaw || "").trim().toUpperCase() === "FINALIZADA";
}

function normalizeTextKey(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function isTipoTrabaGarantia(tipoTrabaRaw: unknown): boolean {
  return normalizeTextKey(tipoTrabaRaw) === "GARANTIA";
}

function isOrdenConsiderada(orden: Record<string, unknown>): boolean {
  return isOrdenEstadoValido(orden.estado) && !isTipoTrabaGarantia(orden.tipoTraba);
}

function isValidTelegramSecretFormat(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,256}$/.test(value);
}

function parseAllowedChatIds(raw: string | undefined): string[] {
  return String(raw || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseAllowedUserIds(raw: string | undefined): Set<string> {
  return new Set(
    String(raw || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
  );
}

function toMillis(value: unknown): number {
  if (!value) return 0;
  if (typeof (value as any)?.toMillis === "function") {
    return Number((value as any).toMillis()) || 0;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeHm(v: unknown): string {
  const raw = String(v || "").trim();
  if (!raw) return "";
  const match = /(\d{1,2}):(\d{1,2})(?::\d{1,2})?/.exec(raw);
  if (!match) return raw.slice(0, 5);
  const hh = match[1].padStart(2, "0");
  const mm = match[2].padStart(2, "0");
  return `${hh}:${mm}`;
}

function resolveTramoNombre(...hmCandidates: Array<unknown>): string {
  for (const hmRaw of hmCandidates) {
    const hm = normalizeHm(hmRaw);
    if (hm === "08:00") return "Primer Tramo";
    if (hm === "12:00") return "Segundo Tramo";
    if (hm === "16:00") return "Tercer Tramo";
  }
  for (const hmRaw of hmCandidates) {
    const hm = normalizeHm(hmRaw);
    if (!/^\d{2}:\d{2}$/.test(hm)) continue;
    const [hTxt] = hm.split(":");
    const h = Number(hTxt);
    if (!Number.isFinite(h)) continue;
    if (h < 12) return "Primer Tramo";
    if (h < 16) return "Segundo Tramo";
    return "Tercer Tramo";
  }
  return "Tramo no definido";
}

function cleanValue(value: unknown): string {
  return String(value || "").replace(/`/g, "'").trim();
}

function normalizeDigits(value: unknown): string {
  return cleanValue(value).replace(/\D/g, "");
}

function normalizeAuditName(value: unknown): string {
  return cleanValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function isLikelyTemplateText(text: string): boolean {
  const normalized = normalizeTextKey(text);
  if (!normalized) return false;
  const keywordMatches = [
    "PEDIDO",
    "COD DE PEDIDO",
    "CODIGO DE PEDIDO",
    "CTO",
    "NAP",
    "PUERTO",
    "POTENCIA",
    "ONT",
    "MESH",
    "BOX",
    "FONO",
    "FONOWIN",
  ].filter((keyword) => normalized.includes(keyword)).length;
  return keywordMatches >= 2;
}

function cleanSeriesList(values: unknown, maxItems = 4): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(values) ? values : []) {
    const v = cleanValue(item);
    if (!v) continue;
    const key = v.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= maxItems) break;
  }
  return out;
}

function preliqDocId(pedido: string, ymd: string): string {
  const cleanPedido = cleanValue(pedido).replace(/[\/\\\s]+/g, "_");
  return `${cleanPedido}_${ymd}`;
}

function preliqRetryDocId(pedido: string): string {
  return cleanValue(pedido).replace(/[\/\\\s]+/g, "_");
}

function todayLimaYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function ymdFromLimaDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isValidYmd(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || "").trim());
}

function parseFlexibleDateToYmd(rawInput: string): string | null {
  const raw = String(rawInput || "").trim();
  if (!raw) return null;
  if (isValidYmd(raw)) return raw;

  const m = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/.exec(raw);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  let yy = Number(m[3]);
  if (!Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yy)) {
    return null;
  }
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  if (yy < 100) yy += 2000;
  const y = String(yy).padStart(4, "0");
  const mTxt = String(mm).padStart(2, "0");
  const dTxt = String(dd).padStart(2, "0");
  const out = `${y}-${mTxt}-${dTxt}`;
  return isValidYmd(out) ? out : null;
}

function normalizeYmdOrToday(v?: string): string {
  const parsed = parseFlexibleDateToYmd(String(v || ""));
  return parsed || todayLimaYmd();
}

function resolveOperacionYmdFromOrden(orden: Record<string, unknown>): string {
  const bySoli = parseFlexibleDateToYmd(cleanValue(orden.fSoliYmd || ""));
  if (bySoli) return bySoli;
  const byFechaFin = parseFlexibleDateToYmd(cleanValue(orden.fechaFinVisiYmd || ""));
  if (byFechaFin) return byFechaFin;
  return todayLimaYmd();
}

function buildOrdenResumen(orden: Record<string, unknown>): OrdenResumen {
  const pedido = cleanValue(orden.codiSeguiClien || orden.ordenId || "");
  const cliente = cleanValue(orden.cliente || "-");
  const fecha = cleanValue(orden.fSoliYmd || orden.fechaFinVisiYmd || "-");
  const tramo = resolveTramoNombre(orden.fSoliHm || "", orden.fechaFinVisiHm || "");
  const cuadrillaId = cleanValue(orden.cuadrillaId || "");
  const cuadrillaNombre = cleanValue(
    orden.cuadrillaNombre || orden.cuadrillaId || "SIN_CUADRILLA"
  );
  return { pedido, cliente, fecha, tramo, cuadrillaId, cuadrillaNombre };
}

function buildClienteLiquidadoBlock(args: {
  pedido: string;
  orden: Record<string, unknown>;
  ctoNap?: string;
  puerto?: string;
  potenciaCtoNapDbm?: string;
  snOnt?: string;
  meshes: string[];
  boxes: string[];
  snFono?: string;
  receptorDocumento?: string;
  receptorNombres?: string;
  receptorTelefono?: string;
}): string {
  const fecha = cleanValue(args.orden.fSoliYmd || args.orden.fechaFinVisiYmd || "-");
  const tramo = resolveTramoNombre(args.orden.fSoliHm || "", args.orden.fechaFinVisiHm || "");
  const cliente = cleanValue(args.orden.cliente || "-");
  const plan = cleanValue(args.orden.plan || args.orden.idenServi || "-");
  const direccion = cleanValue(args.orden.direccion || args.orden.direccion1 || "-");
  const cuadrilla = cleanValue(args.orden.cuadrillaNombre || args.orden.cuadrillaId || "-");
  const lines = [
    "CLIENTE LIQUIDADO",
    `CUADRILLA: ${cuadrilla}`,
    `Fecha: ${fecha || "-"}`,
    `Tramo: ${tramo}`,
    `Codigo: ${cleanValue(args.pedido)}`,
    `Cliente: ${cliente || "-"}`,
    `Plan: ${plan || "-"}`,
    `Direccion: ${direccion || "-"}`,
  ];

  if (args.snOnt) lines.push(`SN ONT: ${cleanValue(args.snOnt)}`);
  args.meshes.forEach((mesh, idx) => {
    lines.push(`SN MESH ${idx + 1}: ${cleanValue(mesh)}`);
  });
  args.boxes.forEach((box, idx) => {
    lines.push(`SN BOX ${idx + 1}: ${cleanValue(box)}`);
  });
  if (args.snFono) lines.push(`SN FONO: ${cleanValue(args.snFono)}`);
  if (args.ctoNap) lines.push(`Caja NAP/CTO: ${cleanValue(args.ctoNap)}`);
  if (args.puerto) lines.push(`Puerto: ${cleanValue(args.puerto)}`);
  if (args.potenciaCtoNapDbm) {
    lines.push(`Potencia CTO/NAP: ${cleanValue(args.potenciaCtoNapDbm)}`);
  }
  if (args.receptorDocumento) {
    lines.push(`DOCUMENTO DE CONTACTO RECEPTOR: ${cleanValue(args.receptorDocumento)}`);
  }
  if (args.receptorNombres) {
    lines.push(`NOMBRES DE CONTACTO RECEPTOR: ${cleanValue(args.receptorNombres)}`);
  }
  if (args.receptorTelefono) {
    lines.push(`TELÉFONO DE CONTACTO RECEPTOR: ${cleanValue(args.receptorTelefono)}`);
  }

  return `\`\`\`\n${lines.join("\n")}\n\`\`\``;
}

function pickIncomingMessage(update: TelegramUpdate): TelegramMessage | null {
  return (
    update.message ||
    update.edited_message ||
    update.channel_post ||
    update.edited_channel_post ||
    null
  );
}

function getIncomingText(message: TelegramMessage | null): string {
  return String(message?.text || message?.caption || "").trim();
}

function dedupeListByPedido(rows: OrdenResumen[]): OrdenResumen[] {
  const seen = new Set<string>();
  const out: OrdenResumen[] = [];
  for (const row of rows) {
    if (!row.pedido) continue;
    if (seen.has(row.pedido)) continue;
    seen.add(row.pedido);
    out.push(row);
  }
  return out;
}

function mergeSeries(primary: string[], secondary: string[], maxItems = 4): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of [...primary, ...secondary]) {
    const v = cleanValue(value);
    if (!v) continue;
    const key = v.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= maxItems) break;
  }
  return out;
}

function mergeParsedTemplate(base: ParsedTemplate, fromAi: ParsedTemplate): ParsedTemplate {
  const basePedido = cleanValue(base.pedido).replace(/\D/g, "");
  const aiPedido = cleanValue(fromAi.pedido).replace(/\D/g, "");
  return {
    pedido: basePedido || aiPedido,
    ctoNap: cleanValue(base.ctoNap || "") || cleanValue(fromAi.ctoNap || "") || undefined,
    puerto: cleanValue(base.puerto || "") || cleanValue(fromAi.puerto || "") || undefined,
    potenciaCtoNapDbm:
      cleanValue(base.potenciaCtoNapDbm || "") ||
      cleanValue(fromAi.potenciaCtoNapDbm || "") ||
      undefined,
    snOnt: cleanValue(base.snOnt || "") || cleanValue(fromAi.snOnt || "") || undefined,
    meshes: mergeSeries(base.meshes || [], fromAi.meshes || [], 4),
    boxes: mergeSeries(base.boxes || [], fromAi.boxes || [], 4),
    snFono: cleanValue(base.snFono || "") || cleanValue(fromAi.snFono || "") || undefined,
    receptorDocumento:
      cleanValue(base.receptorDocumento || "") ||
      cleanValue(fromAi.receptorDocumento || "") ||
      undefined,
    receptorNombres:
      cleanValue(base.receptorNombres || "") ||
      cleanValue(fromAi.receptorNombres || "") ||
      undefined,
    receptorTelefono:
      cleanValue(base.receptorTelefono || "") ||
      cleanValue(fromAi.receptorTelefono || "") ||
      undefined,
    rawText: cleanValue(base.rawText || fromAi.rawText || ""),
  };
}

function shouldAttemptAiEnrichment(rawText: string, parsed: ParsedTemplate | null): boolean {
  if (!parsed) return true;
  const text = String(rawText || "");
  const mentionsMesh = /\bmesh\b/i.test(text);
  const mentionsBox = /\b(?:winbox|sn\s*box|box)\b/i.test(text);
  const mentionsOnt = /\b(?:sn|s\s*\/\s*n|id)\s*ont\b/i.test(text);
  const mentionsFono = /\b(?:fono|fonowin)\b/i.test(text);

  if (mentionsMesh && (!Array.isArray(parsed.meshes) || parsed.meshes.length === 0)) return true;
  if (mentionsBox && (!Array.isArray(parsed.boxes) || parsed.boxes.length === 0)) return true;
  if (mentionsOnt && !cleanValue(parsed.snOnt || "")) return true;
  if (mentionsFono && !cleanValue(parsed.snFono || "")) return true;
  return false;
}

async function fetchOrdenByPedido(pedido: string): Promise<{
  id: string;
  data: Record<string, unknown>;
} | null> {
  const snap = await db
    .collection(ORDENES_COLLECTION)
    .where("codiSeguiClien", "==", pedido)
    .get();
  if (snap.empty) return null;

  const candidates = snap.docs
    .map((doc) => ({ id: doc.id, data: (doc.data() || {}) as Record<string, unknown> }))
    .filter((row) => isOrdenConsiderada(row.data));

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const aYmd = String(a.data.fSoliYmd || a.data.fechaFinVisiYmd || "");
    const bYmd = String(b.data.fSoliYmd || b.data.fechaFinVisiYmd || "");
    const byYmd = bYmd.localeCompare(aYmd);
    if (byYmd !== 0) return byYmd;
    const aHm = normalizeHm(a.data.fSoliHm || a.data.fechaFinVisiHm || "");
    const bHm = normalizeHm(b.data.fSoliHm || b.data.fechaFinVisiHm || "");
    return bHm.localeCompare(aHm);
  });

  return candidates[0];
}

async function fetchOrdenesFinalizadasDocsByYmd(
  ymd: string
): Promise<Array<Record<string, unknown>>> {
  let snap = await db
    .collection(ORDENES_COLLECTION)
    .where("fSoliYmd", "==", ymd)
    .limit(5000)
    .get();
  if (snap.empty) {
    // Fallback legado para ordenes antiguas sin fSoliYmd.
    snap = await db
      .collection(ORDENES_COLLECTION)
      .where("fechaFinVisiYmd", "==", ymd)
      .limit(5000)
      .get();
  }
  return snap.docs
    .map((doc) => (doc.data() || {}) as Record<string, unknown>)
    .filter((orden) => isOrdenConsiderada(orden) && isOrdenEstadoFinalizada(orden.estado));
}

async function fetchOrdenesFinalizadasByYmd(ymd: string): Promise<OrdenResumen[]> {
  const rows = (await fetchOrdenesFinalizadasDocsByYmd(ymd))
    .map((orden) => buildOrdenResumen(orden))
    .filter((row) => !!row.pedido);
  return dedupeListByPedido(rows);
}

async function fetchTelegramFoundByYmd(
  chatId: string,
  ymd: string
): Promise<OrdenResumen[]> {
  const ordenes = await fetchOrdenesFinalizadasDocsByYmd(ymd);
  const preliqSnap = await db
    .collection(PRELIQ_COLLECTION)
    .where("chatId", "==", chatId)
    .where("ymd", "==", ymd)
    .limit(5000)
    .get();
  const codigos = Array.from(
    new Set(
      ordenes
        .map((orden) => cleanValue(orden.codiSeguiClien || orden.ordenId || ""))
        .filter(Boolean)
    )
  );
  const instRefs = codigos.map((codigo) => db.collection("instalaciones").doc(codigo));
  const instSnaps = codigos.length ? await db.getAll(...instRefs) : [];
  const instMap = new Map<string, Record<string, unknown>>(
    instSnaps
      .filter((snap) => snap.exists)
      .map((snap) => [snap.id, (snap.data() || {}) as Record<string, unknown>])
  );

  const rows = ordenes
    .filter((orden) => {
      const codigo = cleanValue(orden.codiSeguiClien || orden.ordenId || "");
      const inst = codigo ? instMap.get(codigo) : null;
      const ordenLiquidada =
        String((orden.liquidacion as Record<string, unknown> | undefined)?.estado || "")
          .trim()
          .toUpperCase() === "LIQUIDADO" || !!orden.liquidadoAt;
      const instLiquidada =
        String((inst?.liquidacion as Record<string, unknown> | undefined)?.estado || "")
          .trim()
          .toUpperCase() === "LIQUIDADO" && !inst?.correccionPendiente;
      return ordenLiquidada || instLiquidada;
    })
    .map((orden) => buildOrdenResumen(orden))
    .filter((row) => !!row.pedido);

  const preliqRows = preliqSnap.docs
    .map((doc) => (doc.data() || {}) as Record<string, unknown>)
    .map((row) => ({
      pedido: cleanValue(row.pedido || ""),
      cliente: cleanValue(row.cliente || "-"),
      fecha: cleanValue(row.fecha || ymd),
      tramo: cleanValue(row.tramo || "Tramo no definido"),
      cuadrillaId: cleanValue(row.cuadrillaId || ""),
      cuadrillaNombre: cleanValue(row.cuadrillaNombre || "SIN_CUADRILLA"),
    }))
    .filter((row) => !!row.pedido);

  return dedupeListByPedido([...preliqRows, ...rows]);
}

function foundGuardDocId(chatId: string, pedido: string, ymd: string): string {
  const cleanChatId = cleanValue(chatId).replace(/[\/\\\s]+/g, "_");
  const cleanPedido = cleanValue(pedido).replace(/[\/\\\s]+/g, "_");
  return `${cleanChatId}_${cleanPedido}_${ymd}`;
}

async function tryAcquireFoundGuard(
  chatId: string,
  pedido: string,
  ymd: string
): Promise<boolean> {
  const ref = db.collection(FOUND_GUARDS_COLLECTION).doc(foundGuardDocId(chatId, pedido, ymd));
  let acquired = false;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      acquired = false;
      return;
    }
    tx.create(ref, {
      chatId,
      pedido,
      ymd,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    acquired = true;
  });
  return acquired;
}

async function releaseFoundGuard(chatId: string, pedido: string, ymd: string): Promise<void> {
  const ref = db.collection(FOUND_GUARDS_COLLECTION).doc(foundGuardDocId(chatId, pedido, ymd));
  try {
    await ref.delete();
  } catch {
    // No bloquear procesamiento por falla al liberar candado.
  }
}

function buildCuadrillaStatusMessage(args: {
  cuadrillaName: string;
  liquidated: OrdenResumen[];
  pending: OrdenResumen[];
}): string {
  const lines = [
    "CLIENTES LIQUIDADOS",
    `CUADRILLA: ${args.cuadrillaName}`,
    `${args.liquidated.length} LIQUIDADO${args.liquidated.length === 1 ? "" : "S"}`,
  ];
  if (!args.liquidated.length) lines.push("-");
  for (const row of args.liquidated) {
    lines.push(`${row.pedido} - ${row.cliente}`);
  }
  lines.push(`${args.pending.length} PENDIENTE${args.pending.length === 1 ? "" : "S"}`);
  if (!args.pending.length) lines.push("-");
  for (const row of args.pending) {
    lines.push(`${row.pedido} - ${row.cliente}`);
  }
  return `\`\`\`\n${lines.join("\n")}\n\`\`\``;
}

function groupRowsByCuadrilla(rows: OrdenResumen[]): Array<[string, OrdenResumen[]]> {
  const grouped = new Map<string, OrdenResumen[]>();
  for (const row of rows) {
    const key = row.cuadrillaNombre || row.cuadrillaId || "SIN_CUADRILLA";
    const list = grouped.get(key) || [];
    list.push(row);
    grouped.set(key, list);
  }
  return Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

function buildCuadrillaDetailBlocks(cuadrilla: string, rows: OrdenResumen[]): string[] {
  const sorted = [...rows].sort((a, b) => {
    const byDate = String(a.fecha || "").localeCompare(String(b.fecha || ""));
    if (byDate !== 0) return byDate;
    return String(a.pedido || "").localeCompare(String(b.pedido || ""));
  });

  const baseHeader = `CUADRILLA: ${cuadrilla}`;
  const lines = sorted.map((row) =>
    `${row.fecha} | ${row.tramo} | ${row.pedido} - ${row.cliente}`
  );

  const blocks: string[] = [];
  let current: string[] = [baseHeader];
  for (const line of lines) {
    const next = [...current, line];
    const wrapped = `\`\`\`\n${next.join("\n")}\n\`\`\``;
    if (wrapped.length <= 3500) {
      current = next;
      continue;
    }
    blocks.push(`\`\`\`\n${current.join("\n")}\n\`\`\``);
    current = [baseHeader, line];
  }
  if (current.length) blocks.push(`\`\`\`\n${current.join("\n")}\n\`\`\``);
  return blocks;
}

async function sendDetalleEnBloquesPorCuadrilla(args: {
  chatId: string;
  token: string;
  mode: "LIQUIDADAS" | "PENDIENTES";
  rows: OrdenResumen[];
  title: string;
}) {
  if (!args.rows.length) {
    await sendTelegramMessage({
      token: args.token,
      chatId: args.chatId,
      text: `\`\`\`\n${args.title}\nNo hay registros para hoy.\n\`\`\``,
    });
    return;
  }

  const grouped = groupRowsByCuadrilla(args.rows);
  await sendTelegramMessage({
    token: args.token,
    chatId: args.chatId,
    text: `${args.title}\nTotal ordenes: ${args.rows.length}\nTotal cuadrillas: ${grouped.length}`,
  });

  for (const [cuadrilla, rows] of grouped) {
    const blocks = buildCuadrillaDetailBlocks(cuadrilla, rows);
    for (const block of blocks) {
      await sendTelegramMessage({
        token: args.token,
        chatId: args.chatId,
        text: block,
      });
    }
  }
}

function cb(data: string, ymd: string): string {
  return `${data}|${ymd}`;
}

function summaryKeyboard(ymd: string): Record<string, unknown> {
  return {
    inline_keyboard: [[
      { text: "LIQUIDADAS", callback_data: cb("RESUMEN_LIQUIDADAS", ymd) },
      { text: "PENDIENTES", callback_data: cb("RESUMEN_PENDIENTES", ymd) },
    ]],
  };
}

function summaryActionsKeyboard(
  mode: "LIQUIDADAS" | "PENDIENTES",
  ymd: string
): Record<string, unknown> {
  const detailCb = mode === "LIQUIDADAS" ? "DETALLE_LIQUIDADAS" : "DETALLE_PENDIENTES";
  const helpCb = mode === "LIQUIDADAS" ? "AYUDA_CUADRILLA_LIQ" : "AYUDA_CUADRILLA_PEN";
  return {
    inline_keyboard: [[
      { text: "Ver detalle", callback_data: cb(detailCb, ymd) },
      { text: "Ver una cuadrilla", callback_data: cb(helpCb, ymd) },
    ]],
  };
}

function cuadrillaActionsKeyboard(cuadrilla: string, ymd: string): Record<string, unknown> {
  const q = encodeURIComponent(cuadrilla);
  return {
    inline_keyboard: [[
      { text: "Pendientes", callback_data: `CDET_PEN|${ymd}|${q}` },
      { text: "Liquidadas", callback_data: `CDET_LIQ|${ymd}|${q}` },
    ]],
  };
}

function normalizeKey(value: string): string {
  return normalizeTextKey(value);
}

function cuadrillaKeyAndLabel(input: {
  cuadrillaId?: unknown;
  cuadrillaNombre?: unknown;
}): { key: string; label: string } {
  const byId = cleanValue(input.cuadrillaId || "");
  const byName = cleanValue(input.cuadrillaNombre || "");
  const label = byName || byId || "SIN_CUADRILLA";
  const keySource = byId || byName || "";
  return { key: normalizeKey(keySource), label };
}

function cuadrillaResponsableDocIdFromKey(key: string): string {
  return encodeURIComponent(String(key || "").trim());
}

function buildTelegramDisplayName(args: {
  username?: string;
  firstName?: string;
  lastName?: string;
}): string {
  const username = cleanValue(args.username || "");
  if (username) return `@${username.replace(/^@+/, "")}`;
  const firstName = cleanValue(args.firstName || "");
  const lastName = cleanValue(args.lastName || "");
  const full = `${firstName} ${lastName}`.trim();
  return full || "Responsable";
}

async function upsertCuadrillaResponsableFromTemplate(params: {
  cuadrillaId?: string;
  cuadrillaNombre?: string;
  userId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
}) {
  const userId = cleanValue(params.userId || "");
  if (!userId) return;
  const target = cuadrillaKeyAndLabel({
    cuadrillaId: params.cuadrillaId,
    cuadrillaNombre: params.cuadrillaNombre,
  });
  if (!target.key) return;
  if (target.label === "SIN_CUADRILLA") return;

  const now = FieldValue.serverTimestamp();
  const ref = db
    .collection(CUADRILLA_RESPONSABLES_COLLECTION)
    .doc(cuadrillaResponsableDocIdFromKey(target.key));

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const state = (snap.data() || {}) as Record<string, unknown>;
    const currentUserId = cleanValue(state.currentUserId || "");
    const currentConfidence = Number(state.confidence || 0) || 0;
    const username = cleanValue(params.username || "");
    const displayName = buildTelegramDisplayName({
      username,
      firstName: params.firstName,
      lastName: params.lastName,
    });

    if (!currentUserId) {
      tx.set(
        ref,
        {
          key: target.key,
          label: target.label,
          currentUserId: userId,
          currentUsername: username || null,
          currentDisplayName: displayName,
          confidence: 70,
          lastSeenAt: now,
          createdAt: now,
          updatedAt: now,
          switchCount: 0,
        },
        { merge: true }
      );
      return;
    }

    if (currentUserId === userId) {
      tx.set(
        ref,
        {
          key: target.key,
          label: target.label,
          currentUsername: username || state.currentUsername || null,
          currentDisplayName: displayName || state.currentDisplayName || "Responsable",
          confidence: Math.min(100, Math.max(50, currentConfidence) + 10),
          lastSeenAt: now,
          updatedAt: now,
          candidateUserId: FieldValue.delete(),
          candidateUsername: FieldValue.delete(),
          candidateDisplayName: FieldValue.delete(),
          candidateCount: FieldValue.delete(),
          candidateFirstSeenAt: FieldValue.delete(),
        },
        { merge: true }
      );
      return;
    }

    const candidateUserId = cleanValue(state.candidateUserId || "");
    const previousCandidateCount = Number(state.candidateCount || 0) || 0;
    const nextCandidateCount =
      candidateUserId === userId ? previousCandidateCount + 1 : 1;

    const candidatePayload = {
      candidateUserId: userId,
      candidateUsername: username || null,
      candidateDisplayName: displayName,
      candidateCount: nextCandidateCount,
      candidateFirstSeenAt: now,
      confidence: Math.max(30, currentConfidence - 15),
      lastSeenAt: now,
      updatedAt: now,
      label: target.label,
    };

    if (nextCandidateCount >= RESPONSABLE_SWITCH_CANDIDATE_MIN) {
      tx.set(
        ref,
        {
          key: target.key,
          label: target.label,
          currentUserId: userId,
          currentUsername: username || null,
          currentDisplayName: displayName,
          previousUserId: currentUserId || null,
          previousSwitchedAt: now,
          confidence: 65,
          switchCount: FieldValue.increment(1),
          lastSeenAt: now,
          updatedAt: now,
          candidateUserId: FieldValue.delete(),
          candidateUsername: FieldValue.delete(),
          candidateDisplayName: FieldValue.delete(),
          candidateCount: FieldValue.delete(),
          candidateFirstSeenAt: FieldValue.delete(),
        },
        { merge: true }
      );
      return;
    }

    tx.set(ref, candidatePayload, { merge: true });
  });
}

async function fetchCuadrillaResponsablesByKeys(
  keys: string[]
): Promise<Map<string, CuadrillaResponsableState>> {
  const uniq = Array.from(new Set(keys.filter(Boolean)));
  const out = new Map<string, CuadrillaResponsableState>();
  if (!uniq.length) return out;
  const refs = uniq.map((key) =>
    db.collection(CUADRILLA_RESPONSABLES_COLLECTION).doc(cuadrillaResponsableDocIdFromKey(key))
  );
  const snaps = await db.getAll(...refs);
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const row = (snap.data() || {}) as Record<string, unknown>;
    const key = cleanValue(row.key || "");
    const currentUserId = cleanValue(row.currentUserId || "");
    const confidence = Number(row.confidence || 0) || 0;
    if (!key || !currentUserId) continue;
    out.set(key, {
      key,
      currentUserId,
      currentDisplayName: cleanValue(row.currentDisplayName || "") || undefined,
      currentUsername: cleanValue(row.currentUsername || "") || undefined,
      confidence,
    });
  }
  return out;
}

function buildResponsableMention(state?: CuadrillaResponsableState): string {
  if (!state || !state.currentUserId) return "Responsable: por confirmar";
  if (state.confidence < RESPONSABLE_CONFIDENCE_MIN_MENTION) return "Responsable: por confirmar";
  const label =
    cleanValue(state.currentDisplayName || "") ||
    cleanValue(state.currentUsername || "") ||
    "Responsable";
  const safeLabel = label.replace(/([_*`\[])/g, "\\$1");
  const safeUserId = encodeURIComponent(state.currentUserId);
  return `Responsable: [${safeLabel}](tg://user?id=${safeUserId})`;
}

function filterByCuadrilla(rows: OrdenResumen[], query: string): OrdenResumen[] {
  const q = normalizeKey(query);
  if (!q) return [];
  return rows.filter((row) => {
    const name = normalizeKey(row.cuadrillaNombre);
    const id = normalizeKey(row.cuadrillaId);
    return name === q || id === q || name.includes(q) || id.includes(q);
  });
}

function parseCuadrillaDetailCommand(
  text: string
): { mode: "LIQUIDADAS" | "PENDIENTES"; query: string } | null {
  const raw = String(text || "").trim();
  const m = /^(liquidadas|pendientes)\s+(.+)$/i.exec(raw);
  if (!m) return null;
  const mode = String(m[1]).toUpperCase() === "LIQUIDADAS" ? "LIQUIDADAS" : "PENDIENTES";
  const query = String(m[2] || "").trim();
  if (!query) return null;
  return { mode, query };
}

function parseModeDateOnlyCommand(
  text: string
): { mode: "LIQUIDADAS" | "PENDIENTES"; ymd: string } | null {
  const raw = String(text || "").trim();
  const m = /^(liquidadas|pendientes)(?:\s+(\S+))?$/i.exec(raw);
  if (!m) return null;
  const mode = String(m[1]).toUpperCase() === "LIQUIDADAS" ? "LIQUIDADAS" : "PENDIENTES";
  const dateRaw = String(m[2] || "").trim();
  const ymd = dateRaw ? parseFlexibleDateToYmd(dateRaw) : todayLimaYmd();
  if (!ymd) return null;
  return { mode, ymd };
}

function parseResumenCommand(text: string): string | null {
  const raw = String(text || "").trim();
  const m = /^resumen(?:\s+(\S+))?$/i.exec(raw);
  if (!m) return null;
  const dateRaw = String(m[1] || "");
  if (!dateRaw) return todayLimaYmd();
  return parseFlexibleDateToYmd(dateRaw);
}

function parseRetryPedidoCommand(text: string): string | null {
  const raw = String(text || "").trim();
  const m = /^(?:procesar|reintentar|retry)\s+pedido\s+(\d+)$/i.exec(raw);
  if (!m) return null;
  return cleanValue(m[1] || "").replace(/\D/g, "") || null;
}

function parseRetryAllCommand(text: string): boolean {
  const raw = String(text || "").trim();
  return /^(?:procesar|reintentar|retry)\s+(?:cola|pendientes|todos)$/i.test(raw);
}

function parseViewQueueCommand(text: string): boolean {
  const raw = String(text || "").trim();
  return /^ver\s+cola$/i.test(raw);
}

function parseBareCuadrillaCommand(text: string): { cuadrilla: string; ymd: string } | null {
  const raw = String(text || "").trim();
  const m = /^k\s*(\d+)\s+(moto|residencial)(?:\s+(\S+))?$/i.exec(raw);
  if (!m) return null;
  const ymd = normalizeYmdOrToday(String(m[3] || ""));
  return { cuadrilla: `K${m[1]} ${String(m[2]).toUpperCase()}`, ymd };
}

async function sendCuadrillaStatus(
  chatId: string,
  token: string,
  cuadrilla: string,
  ymd: string
) {
  const todayOrders = await fetchOrdenesFinalizadasByYmd(ymd);
  const foundToday = await fetchTelegramFoundByYmd(chatId, ymd);
  const byCuadrilla = (row: OrdenResumen) =>
    row.cuadrillaNombre === cuadrilla || row.cuadrillaId === cuadrilla;
  const liquidated = foundToday.filter(byCuadrilla);
  const liquidatedPedidos = new Set(liquidated.map((r) => r.pedido));
  const pending = todayOrders.filter((row) => byCuadrilla(row) && !liquidatedPedidos.has(row.pedido));
  const text = buildCuadrillaStatusMessage({
    cuadrillaName: cuadrilla,
    liquidated,
    pending,
  });
  await sendTelegramMessage({ token, chatId, text });
}

async function getResumenRows(
  chatId: string,
  mode: "LIQUIDADAS" | "PENDIENTES",
  ymd: string
): Promise<OrdenResumen[]> {
  const todayOrders = await fetchOrdenesFinalizadasByYmd(ymd);
  const foundToday = await fetchTelegramFoundByYmd(chatId, ymd);
  if (mode === "LIQUIDADAS") return foundToday;
  const foundSet = new Set(foundToday.map((row) => row.pedido));
  return todayOrders.filter((row) => !foundSet.has(row.pedido));
}

async function sendResumenCount(
  chatId: string,
  token: string,
  mode: "LIQUIDADAS" | "PENDIENTES",
  ymd: string,
  withActions = true
) {
  const rows = await getResumenRows(chatId, mode, ymd);
  const cuadrillas = new Set(rows.map((r) => r.cuadrillaNombre || r.cuadrillaId || "SIN_CUADRILLA"));
  const title = mode === "LIQUIDADAS" ? "ORDENES LIQUIDADAS" : "ORDENES PENDIENTES";
  const text = [
    `Fecha: ${ymd}`,
    `${title}: ${rows.length}`,
    `CUADRILLAS CON ${mode}: ${cuadrillas.size}`,
    withActions ? "Selecciona una opcion para ver detalle." : "",
  ].filter(Boolean).join("\n");
  await sendTelegramMessage({
    token,
    chatId,
    text,
    replyMarkup: withActions ? summaryActionsKeyboard(mode, ymd) : undefined,
  });
}

async function sendGlobalResumen(
  chatId: string,
  token: string,
  mode: "LIQUIDADAS" | "PENDIENTES",
  ymd: string
) {
  const rows = await getResumenRows(chatId, mode, ymd);
  const title = mode === "LIQUIDADAS" ? `CLIENTES LIQUIDADOS - ${ymd}` : `CLIENTES PENDIENTES - ${ymd}`;
  await sendDetalleEnBloquesPorCuadrilla({
    chatId,
    token,
    mode,
    rows,
    title,
  });
}

async function sendPendientesDetalladoPorCuadrilla(
  chatId: string,
  token: string,
  ymd: string
) {
  const pendingRows = await getResumenRows(chatId, "PENDIENTES", ymd);
  if (!pendingRows.length) return;

  const grouped = new Map<string, { label: string; rows: OrdenResumen[] }>();
  for (const row of pendingRows) {
    const target = cuadrillaKeyAndLabel({
      cuadrillaId: row.cuadrillaId,
      cuadrillaNombre: row.cuadrillaNombre,
    });
    const current = grouped.get(target.key) || { label: target.label, rows: [] };
    current.rows.push(row);
    grouped.set(target.key, current);
  }

  const responsables = await fetchCuadrillaResponsablesByKeys(Array.from(grouped.keys()));
  const sorted = Array.from(grouped.entries()).sort((a, b) =>
    a[1].label.localeCompare(b[1].label)
  );

  for (const [key, payload] of sorted) {
    const mention = buildResponsableMention(responsables.get(key));
    await sendTelegramMessage({
      token,
      chatId,
      text: `CUADRILLA: ${payload.label}\n${mention}`,
    });
    const blocks = buildCuadrillaDetailBlocks(payload.label, payload.rows);
    for (const block of blocks) {
      await sendTelegramMessage({ token, chatId, text: block });
    }
  }
}

async function sendResumenByCuadrilla(
  chatId: string,
  token: string,
  mode: "LIQUIDADAS" | "PENDIENTES",
  query: string,
  ymd: string
) {
  const rows = await getResumenRows(chatId, mode, ymd);
  const filtered = filterByCuadrilla(rows, query);
  const title = mode === "LIQUIDADAS" ? "LIQUIDADAS" : "PENDIENTES";
  if (!filtered.length) {
    await sendTelegramMessage({
      token,
      chatId,
      text: `No se encontraron ordenes ${title.toLowerCase()} para cuadrilla: ${query}`,
    });
    return;
  }
  await sendDetalleEnBloquesPorCuadrilla({
    chatId,
    token,
    mode,
    rows: filtered,
    title: `CLIENTES ${title} - ${ymd} - CUADRILLA ${query}`,
  });
}

async function registerAudit(params: {
  fromId: string;
  dedupeId: string;
  chatId: string;
  messageId: number;
  pedido: string;
  resultado: string;
}) {
  try {
    await writeAudit({
      actorUid: params.fromId ? `telegram:${params.fromId}` : "telegram:unknown",
      action: "TELEGRAM_TEMPLATE_PARSED",
      target: { collection: UPDATES_COLLECTION, id: params.dedupeId },
      meta: {
        chatId: params.chatId,
        messageId: params.messageId || null,
        fromId: params.fromId || null,
        pedido: params.pedido,
        resultado: params.resultado,
      },
    });
  } catch (error) {
    logger.error("telegram audit error", {
      error: String((error as Error)?.message || error),
      dedupeId: params.dedupeId,
    });
  }
}

async function upsertPreliquidacion(params: {
  chatId: string;
  fromId: string;
  pedido: string;
  ymd: string;
  orderDocId: string;
  orderMeta: OrdenResumen;
  parsed: NonNullable<ReturnType<typeof parseTelegramTemplate>>;
}) {
  const parsed = params.parsed;

  const docId = preliqDocId(params.pedido, params.ymd);
  const ref = db.collection(PRELIQ_COLLECTION).doc(docId);
  await ref.set(
    {
      pedido: params.pedido,
      ymd: params.ymd,
      chatId: params.chatId,
      fromId: params.fromId || null,
      orderDocId: params.orderDocId,
      cuadrillaId: params.orderMeta.cuadrillaId || null,
      cuadrillaNombre: params.orderMeta.cuadrillaNombre || null,
      cliente: params.orderMeta.cliente || null,
      fecha: params.orderMeta.fecha || null,
      tramo: params.orderMeta.tramo || null,
      preliquidacion: {
        snOnt: cleanValue(parsed.snOnt || "") || null,
        snMeshes: cleanSeriesList(parsed.meshes, 4),
        snBoxes: cleanSeriesList(parsed.boxes, 4),
        snFono: cleanValue(parsed.snFono || "") || null,
        rotuloNapCto: cleanValue(parsed.ctoNap || "") || null,
        puerto: cleanValue(parsed.puerto || "") || null,
        potenciaCtoNapDbm: cleanValue(parsed.potenciaCtoNapDbm || "") || null,
        receptorDocumento: cleanValue(parsed.receptorDocumento || "") || null,
        receptorNombres: cleanValue(parsed.receptorNombres || "") || null,
        receptorTelefono: cleanValue(parsed.receptorTelefono || "") || null,
        receptorDocumentoNorm: normalizeDigits(parsed.receptorDocumento || ""),
        receptorNombresNorm: normalizeAuditName(parsed.receptorNombres || ""),
        receptorTelefonoNorm: normalizeDigits(parsed.receptorTelefono || ""),
      },
      source: "TELEGRAM",
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

function parsedFromRecord(record: Record<string, unknown>): ReturnType<typeof parseTelegramTemplate> | null {
  const pedido = cleanValue(record.pedido || "").replace(/\D/g, "");
  if (!pedido) return null;
  return {
    pedido,
    ctoNap: cleanValue(record.ctoNap || "") || undefined,
    puerto: cleanValue(record.puerto || "") || undefined,
    potenciaCtoNapDbm: cleanValue(record.potenciaCtoNapDbm || "") || undefined,
    snOnt: cleanValue(record.snOnt || "") || undefined,
    meshes: cleanSeriesList(record.meshes, 4),
    boxes: cleanSeriesList(record.boxes, 4),
    snFono: cleanValue(record.snFono || "") || undefined,
    receptorDocumento: cleanValue(record.receptorDocumento || "") || undefined,
    receptorNombres: cleanValue(record.receptorNombres || "") || undefined,
    receptorTelefono: cleanValue(record.receptorTelefono || "") || undefined,
    rawText: cleanValue(record.rawText || ""),
  };
}

async function enqueuePreliqRetry(params: {
  pedido: string;
  chatId: string;
  fromId: string;
  ymd: string;
  parsed: NonNullable<ReturnType<typeof parseTelegramTemplate>>;
  reason: string;
}) {
  const docId = preliqRetryDocId(params.pedido);
  const ref = db.collection(PRELIQ_RETRY_COLLECTION).doc(docId);
  const nextRetryAt = new Date(Date.now() + PRELIQ_RETRY_INTERVAL_MS);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? (snap.data() as Record<string, unknown>) : {};
    const currentAttempts = Number(current.attempts || 0);
    const attempts = Number.isFinite(currentAttempts) ? currentAttempts + 1 : 1;

    tx.set(
      ref,
      {
        pedido: params.pedido,
        chatId: params.chatId,
        fromId: params.fromId || null,
        ymd: params.ymd,
        status: "PENDING_ORDER",
        attempts,
        nextRetryAt,
        lastError: params.reason,
        parsedFields: {
          pedido: params.parsed.pedido,
          ctoNap: params.parsed.ctoNap || null,
          puerto: params.parsed.puerto || null,
          potenciaCtoNapDbm: params.parsed.potenciaCtoNapDbm || null,
          snOnt: params.parsed.snOnt || null,
          meshes: params.parsed.meshes || [],
          boxes: params.parsed.boxes || [],
          snFono: params.parsed.snFono || null,
          receptorDocumento: params.parsed.receptorDocumento || null,
          receptorNombres: params.parsed.receptorNombres || null,
          receptorTelefono: params.parsed.receptorTelefono || null,
          rawText: params.parsed.rawText || "",
        },
        updatedAt: FieldValue.serverTimestamp(),
        // Mantener la primera creacion para cortar reintentos a las 24h.
        createdAt: current.createdAt || FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
}

async function clearPreliqRetry(pedido: string) {
  const ref = db.collection(PRELIQ_RETRY_COLLECTION).doc(preliqRetryDocId(pedido));
  try {
    await ref.delete();
  } catch {}
}

async function processPreliqRetryDoc(
  docSnap: FirebaseFirestore.QueryDocumentSnapshot,
  token: string,
  manualChatId?: string
): Promise<
  | { outcome: "FAILED_FINAL"; reason: string; pedido: string }
  | { outcome: "PENDING"; reason: string; pedido: string }
  | { outcome: "RESOLVED"; pedido: string; ymd: string }
> {
  const row = (docSnap.data() || {}) as Record<string, unknown>;
  const pedido = cleanValue(row.pedido || "");
  if (!pedido) {
    await docSnap.ref.set(
      {
        status: "FAILED_FINAL",
        lastError: "PEDIDO_EMPTY",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { outcome: "FAILED_FINAL", reason: "PEDIDO_EMPTY", pedido: "" };
  }

  const attempts = Number(row.attempts || 0);
  const createdAtMs = toMillis(row.createdAt);
  const expiredByWindow =
    createdAtMs > 0 && Date.now() - createdAtMs >= PRELIQ_RETRY_WINDOW_MS;
  if (expiredByWindow) {
    await docSnap.ref.set(
      {
        status: "FAILED_FINAL",
        lastError: "RETRY_WINDOW_EXPIRED",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { outcome: "FAILED_FINAL", reason: "RETRY_WINDOW_EXPIRED", pedido };
  }

  if (attempts >= PRELIQ_RETRY_MAX_ATTEMPTS) {
    await docSnap.ref.set(
      {
        status: "FAILED_FINAL",
        lastError: "MAX_ATTEMPTS_REACHED",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { outcome: "FAILED_FINAL", reason: "MAX_ATTEMPTS_REACHED", pedido };
  }

  const orderResult = await fetchOrdenByPedido(pedido);
  if (!orderResult) {
    const nextAttempts = attempts + 1;
    const failFinal = nextAttempts >= PRELIQ_RETRY_MAX_ATTEMPTS;
    await docSnap.ref.set(
      {
        attempts: nextAttempts,
        status: failFinal ? "FAILED_FINAL" : "PENDING_ORDER",
        lastError: "ORDER_NOT_FOUND",
        nextRetryAt: new Date(Date.now() + PRELIQ_RETRY_INTERVAL_MS),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return {
      outcome: failFinal ? "FAILED_FINAL" : "PENDING",
      reason: "ORDER_NOT_FOUND",
      pedido,
    };
  }

  const parsed = parsedFromRecord((row.parsedFields || {}) as Record<string, unknown>);
  if (!parsed) {
    await docSnap.ref.set(
      {
        status: "FAILED_FINAL",
        lastError: "PARSED_FIELDS_INVALID",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { outcome: "FAILED_FINAL", reason: "PARSED_FIELDS_INVALID", pedido };
  }

  const orderMeta = buildOrdenResumen(orderResult.data);
  const operacionYmd = resolveOperacionYmdFromOrden(orderResult.data);
  await upsertPreliquidacion({
    chatId: cleanValue(row.chatId || ""),
    fromId: cleanValue(row.fromId || ""),
    pedido,
    ymd: operacionYmd,
    orderDocId: orderResult.id,
    orderMeta,
    parsed,
  });
  await docSnap.ref.set(
    {
      status: "RESOLVED",
      resolvedAt: FieldValue.serverTimestamp(),
      orderDocId: orderResult.id,
      ymdResolved: operacionYmd,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const targetChatId = cleanValue(row.chatId || "");
  if (token && targetChatId) {
    const resumen = buildClienteLiquidadoBlock({
      pedido,
      orden: orderResult.data,
      ctoNap: parsed.ctoNap,
      puerto: parsed.puerto,
      potenciaCtoNapDbm: parsed.potenciaCtoNapDbm,
      snOnt: parsed.snOnt,
      meshes: parsed.meshes,
      boxes: parsed.boxes,
      snFono: parsed.snFono,
      receptorDocumento: parsed.receptorDocumento,
      receptorNombres: parsed.receptorNombres,
      receptorTelefono: parsed.receptorTelefono,
    });
    await sendTelegramMessage({
      token,
      chatId: targetChatId,
      text: resumen,
    });
    await sendTelegramMessage({
      token,
      chatId: targetChatId,
      text:
        `Orden ${pedido}: ya fue ubicada en el sistema y su preliquidacion se proceso automaticamente.\n` +
        "Gracias por su gestion.",
    });
  }

  if (manualChatId && manualChatId !== targetChatId) {
    await sendTelegramMessage({
      token,
      chatId: manualChatId,
      text:
        `Pedido ${pedido}: se encontro la orden y la preliquidacion ya fue procesada.\n` +
        `Fecha operativa: ${operacionYmd}.`,
    });
  }

  return { outcome: "RESOLVED", pedido, ymd: operacionYmd };
}

async function processPreliqRetryByPedido(
  pedido: string,
  token: string,
  manualChatId: string
): Promise<"NOT_QUEUED" | "PENDING" | "FAILED_FINAL" | "RESOLVED"> {
  const ref = db.collection(PRELIQ_RETRY_COLLECTION).doc(preliqRetryDocId(pedido));
  const snap = await ref.get();
  if (!snap.exists) return "NOT_QUEUED";
  const row = (snap.data() || {}) as Record<string, unknown>;
  const status = cleanValue(row.status || "");
  if (status === "RESOLVED") return "RESOLVED";
  const result = await processPreliqRetryDoc(
    snap as FirebaseFirestore.QueryDocumentSnapshot,
    token,
    manualChatId
  );
  return result.outcome === "PENDING"
    ? "PENDING"
    : result.outcome === "FAILED_FINAL"
      ? "FAILED_FINAL"
      : "RESOLVED";
}

async function processAllPendingPreliqRetries(
  token: string,
  manualChatId: string
): Promise<{
  total: number;
  resolved: string[];
  pending: string[];
  failed: string[];
}> {
  const snap = await db
    .collection(PRELIQ_RETRY_COLLECTION)
    .where("status", "==", "PENDING_ORDER")
    .limit(100)
    .get();

  const summary = {
    total: snap.size,
    resolved: [] as string[],
    pending: [] as string[],
    failed: [] as string[],
  };

  for (const docSnap of snap.docs) {
    try {
      const result = await processPreliqRetryDoc(docSnap, token, manualChatId);
      if (result.outcome === "RESOLVED") {
        summary.resolved.push(result.pedido);
      } else if (result.outcome === "PENDING") {
        summary.pending.push(result.pedido);
      } else {
        summary.failed.push(result.pedido);
      }
    } catch (error) {
      const row = (docSnap.data() || {}) as Record<string, unknown>;
      const attempts = Number(row.attempts || 0);
      const pedido = cleanValue(row.pedido || "");
      await docSnap.ref.set(
        {
          attempts: attempts + 1,
          status: attempts + 1 >= PRELIQ_RETRY_MAX_ATTEMPTS ? "FAILED_FINAL" : "PENDING_ORDER",
          lastError: String((error as Error)?.message || error),
          nextRetryAt: new Date(Date.now() + PRELIQ_RETRY_INTERVAL_MS),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      if (pedido) summary.failed.push(pedido);
    }
  }

  return summary;
}

async function viewPendingPreliqRetries(): Promise<{
  total: number;
  pedidos: Array<{ pedido: string; attempts: number; nextRetryAtMs: number }>;
}> {
  const snap = await db
    .collection(PRELIQ_RETRY_COLLECTION)
    .where("status", "==", "PENDING_ORDER")
    .limit(100)
    .get();

  const pedidos = snap.docs
    .map((docSnap) => {
      const row = (docSnap.data() || {}) as Record<string, unknown>;
      return {
        pedido: cleanValue(row.pedido || ""),
        attempts: Number(row.attempts || 0) || 0,
        nextRetryAtMs: toMillis(row.nextRetryAt),
      };
    })
    .filter((row) => row.pedido)
    .sort((a, b) => {
      if (a.nextRetryAtMs !== b.nextRetryAtMs) return a.nextRetryAtMs - b.nextRetryAtMs;
      return a.pedido.localeCompare(b.pedido);
    });

  return {
    total: pedidos.length,
    pedidos,
  };
}

async function handleCallback(update: TelegramUpdate, token: string) {
  const callback = update.callback_query;
  if (!callback) return;
  const callbackId = String(callback.id || "");
  const data = String(callback.data || "");
  const parts = data.split("|");
  const action = parts[0] || "";
  const ymd = normalizeYmdOrToday(parts[1] || "");
  const chatId = String(callback.message?.chat?.id || "");
  if (!callbackId || !chatId) return;

  await answerTelegramCallbackQuery({
    token,
    callbackQueryId: callbackId,
  });

  if (action === "RESUMEN_LIQUIDADAS") {
    await sendResumenCount(chatId, token, "LIQUIDADAS", ymd, true);
    return;
  }
  if (action === "RESUMEN_PENDIENTES") {
    await sendResumenCount(chatId, token, "PENDIENTES", ymd, true);
    await sendPendientesDetalladoPorCuadrilla(chatId, token, ymd);
    return;
  }
  if (action === "DETALLE_LIQUIDADAS") {
    await sendGlobalResumen(chatId, token, "LIQUIDADAS", ymd);
    return;
  }
  if (action === "DETALLE_PENDIENTES") {
    await sendGlobalResumen(chatId, token, "PENDIENTES", ymd);
    return;
  }
  if (action === "AYUDA_CUADRILLA_LIQ") {
    await sendTelegramMessage({
      token,
      chatId,
      text: `Escribe: K24 MOTO (hoy) o K24 MOTO 12/04/26`,
    });
    return;
  }
  if (action === "AYUDA_CUADRILLA_PEN") {
    await sendTelegramMessage({
      token,
      chatId,
      text: `Escribe: K24 MOTO (hoy) o K24 MOTO 12/04/26`,
    });
    return;
  }
  if (action === "CDET_PEN") {
    const query = decodeURIComponent(parts[2] || "").trim();
    if (query) await sendResumenByCuadrilla(chatId, token, "PENDIENTES", query, ymd);
    return;
  }
  if (action === "CDET_LIQ") {
    const query = decodeURIComponent(parts[2] || "").trim();
    if (query) await sendResumenByCuadrilla(chatId, token, "LIQUIDADAS", query, ymd);
  }
}

function isQueryCommandText(text: string): boolean {
  if (!text) return false;
  if (String(text).trim().toLowerCase() === "miid") return false;
  if (parseResumenCommand(text)) return true;
  if (parseRetryPedidoCommand(text)) return true;
  if (parseRetryAllCommand(text)) return true;
  if (parseViewQueueCommand(text)) return true;
  if (parseModeDateOnlyCommand(text)) return true;
  if (parseCuadrillaDetailCommand(text)) return true;
  if (parseBareCuadrillaCommand(text)) return true;
  return false;
}

export const telegramWebhook = onRequest(
  {
    region: "us-central1",
    secrets: [TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, OPENAI_API_KEY_PRELIQUIDACION],
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
      return;
    }

    const configuredSecret = TELEGRAM_WEBHOOK_SECRET.value();
    if (!isValidTelegramSecretFormat(configuredSecret)) {
      logger.error("TELEGRAM_WEBHOOK_SECRET invalido");
      res.status(200).json({ ok: true, ignored: "WEBHOOK_SECRET_INVALID" });
      return;
    }

    const headerSecret = String(req.header("x-telegram-bot-api-secret-token") || "");
    if (!headerSecret || headerSecret !== configuredSecret) {
      res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
      return;
    }

    const token = TELEGRAM_BOT_TOKEN.value();
    if (!token) {
      res.status(200).json({ ok: true, ignored: "BOT_TOKEN_EMPTY" });
      return;
    }

    const allowedChats = new Set(parseAllowedChatIds(TELEGRAM_ALLOWED_CHAT_IDS.value()));
    if (!allowedChats.size) {
      logger.warn("TELEGRAM_ALLOWED_CHAT_IDS vacio: se rechazan todos los chats");
      res.status(200).json({ ok: true, ignored: "NO_ALLOWED_CHATS" });
      return;
    }

    const update = (req.body || {}) as TelegramUpdate;
    const allowedUsers = parseAllowedUserIds(TELEGRAM_ALLOWED_USER_IDS.value());

    if (update.callback_query) {
      const callbackChatId = String(update.callback_query.message?.chat?.id || "");
      const callbackFromId = String(update.callback_query.from?.id || "");
      if (!allowedChats.has(callbackChatId)) {
        res.status(200).json({ ok: true, ignored: "CHAT_NOT_ALLOWED" });
        return;
      }
      if (allowedUsers.size > 0 && !allowedUsers.has(callbackFromId)) {
        await answerTelegramCallbackQuery({
          token,
          callbackQueryId: String(update.callback_query.id || ""),
          text: "No autorizado para consultas.",
        });
        res.status(200).json({ ok: true, ignored: "USER_NOT_ALLOWED_CALLBACK" });
        return;
      }
      await handleCallback(update, token);
      res.status(200).json({ ok: true, handled: "CALLBACK" });
      return;
    }

    const message = pickIncomingMessage(update);
    const chatId = String(message?.chat?.id || "");
    const messageId = Number(message?.message_id || 0);
    const updateId = Number(update.update_id || 0);
    const fromId = String(message?.from?.id || "");
    const text = getIncomingText(message);

    if (!message || !chatId || (!messageId && !updateId)) {
      res.status(200).json({ ok: true, ignored: "EMPTY_UPDATE" });
      return;
    }

    if (!allowedChats.has(chatId)) {
      res.status(200).json({ ok: true, ignored: "CHAT_NOT_ALLOWED" });
      return;
    }

    if (Array.isArray(message.photo) && message.photo.length > 0) {
      await sendTelegramMessage({
        token,
        chatId,
        text: "Solo se permite plantilla de finalizacion en texto.",
      });
      res.status(200).json({ ok: true, ignored: "PHOTO_NOT_ALLOWED" });
      return;
    }

    if (!text) {
      res.status(200).json({ ok: true, ignored: "NO_TEXT" });
      return;
    }

    if (text.trim().toLowerCase() === "miid") {
      await sendTelegramMessage({
        token,
        chatId,
        text: `Tu Telegram ID es: ${fromId || "NO_DISPONIBLE"}`,
      });
      res.status(200).json({ ok: true, handled: "MIID_CMD" });
      return;
    }

    if (allowedUsers.size > 0 && isQueryCommandText(text) && !allowedUsers.has(fromId)) {
      await sendTelegramMessage({
        token,
        chatId,
        text: "No autorizado para consultas.",
      });
      res.status(200).json({ ok: true, ignored: "USER_NOT_ALLOWED_QUERY" });
      return;
    }

    const resumenYmd = parseResumenCommand(text);
    if (resumenYmd) {
      await sendTelegramMessage({
        token,
        chatId,
        text: `Selecciona el tipo de resumen para la fecha ${resumenYmd}:`,
        replyMarkup: summaryKeyboard(resumenYmd),
      });
      res.status(200).json({ ok: true, handled: "RESUMEN_CMD" });
      return;
    }

    const retryPedido = parseRetryPedidoCommand(text);
    if (retryPedido) {
      const retryResult = await processPreliqRetryByPedido(retryPedido, token, chatId);
      if (retryResult === "NOT_QUEUED") {
        await sendTelegramMessage({
          token,
          chatId,
          text:
            `Pedido ${retryPedido}: no tiene un reproceso pendiente en cola.\n` +
            "Si la orden ya fue actualizada en base, puedes reenviar la plantilla.",
        });
      } else if (retryResult === "PENDING") {
        await sendTelegramMessage({
          token,
          chatId,
          text:
            `Pedido ${retryPedido}: aun no aparece en la base de ordenes.\n` +
            "Se mantendra en cola y se volvera a revisar automaticamente.",
        });
      } else if (retryResult === "FAILED_FINAL") {
        await sendTelegramMessage({
          token,
          chatId,
          text:
            `Pedido ${retryPedido}: el reproceso automatico ya termino sin encontrar la orden.\n` +
            "Revisa si el codigo de pedido en la base es exactamente el mismo.",
        });
      } else if (retryResult === "RESOLVED") {
        await sendTelegramMessage({
          token,
          chatId,
          text: `Orden ${retryPedido}: ya figura como preliquidada.`,
        });
      }
      res.status(200).json({ ok: true, handled: "RETRY_PEDIDO_CMD", retryResult });
      return;
    }

    if (parseRetryAllCommand(text)) {
      const summary = await processAllPendingPreliqRetries(token, chatId);
      if (summary.total === 0) {
        await sendTelegramMessage({
          token,
          chatId,
          text: "No hay pedidos pendientes en cola para reprocesar.",
        });
      } else {
        const lines = [
          "Reproceso manual de cola completado.",
          `Total revisados: ${summary.total}`,
          `Resueltos: ${summary.resolved.length}`,
          `Siguen pendientes: ${summary.pending.length}`,
          `Fallidos finales: ${summary.failed.length}`,
        ];
        if (summary.resolved.length) {
          lines.push(
            "Las ordenes resueltas ya fueron retiradas del conteo de pendientes y ahora figuran como liquidadas."
          );
        }
        if (summary.resolved.length) {
          lines.push(`Resueltos: ${summary.resolved.slice(0, 15).join(", ")}`);
        }
        if (summary.pending.length) {
          lines.push(`Pendientes: ${summary.pending.slice(0, 15).join(", ")}`);
        }
        if (summary.failed.length) {
          lines.push(`Fallidos: ${summary.failed.slice(0, 15).join(", ")}`);
        }
        if (
          summary.resolved.length > 15 ||
          summary.pending.length > 15 ||
          summary.failed.length > 15
        ) {
          lines.push("La lista fue recortada a 15 pedidos por grupo.");
        }
        await sendTelegramMessage({
          token,
          chatId,
          text: lines.join("\n"),
        });
      }
      res.status(200).json({ ok: true, handled: "RETRY_ALL_CMD", total: summary.total });
      return;
    }

    if (parseViewQueueCommand(text)) {
      const queue = await viewPendingPreliqRetries();
      if (queue.total === 0) {
        await sendTelegramMessage({
          token,
          chatId,
          text: "No hay pedidos pendientes en cola.",
        });
      } else {
        const lines = [
          `Pedidos pendientes en cola: ${queue.total}`,
          ...queue.pedidos.slice(0, 30).map((row) => {
            const nextRetryLabel = row.nextRetryAtMs
              ? new Intl.DateTimeFormat("es-PE", {
                  timeZone: "America/Lima",
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                }).format(new Date(row.nextRetryAtMs))
              : "sin fecha";
            return `Pedido ${row.pedido} | intentos: ${row.attempts} | proximo: ${nextRetryLabel}`;
          }),
        ];
        if (queue.total > 30) {
          lines.push("La lista fue recortada a 30 pedidos.");
        }
        await sendTelegramMessage({
          token,
          chatId,
          text: lines.join("\n"),
        });
      }
      res.status(200).json({ ok: true, handled: "VIEW_QUEUE_CMD", total: queue.total });
      return;
    }

    const modeDateCmd = parseModeDateOnlyCommand(text);
    if (modeDateCmd) {
      await sendResumenCount(
        chatId,
        token,
        modeDateCmd.mode,
        modeDateCmd.ymd,
        true
      );
      if (modeDateCmd.mode === "PENDIENTES") {
        await sendPendientesDetalladoPorCuadrilla(chatId, token, modeDateCmd.ymd);
      }
      res.status(200).json({ ok: true, handled: "MODE_DATE_CMD" });
      return;
    }

    const detailCmd = parseCuadrillaDetailCommand(text);
    if (detailCmd) {
      await sendResumenByCuadrilla(
        chatId,
        token,
        detailCmd.mode,
        detailCmd.query,
        todayLimaYmd()
      );
      res.status(200).json({ ok: true, handled: "CUADRILLA_DETAIL_CMD" });
      return;
    }

    const bareCuadrilla = parseBareCuadrillaCommand(text);
    if (bareCuadrilla) {
      await sendTelegramMessage({
        token,
        chatId,
        text: `Cuadrilla detectada: ${bareCuadrilla.cuadrilla}\nFecha: ${bareCuadrilla.ymd}\nElige el tipo de detalle.`,
        replyMarkup: cuadrillaActionsKeyboard(
          bareCuadrilla.cuadrilla,
          bareCuadrilla.ymd
        ),
      });
      res.status(200).json({ ok: true, handled: "BARE_CUADRILLA_CMD" });
      return;
    }

    const dedupeId = `${chatId}_${messageId || updateId}`;
    const updateRef = db.collection(UPDATES_COLLECTION).doc(dedupeId);
    let duplicated = false;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(updateRef);
      if (snap.exists) {
        duplicated = true;
        return;
      }
      tx.create(updateRef, {
        chatId,
        messageId: messageId || null,
        updateId: updateId || null,
        fromId: fromId || null,
        rawText: text,
        status: "PROCESSING",
        ymd: todayLimaYmd(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    if (duplicated) {
      res.status(200).json({ ok: true, ignored: "DUPLICATE_MESSAGE" });
      return;
    }

    let parsed = parseTelegramTemplate(text);
    let parseSource: "RULES" | "AI" | "RULES+AI" = "RULES";
    const aiKey = String(OPENAI_API_KEY_PRELIQUIDACION.value() || "").trim();
    const needsAi = shouldAttemptAiEnrichment(text, parsed);
    if (needsAi && aiKey) {
      try {
        const aiParsed = await parseTelegramTemplateWithAI({
          apiKey: aiKey,
          text,
          model: OPENAI_PRELIQ_MODEL.value(),
        });
        if (aiParsed) {
          if (parsed) {
            parsed = mergeParsedTemplate(parsed, aiParsed);
            parseSource = "RULES+AI";
          } else {
            parsed = aiParsed;
            parseSource = "AI";
          }
        }
      } catch (error) {
        logger.error("telegram ai parser error", {
          error: String((error as Error)?.message || error),
          chatId,
        });
      }
    }
    if (!parsed) {
      if (isLikelyTemplateText(text)) {
        await sendTelegramMessage({
          token,
          chatId,
          text:
            "No pude identificar el codigo de pedido en la plantilla.\n" +
            "Por favor verifica que incluya 'Pedido' o 'Cod. de Pedido' con su numero.",
        });
      }
      await updateRef.set(
        {
          status: "IGNORED",
          reason: "NO_TEMPLATE_OR_PEDIDO",
          parseSource: "NONE",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      res.status(200).json({ ok: true, ignored: "NO_TEMPLATE_OR_PEDIDO" });
      return;
    }

    const ymd = todayLimaYmd();
    const orderResult = await fetchOrdenByPedido(parsed.pedido);
    if (!orderResult) {
      await sendTelegramMessage({
        token,
        chatId,
        text:
          `Orden ${parsed.pedido}: aun no aparece en la base de ordenes.\n` +
          "Tu plantilla ya fue recibida y quedara en cola.\n" +
          "Cuando la orden se actualice, se preliquidara automaticamente.\n" +
          "No es necesario reenviarla. Gracias por su gestion.",
      });
      await updateRef.set(
        {
          pedido: parsed.pedido,
          status: "NOT_FOUND",
          ymd,
          parseSource,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      await enqueuePreliqRetry({
        pedido: parsed.pedido,
        chatId,
        fromId,
        ymd,
        parsed,
        reason: "ORDER_NOT_FOUND",
      });
      await registerAudit({
        fromId,
        dedupeId,
        chatId,
        messageId,
        pedido: parsed.pedido,
        resultado: "NOT_FOUND",
      });
      res.status(200).json({ ok: true, result: "NOT_FOUND" });
      return;
    }

    const orderMeta = buildOrdenResumen(orderResult.data);
    const operacionYmd = resolveOperacionYmdFromOrden(orderResult.data);
    await upsertCuadrillaResponsableFromTemplate({
      cuadrillaId: orderMeta.cuadrillaId,
      cuadrillaNombre: orderMeta.cuadrillaNombre,
      userId: fromId,
      username: cleanValue(message?.from?.username || ""),
      firstName: cleanValue(message?.from?.first_name || ""),
      lastName: cleanValue(message?.from?.last_name || ""),
    });
    const foundGuardAcquired = await tryAcquireFoundGuard(
      chatId,
      parsed.pedido,
      operacionYmd
    );
    const already = !foundGuardAcquired;
    if (already) {
      await sendTelegramMessage({
        token,
        chatId,
        text:
          `Orden ${parsed.pedido}: ya fue preliquidada anteriormente.\n` +
          "No es necesario volver a enviarla. Gracias por su gestion.",
      });
      await sendCuadrillaStatus(
        chatId,
        token,
        orderMeta.cuadrillaNombre || orderMeta.cuadrillaId,
        operacionYmd
      );
      await updateRef.set(
        {
          pedido: parsed.pedido,
          status: "ALREADY_LIQUIDATED",
          ymd: operacionYmd,
          parseSource,
          orderDocId: orderResult.id,
          cuadrillaId: orderMeta.cuadrillaId || null,
          cuadrillaNombre: orderMeta.cuadrillaNombre || null,
          cliente: orderMeta.cliente || null,
          fecha: orderMeta.fecha || null,
          tramo: orderMeta.tramo || null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      await registerAudit({
        fromId,
        dedupeId,
        chatId,
        messageId,
        pedido: parsed.pedido,
        resultado: "ALREADY_LIQUIDATED",
      });
      res.status(200).json({ ok: true, result: "ALREADY_LIQUIDATED" });
      return;
    }

    let result = "ERROR";
    try {
      const resumen = buildClienteLiquidadoBlock({
        pedido: parsed.pedido,
        orden: orderResult.data,
        ctoNap: parsed.ctoNap,
        puerto: parsed.puerto,
        potenciaCtoNapDbm: parsed.potenciaCtoNapDbm,
        snOnt: parsed.snOnt,
        meshes: parsed.meshes,
        boxes: parsed.boxes,
        snFono: parsed.snFono,
        receptorDocumento: parsed.receptorDocumento,
        receptorNombres: parsed.receptorNombres,
        receptorTelefono: parsed.receptorTelefono,
      });
      const sent = await sendTelegramMessage({ token, chatId, text: resumen });
      if (!sent) throw new Error("TELEGRAM_SEND_FAILED");
      await updateRef.set(
        {
          pedido: parsed.pedido,
          orderDocId: orderResult.id,
          status: "FOUND",
          ymd: operacionYmd,
          parseSource,
          cuadrillaId: orderMeta.cuadrillaId || null,
          cuadrillaNombre: orderMeta.cuadrillaNombre || null,
          cliente: orderMeta.cliente || null,
          fecha: orderMeta.fecha || null,
          tramo: orderMeta.tramo || null,
          parsedFields: {
            pedido: parsed.pedido,
            ctoNap: parsed.ctoNap || null,
            puerto: parsed.puerto || null,
            potenciaCtoNapDbm: parsed.potenciaCtoNapDbm || null,
            snOnt: parsed.snOnt || null,
            meshes: parsed.meshes,
            boxes: parsed.boxes,
            snFono: parsed.snFono || null,
            receptorDocumento: parsed.receptorDocumento || null,
            receptorNombres: parsed.receptorNombres || null,
            receptorTelefono: parsed.receptorTelefono || null,
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      try {
        await upsertPreliquidacion({
          chatId,
          fromId,
          pedido: parsed.pedido,
          ymd: operacionYmd,
          orderDocId: orderResult.id,
          orderMeta,
          parsed,
        });
        await clearPreliqRetry(parsed.pedido);
      } catch (error) {
        logger.error("telegram preliquidacion upsert error", {
          error: String((error as Error)?.message || error),
          pedido: parsed.pedido,
          ymd: operacionYmd,
        });
      }
      await sendTelegramMessage({
        token,
        chatId,
        text:
          `Orden ${parsed.pedido}: preliquidacion registrada correctamente.\n` +
          "Gracias por su gestion.",
      });
      await sendCuadrillaStatus(
        chatId,
        token,
        orderMeta.cuadrillaNombre || orderMeta.cuadrillaId,
        operacionYmd
      );
      result = "FOUND";
    } catch (error) {
      logger.error("telegramWebhook processing error", {
        error: String((error as Error)?.message || error),
        chatId,
      });
      result = "ERROR";
    }

    if (result !== "FOUND") {
      if (foundGuardAcquired) {
        await releaseFoundGuard(chatId, parsed.pedido, operacionYmd);
      }
      await updateRef.set(
        {
          pedido: parsed.pedido,
          status: result,
          ymd: operacionYmd,
          parseSource,
          parsedFields: {
            pedido: parsed.pedido,
            ctoNap: parsed.ctoNap || null,
            puerto: parsed.puerto || null,
            potenciaCtoNapDbm: parsed.potenciaCtoNapDbm || null,
            snOnt: parsed.snOnt || null,
            meshes: parsed.meshes,
            boxes: parsed.boxes,
            snFono: parsed.snFono || null,
            receptorDocumento: parsed.receptorDocumento || null,
            receptorNombres: parsed.receptorNombres || null,
            receptorTelefono: parsed.receptorTelefono || null,
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    await registerAudit({
      fromId,
      dedupeId,
      chatId,
      messageId,
      pedido: parsed.pedido,
      resultado: result,
    });

    res.status(200).json({ ok: true, result });
  }
);

export const telegramPreliqRetryWorker = onSchedule(
  {
    region: "us-central1",
    schedule: "*/30 * * * *",
    timeZone: "America/Lima",
    secrets: [TELEGRAM_BOT_TOKEN],
  },
  async () => {
    const now = new Date();
    const token = TELEGRAM_BOT_TOKEN.value();
    const snap = await db
      .collection(PRELIQ_RETRY_COLLECTION)
      .where("status", "==", "PENDING_ORDER")
      .where("nextRetryAt", "<=", now)
      .limit(50)
      .get();

    for (const docSnap of snap.docs) {
      try {
        await processPreliqRetryDoc(docSnap, token);
      } catch (error) {
        const row = (docSnap.data() || {}) as Record<string, unknown>;
        const attempts = Number(row.attempts || 0);
        await docSnap.ref.set(
          {
            attempts: attempts + 1,
            status: attempts + 1 >= PRELIQ_RETRY_MAX_ATTEMPTS ? "FAILED_FINAL" : "PENDING_ORDER",
            lastError: String((error as Error)?.message || error),
            nextRetryAt: new Date(Date.now() + PRELIQ_RETRY_INTERVAL_MS),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    }
  }
);

function reminderTextByHour(hourLima: number): string | null {
  const generic =
    "*RECORDAR ENVIAR SUS PLANTILLAS DE FINALIZACION, " +
    "PARA UN MAYOR ABASTECIMIENTO DE EQUIPOS Y EVITAR ESCASEZ " +
    "DE EQUIPOS Y DEMORAS EN LA GESTION.*";
  if (hourLima === 10 || hourLima === 14 || hourLima === 18) {
    return generic;
  }
  if (hourLima === 12) {
    return (
      "*RECORDAR ENVIAR SUS PLANTILLAS DE FINALIZACION DEL PRIMER TRAMO, " +
      "PARA UN MAYOR ABASTECIMIENTO DE EQUIPOS Y EVITAR ESCASEZ " +
      "DE EQUIPOS Y DEMORAS EN LA GESTION.*"
    );
  }
  if (hourLima === 16) {
    return (
      "*RECORDAR ENVIAR SUS PLANTILLAS DE FINALIZACION DEL SEGUNDO TRAMO, " +
      "PARA UN MAYOR ABASTECIMIENTO DE EQUIPOS Y EVITAR ESCASEZ " +
      "DE EQUIPOS Y DEMORAS EN LA GESTION.*"
    );
  }
  if (hourLima === 20) {
    return (
      "*RECORDAR ENVIAR SUS PLANTILLAS DE FINALIZACION DEL TERCER TRAMO, " +
      "PARA UN MAYOR ABASTECIMIENTO DE EQUIPOS Y EVITAR ESCASEZ " +
      "DE EQUIPOS Y DEMORAS EN LA GESTION.*"
    );
  }
  return null;
}

export const telegramPendientesReminder = onSchedule(
  {
    region: "us-central1",
    schedule: "0 10,12,14,16,18,20 * * *",
    timeZone: "America/Lima",
    secrets: [TELEGRAM_BOT_TOKEN],
  },
  async (event) => {
    const token = TELEGRAM_BOT_TOKEN.value();
    if (!token) return;
    const chats = parseAllowedChatIds(TELEGRAM_ALLOWED_CHAT_IDS.value());
    if (!chats.length) return;

    const scheduleDate = new Date(event.scheduleTime || Date.now());
    const ymd = ymdFromLimaDate(scheduleDate);
    const hourLima = Number(new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Lima",
      hour: "2-digit",
      hour12: false,
    }).format(scheduleDate));
    const baseText = reminderTextByHour(hourLima);
    if (!baseText) return;

    for (const chatId of chats) {
      await sendTelegramMessage({ token, chatId, text: baseText });
      await sendResumenCount(chatId, token, "PENDIENTES", ymd, false);
      await sendPendientesDetalladoPorCuadrilla(chatId, token, ymd);
    }
  }
);
