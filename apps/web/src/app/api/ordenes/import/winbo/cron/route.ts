import { NextResponse } from "next/server";
import { acquireWinboSyncLock, syncWinboOrdenes } from "@/lib/winbo/sync";

export const runtime = "nodejs";

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isWithinWindowLima() {
  const now = new Date();
  const hh = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Lima",
      hour: "2-digit",
      hour12: false,
    }).format(now)
  );
  const mm = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Lima",
      minute: "2-digit",
    }).format(now)
  );
  const totalMinutes = hh * 60 + mm;
  return totalMinutes >= 7 * 60 + 30 && totalMinutes <= 22 * 60;
}

function isAuthorized(req: Request) {
  const token = process.env.WINBO_CRON_TOKEN || "";
  const provided = req.headers.get("x-winbo-cron-token") || "";
  return token && provided && token === provided;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED_CRON" }, { status: 401 });
  }
  if (!isWithinWindowLima()) {
    return NextResponse.json({ ok: true, skipped: true, reason: "OUTSIDE_WINDOW" });
  }

  const ymd = todayLimaYmd();
  let lock: { release: () => Promise<void> } | null = null;
  try {
    const actor = { uid: "system:winbo-cron", kind: "system" as const };
    lock = await acquireWinboSyncLock(actor, "auto");
    const result = await syncWinboOrdenes(
      {
        dryRun: false,
        mode: "auto",
        scope: "today",
        fechaVisiDesde: ymd,
        fechaVisiHasta: ymd,
        filtros: {},
        nombreArchivo: "",
      },
      actor
    );
    return NextResponse.json(result);
  } catch (error: any) {
    const message = String(error?.message || "ERROR");
    if (message === "IMPORT_IN_PROGRESS") {
      return NextResponse.json({ ok: true, skipped: true, reason: "LOCKED" });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  } finally {
    if (lock) await lock.release();
  }
}
