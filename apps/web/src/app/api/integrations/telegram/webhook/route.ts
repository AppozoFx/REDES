import { NextResponse } from "next/server";
import { parseTelegramMantenimientoMessage } from "@/domain/integrations/telegram/mantenimiento/parser";
import {
  buildTelegramMantKey,
  registerTelegramMantIngreso,
  resolveMappedCuadrilla,
} from "@/domain/integrations/telegram/mantenimiento/repo";

export const runtime = "nodejs";

type TelegramChat = {
  id?: number | string;
  title?: string;
};

type TelegramFrom = {
  id?: number | string;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TelegramMessage = {
  message_id?: number;
  date?: number;
  text?: string;
  caption?: string;
  chat?: TelegramChat;
  from?: TelegramFrom;
  message_thread_id?: number;
  is_topic_message?: boolean;
};

type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
};

function clean(value: unknown): string {
  return String(value || "").trim();
}

function getIncomingMessage(update: TelegramUpdate): TelegramMessage | null {
  return update.message || update.edited_message || update.channel_post || update.edited_channel_post || null;
}

function getIncomingText(message: TelegramMessage | null): string {
  return clean(message?.text || message?.caption || "");
}

function parseAllowedChatIds(raw: string | undefined): Set<string> {
  return new Set(
    String(raw || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function normalizeUpper(value: unknown): string {
  return clean(value).toUpperCase();
}

function ymdFromUnixLima(unixSeconds?: number): string {
  const date = unixSeconds ? new Date(unixSeconds * 1000) : new Date();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function buildObservacion(parsed: ReturnType<typeof parseTelegramMantenimientoMessage>): string {
  if (!parsed) return "";
  const parts = [parsed.observacion];
  if (parsed.ctoNap) parts.push(`CTO/NAP: ${parsed.ctoNap}`);
  if (parsed.procedencia) parts.push(`PROCEDENCIA: ${parsed.procedencia}`);
  if (parsed.nodo) parts.push(`NODO: ${parsed.nodo}`);
  if (parsed.proyecto) parts.push(`PROYECTO: ${parsed.proyecto}`);
  if (parsed.clientesAfectados !== null) parts.push(`CLIENTES AFECTADOS: ${parsed.clientesAfectados}`);
  return parts.filter(Boolean).join("\n");
}

export async function POST(req: Request) {
  try {
    const configuredSecret = clean(process.env.TELEGRAM_WEBHOOK_SECRET_MANTENIMIENTO || process.env.TELEGRAM_WEBHOOK_SECRET);
    const headerSecret = clean(req.headers.get("x-telegram-bot-api-secret-token"));
    if (!configuredSecret || headerSecret !== configuredSecret) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    const update = (await req.json().catch(() => ({}))) as TelegramUpdate;
    const message = getIncomingMessage(update);
    const text = getIncomingText(message);
    const chatId = clean(message?.chat?.id);
    const messageId = Number(message?.message_id || 0);
    const updateId = Number(update?.update_id || 0);
    const messageThreadId = clean(message?.message_thread_id);
    const dedupeId = `${chatId}_${messageId || updateId}`;

    if (!message || !chatId || (!messageId && !updateId)) {
      return NextResponse.json({ ok: true, ignored: "EMPTY_UPDATE" });
    }

    const allowedChats = parseAllowedChatIds(
      process.env.TELEGRAM_ALLOWED_CHAT_IDS_MANTENIMIENTO || process.env.TELEGRAM_ALLOWED_CHAT_IDS
    );
    if (allowedChats.size > 0 && !allowedChats.has(chatId)) {
      return NextResponse.json({ ok: true, ignored: "CHAT_NOT_ALLOWED" });
    }

    if (!text) {
      return NextResponse.json({ ok: true, ignored: "NO_TEXT" });
    }

    const parsed = parseTelegramMantenimientoMessage(text);
    const mapping = await resolveMappedCuadrilla(chatId, messageThreadId);
    const fechaAtencionYmd = ymdFromUnixLima(message?.date);
    const normalizedPayload = parsed
      ? {
          ticketNumero: parsed.ticketNumero,
          codigoCaja: parsed.codigoCaja,
          fechaAtencionYmd,
          cuadrillaId: mapping?.cuadrillaId || "",
          distrito: normalizeUpper(parsed.distrito),
          latitud: parsed.latitud,
          longitud: parsed.longitud,
          horaInicio: "",
          horaFin: "",
          causaRaiz: "",
          solucion: "",
          observacion: buildObservacion(parsed),
          origen: "TELEGRAM",
          materialesConsumidos: [],
        }
      : null;

    const status = !parsed
      ? "PARSE_FAILED"
      : mapping
      ? "READY_FOR_CREATE"
      : "MAPPING_MISSING";

    const result = await registerTelegramMantIngreso({
      dedupeId,
      updateId,
      rawUpdate: update,
      telegram: {
        updateId,
        chatId,
        chatTitle: clean(message?.chat?.title),
        messageId,
        messageThreadId,
        threadKey: buildTelegramMantKey(chatId, messageThreadId),
        isTopicMessage: Boolean(message?.is_topic_message),
        fromId: clean(message?.from?.id),
        fromUsername: clean(message?.from?.username),
        fromName: clean(`${clean(message?.from?.first_name)} ${clean(message?.from?.last_name)}`),
        sentAtUnix: Number(message?.date || 0),
        rawText: text,
      },
      parsing: {
        parserVersion: 1,
        success: Boolean(parsed),
        format: parsed?.format || "UNKNOWN",
        errors: parsed ? [] : ["MESSAGE_NOT_RECOGNIZED"],
        warnings: parsed?.warnings || [],
        extracted: parsed
          ? {
              ticketNumero: parsed.ticketNumero,
              codigoCaja: parsed.codigoCaja,
              latitud: parsed.latitud,
              longitud: parsed.longitud,
              distrito: parsed.distrito,
              observacion: parsed.observacion,
              causaRaizCandidate: parsed.causaRaizCandidate,
              nodo: parsed.nodo,
              proyecto: parsed.proyecto,
              clientesAfectados: parsed.clientesAfectados,
              procedencia: parsed.procedencia,
              ctoNap: parsed.ctoNap,
            }
          : null,
      },
      mapping: {
        key: buildTelegramMantKey(chatId, messageThreadId),
        matched: Boolean(mapping),
        mappingId: mapping?.mappingId || "",
        cuadrillaId: mapping?.cuadrillaId || "",
        cuadrillaNombre: mapping?.cuadrillaNombre || "",
        confidence: mapping ? "CONTROLLED" : "NONE",
      },
      normalizedPayload,
      status,
    });

    if (result.duplicated) {
      return NextResponse.json({ ok: true, ignored: "DUPLICATE_MESSAGE" });
    }

    return NextResponse.json({
      ok: true,
      ingresoId: result.ingresoId,
      status,
      parsed: Boolean(parsed),
      mapped: Boolean(mapping),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
