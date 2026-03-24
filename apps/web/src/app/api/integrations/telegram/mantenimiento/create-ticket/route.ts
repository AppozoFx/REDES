import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { requireAreaScope } from "@/core/auth/apiGuards";
import { createMantenimientoLiquidacion } from "@/domain/mantenimientoLiquidaciones/repo";
import {
  getTelegramMantIngresoById,
  markTelegramMantCreateTicketResult,
} from "@/domain/integrations/telegram/mantenimiento/repo";

export const runtime = "nodejs";

function clean(value: unknown): string {
  return String(value || "").trim();
}

function isAuthorized(req: Request) {
  const token =
    clean(process.env.TELEGRAM_MANT_CREATE_TICKET_SECRET) ||
    clean(process.env.TELEGRAM_WEBHOOK_SECRET_MANTENIMIENTO) ||
    clean(process.env.TELEGRAM_WEBHOOK_SECRET);
  const provided =
    clean(req.headers.get("x-telegram-maint-token")) ||
    clean(req.headers.get("x-telegram-bot-api-secret-token"));
  return token && provided && token === provided;
}

function buildCreatePayload(raw: any) {
  return {
    ticketNumero: clean(raw?.ticketNumero),
    codigoCaja: clean(raw?.codigoCaja),
    fechaAtencionYmd: clean(raw?.fechaAtencionYmd),
    cuadrillaId: clean(raw?.cuadrillaId),
    distrito: clean(raw?.distrito),
    latitud: raw?.latitud ?? null,
    longitud: raw?.longitud ?? null,
    horaInicio: clean(raw?.horaInicio),
    horaFin: clean(raw?.horaFin),
    causaRaiz: clean(raw?.causaRaiz),
    solucion: clean(raw?.solucion),
    observacion: clean(raw?.observacion),
    origen: "TELEGRAM" as const,
    materialesConsumidos: Array.isArray(raw?.materialesConsumidos) ? raw.materialesConsumidos : [],
  };
}

export async function POST(req: Request) {
  const session = await getServerSession();
  let sessionAuthorized = false;
  try {
    requireAreaScope(session, ["MANTENIMIENTO"]);
    sessionAuthorized = true;
  } catch {}

  if (!sessionAuthorized && !isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const ingresoId = clean(body?.ingresoId);
  if (!ingresoId) {
    return NextResponse.json({ ok: false, error: "INGRESO_ID_REQUIRED" }, { status: 400 });
  }

  const ingreso = await getTelegramMantIngresoById(ingresoId);
  if (!ingreso) {
    return NextResponse.json({ ok: false, error: "INGRESO_NOT_FOUND" }, { status: 404 });
  }

  if (ingreso?.createTicket?.createdId) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "ALREADY_CREATED",
      id: clean(ingreso.createTicket.createdId),
    });
  }

  if (clean(ingreso?.status) !== "READY_FOR_CREATE") {
    return NextResponse.json({ ok: false, error: "INGRESO_NOT_READY" }, { status: 400 });
  }

  const payload = buildCreatePayload(ingreso?.normalizedPayload || {});
  if (!payload.ticketNumero || !payload.fechaAtencionYmd || !payload.cuadrillaId) {
    await markTelegramMantCreateTicketResult({
      ingresoId,
      status: "CREATE_FAILED",
      attempted: true,
      error: "INVALID_NORMALIZED_PAYLOAD",
    });
    return NextResponse.json({ ok: false, error: "INVALID_NORMALIZED_PAYLOAD" }, { status: 400 });
  }

  try {
    const created = await createMantenimientoLiquidacion(payload, "system:telegram");
    await markTelegramMantCreateTicketResult({
      ingresoId,
      status: "CREATED",
      attempted: true,
      createdId: created.id,
      error: "",
    });
    return NextResponse.json({ ok: true, id: created.id });
  } catch (e: any) {
    const error = clean(e?.message || "ERROR");
    await markTelegramMantCreateTicketResult({
      ingresoId,
      status: "CREATE_FAILED",
      attempted: true,
      error,
    });
    const status = error === "TICKET_DUPLICADO" ? 409 : 500;
    return NextResponse.json({ ok: false, error }, { status });
  }
}
