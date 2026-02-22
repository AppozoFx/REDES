import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret, defineString } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";

import { db, FieldValue } from "../lib/admin";
import { writeAudit } from "../lib/audit";
import { parseTelegramTemplate } from "./parser";
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

const UPDATES_COLLECTION = "telegram_updates";
const ORDENES_COLLECTION = "ordenes";

type TelegramChat = { id?: number | string };
type TelegramFrom = { id?: number | string };

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

function isOrdenEstadoValido(estadoRaw: unknown): boolean {
  const estado = String(estadoRaw || "").trim().toUpperCase();
  return estado === "FINALIZADA" || estado === "INICIADA";
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

function buildOrdenResumen(orden: Record<string, unknown>): OrdenResumen {
  const pedido = cleanValue(orden.codiSeguiClien || orden.ordenId || "");
  const cliente = cleanValue(orden.cliente || "-");
  const fecha = cleanValue(orden.fechaFinVisiYmd || orden.fSoliYmd || "-");
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
}): string {
  const fecha = cleanValue(args.orden.fechaFinVisiYmd || args.orden.fSoliYmd || "-");
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
  if (args.ctoNap) lines.push(`Caja NAP/CTO: ${cleanValue(args.ctoNap)}`);
  if (args.puerto) lines.push(`Puerto: ${cleanValue(args.puerto)}`);
  if (args.potenciaCtoNapDbm) {
    lines.push(`Potencia CTO/NAP: ${cleanValue(args.potenciaCtoNapDbm)}`);
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

async function fetchOrdenByPedido(pedido: string): Promise<{
  id: string;
  data: Record<string, unknown>;
} | null> {
  const snap = await db
    .collection(ORDENES_COLLECTION)
    .where("codiSeguiClien", "==", pedido)
    .limit(30)
    .get();
  if (snap.empty) return null;

  const candidates = snap.docs
    .map((doc) => ({ id: doc.id, data: (doc.data() || {}) as Record<string, unknown> }))
    .filter((row) => isOrdenEstadoValido(row.data.estado));

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const aYmd = String(a.data.fechaFinVisiYmd || a.data.fSoliYmd || "");
    const bYmd = String(b.data.fechaFinVisiYmd || b.data.fSoliYmd || "");
    const byYmd = bYmd.localeCompare(aYmd);
    if (byYmd !== 0) return byYmd;
    const aHm = normalizeHm(a.data.fechaFinVisiHm || a.data.fSoliHm || "");
    const bHm = normalizeHm(b.data.fechaFinVisiHm || b.data.fSoliHm || "");
    return bHm.localeCompare(aHm);
  });

  return candidates[0];
}

async function fetchOrdenesFinalizadasByYmd(ymd: string): Promise<OrdenResumen[]> {
  const snap = await db
    .collection(ORDENES_COLLECTION)
    .where("fechaFinVisiYmd", "==", ymd)
    .limit(5000)
    .get();
  const rows = snap.docs
    .map((doc) => (doc.data() || {}) as Record<string, unknown>)
    .filter((orden) => isOrdenEstadoValido(orden.estado))
    .map((orden) => buildOrdenResumen(orden))
    .filter((row) => !!row.pedido);
  return dedupeListByPedido(rows);
}

async function fetchTelegramFoundByYmd(
  chatId: string,
  ymd: string
): Promise<OrdenResumen[]> {
  const snap = await db
    .collection(UPDATES_COLLECTION)
    .where("chatId", "==", chatId)
    .limit(5000)
    .get();
  const rows: OrdenResumen[] = snap.docs
    .map((doc) => doc.data() as Record<string, unknown>)
    .filter((row) => row.status === "FOUND" && row.ymd === ymd)
    .map((row) => ({
      pedido: cleanValue(row.pedido || ""),
      cliente: cleanValue(row.cliente || "-"),
      fecha: cleanValue(row.fecha || ymd),
      tramo: cleanValue(row.tramo || "Tramo no definido"),
      cuadrillaId: cleanValue(row.cuadrillaId || ""),
      cuadrillaNombre: cleanValue(row.cuadrillaNombre || "SIN_CUADRILLA"),
    }))
    .filter((row) => !!row.pedido);
  return dedupeListByPedido(rows);
}

async function wasPedidoAlreadyReportedToday(
  chatId: string,
  pedido: string,
  ymd: string
): Promise<boolean> {
  const snap = await db
    .collection(UPDATES_COLLECTION)
    .where("chatId", "==", chatId)
    .where("pedido", "==", pedido)
    .limit(20)
    .get();
  return snap.docs.some((d) => {
    const x = d.data() as Record<string, unknown>;
    return String(x.status || "") === "FOUND" && String(x.ymd || "") === ymd;
  });
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
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
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
  const m = /^(liquidadas|pendientes)\s+(\S+)$/i.exec(raw);
  if (!m) return null;
  const mode = String(m[1]).toUpperCase() === "LIQUIDADAS" ? "LIQUIDADAS" : "PENDIENTES";
  const ymd = parseFlexibleDateToYmd(String(m[2]));
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
  if (parseModeDateOnlyCommand(text)) return true;
  if (parseCuadrillaDetailCommand(text)) return true;
  if (parseBareCuadrillaCommand(text)) return true;
  return false;
}

export const telegramWebhook = onRequest(
  {
    region: "us-central1",
    secrets: [TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET],
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

    const modeDateCmd = parseModeDateOnlyCommand(text);
    if (modeDateCmd) {
      await sendResumenCount(
        chatId,
        token,
        modeDateCmd.mode,
        modeDateCmd.ymd,
        true
      );
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

    const parsed = parseTelegramTemplate(text);
    if (!parsed) {
      await updateRef.set(
        {
          status: "IGNORED",
          reason: "NO_TEMPLATE_OR_PEDIDO",
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
        text: `Pedido ${parsed.pedido}: NO ENCONTRADO.`,
      });
      await updateRef.set(
        {
          pedido: parsed.pedido,
          status: "NOT_FOUND",
          ymd,
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
        resultado: "NOT_FOUND",
      });
      res.status(200).json({ ok: true, result: "NOT_FOUND" });
      return;
    }

    const orderMeta = buildOrdenResumen(orderResult.data);
    const already = await wasPedidoAlreadyReportedToday(chatId, parsed.pedido, ymd);
    if (already) {
      await sendTelegramMessage({
        token,
        chatId,
        text: "CLIENTE YA LIQUIDADO",
      });
      await sendCuadrillaStatus(
        chatId,
        token,
        orderMeta.cuadrillaNombre || orderMeta.cuadrillaId,
        ymd
      );
      await updateRef.set(
        {
          pedido: parsed.pedido,
          status: "ALREADY_LIQUIDATED",
          ymd,
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
      });
      await sendTelegramMessage({ token, chatId, text: resumen });
      await updateRef.set(
        {
          pedido: parsed.pedido,
          orderDocId: orderResult.id,
          status: "FOUND",
          ymd,
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
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      await sendCuadrillaStatus(
        chatId,
        token,
        orderMeta.cuadrillaNombre || orderMeta.cuadrillaId,
        ymd
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
      await updateRef.set(
        {
          pedido: parsed.pedido,
          status: result,
          ymd,
          parsedFields: {
            pedido: parsed.pedido,
            ctoNap: parsed.ctoNap || null,
            puerto: parsed.puerto || null,
            potenciaCtoNapDbm: parsed.potenciaCtoNapDbm || null,
            snOnt: parsed.snOnt || null,
            meshes: parsed.meshes,
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

function reminderTextByHour(hourLima: number): string | null {
  if (hourLima === 12) {
    return "Buenas tardes compañeros, por favor no olvidar enviar sus " +
      "plantillas de finalizacion del primer tramo.";
  }
  if (hourLima === 16) {
    return "Buenas tardes compañeros, por favor no olvidar enviar sus " +
      "plantillas de finalizacion del segundo tramo.";
  }
  if (hourLima === 20) {
    return "Buenas noches compañeros, por favor no olvidar enviar sus " +
      "plantillas de finalizacion del tercer tramo.";
  }
  return null;
}

export const telegramPendientesReminder = onSchedule(
  {
    region: "us-central1",
    schedule: "0 12,16,20 * * *",
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
      await sendTelegramMessage({
        token,
        chatId,
        text: "Escribe 'resumen' para ver detalle por cuadrilla.",
      });
    }
  }
);
