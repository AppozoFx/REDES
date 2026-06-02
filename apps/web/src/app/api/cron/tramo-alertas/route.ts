import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { sendNotifTecnico } from "@/domain/ordenes/notificaciones-tecnico";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRAMOS: Record<number, { hm: string; label: string }> = {
  8:  { hm: "08:00", label: "Primer tramo" },
  12: { hm: "12:00", label: "Segundo tramo" },
  16: { hm: "16:00", label: "Tercer tramo" },
};

const ESTADOS_INACTIVOS = new Set(["FINALIZADA", "CANCELADA", "ANULADA"]);
const ESTADOS_PENDIENTES = new Set(["AGENDADA", "INICIADA"]);

function limaHour(): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Lima",
      hour: "2-digit",
      hour12: false,
    }).format(new Date())
  );
}

function limaYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeEstado(v: unknown) {
  return String(v || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function isAuthorized(req: Request) {
  const secret = process.env.CRON_TOKEN || "";
  const provided = req.headers.get("x-cron-token") || "";
  return secret && provided && secret === provided;
}

/**
 * 17:00 — Notifica a cuadrillas que trabajaron hoy pero ya no tienen
 * ninguna orden AGENDADA ni INICIADA pendiente, para que cierren ruta.
 */
async function handleCierreRuta(ymd: string) {
  const db = adminDb();

  const [allOrdenesSnap, rutaCerradaSnap] = await Promise.all([
    // Todas las órdenes de hoy con cuadrillaId asignada
    db.collection("ordenes").where("fSoliYmd", "==", ymd).limit(3000).get(),
    // Cuadrillas que ya cerraron ruta hoy
    db.collection("cuadrilla_estado_diario")
      .where("ymd", "==", ymd)
      .where("estadoRuta", "==", "RUTA_CERRADA")
      .get(),
  ]);

  const rutaCerradaIds = new Set<string>(
    rutaCerradaSnap.docs.map((d) => String(d.data()?.cuadrillaId || "").trim()).filter(Boolean)
  );

  // Cuadrillas que tuvieron al menos una orden hoy → están trabajando
  const cuadrillasConOrdenes = new Set<string>();
  // Cuadrillas con al menos una orden AGENDADA o INICIADA aún pendiente
  const cuadrillasConPendientes = new Set<string>();

  for (const doc of allOrdenesSnap.docs) {
    const data = doc.data() as any;
    const cuadrillaId = String(data?.cuadrillaId || "").trim();
    if (!cuadrillaId) continue;
    cuadrillasConOrdenes.add(cuadrillaId);
    const estado = normalizeEstado(data?.estado);
    if (ESTADOS_PENDIENTES.has(estado)) {
      cuadrillasConPendientes.add(cuadrillaId);
    }
  }

  // Candidatos: trabajaron hoy + sin pendientes + aún no cerraron ruta
  const candidatos = Array.from(cuadrillasConOrdenes).filter(
    (id) => !cuadrillasConPendientes.has(id) && !rutaCerradaIds.has(id)
  );

  if (candidatos.length === 0) {
    return NextResponse.json({ ok: true, notified: 0, tipo: "CIERRE_RUTA_RECORDATORIO" });
  }

  await Promise.all(
    candidatos.map((cuadrillaId) =>
      sendNotifTecnico(
        cuadrillaId,
        "CIERRE_RUTA_RECORDATORIO",
        "Cierra tu ruta",
        "Ya no tienes órdenes pendientes. Recuerda cerrar tu ruta desde el botón de inicio.",
      ).catch(() => {})
    )
  );

  return NextResponse.json({
    ok: true,
    notified: candidatos.length,
    tipo: "CIERRE_RUTA_RECORDATORIO",
    ymd,
  });
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED_CRON" }, { status: 401 });
  }

  const hour = limaHour();
  const ymd = limaYmd();

  // ── 17:00: recordatorio de cierre de ruta ──────────────────────────────────
  if (hour === 17) {
    return handleCierreRuta(ymd);
  }

  // ── Tramos de gestión (8, 12, 16) ─────────────────────────────────────────
  const tramo = TRAMOS[hour];
  if (!tramo) {
    return NextResponse.json({ ok: true, skipped: true, reason: "NOT_TRAMO_HOUR", hour });
  }

  const snap = await adminDb()
    .collection("ordenes")
    .where("fSoliYmd", "==", ymd)
    .where("fSoliHm", "==", tramo.hm)
    .limit(2000)
    .get();

  // Agrupar órdenes activas por cuadrillaId
  const byCuadrilla = new Map<string, string[]>();
  for (const doc of snap.docs) {
    const data = doc.data() as any;
    const estado = normalizeEstado(data?.estado);
    if (ESTADOS_INACTIVOS.has(estado)) continue;
    const cuadrillaId = String(data?.cuadrillaId || "").trim();
    if (!cuadrillaId) continue;
    const cliente = String(data?.cliente || doc.id).trim();
    const list = byCuadrilla.get(cuadrillaId) ?? [];
    list.push(cliente);
    byCuadrilla.set(cuadrillaId, list);
  }

  if (byCuadrilla.size === 0) {
    return NextResponse.json({ ok: true, notified: 0, tramo: tramo.label });
  }

  await Promise.all(
    Array.from(byCuadrilla.entries()).map(([cuadrillaId, clientes]) => {
      const count = clientes.length;
      const titulo = `${tramo.label} — ${count} orden${count === 1 ? "" : "es"} pendiente${count === 1 ? "" : "s"}`;
      const preview = clientes.slice(0, 3).join(", ") + (clientes.length > 3 ? " y más..." : "");
      const mensaje = `Gestiona a: ${preview}`;
      return sendNotifTecnico(cuadrillaId, "TRAMO_ALERTA", titulo, mensaje).catch(() => {});
    })
  );

  return NextResponse.json({ ok: true, notified: byCuadrilla.size, tramo: tramo.label, ymd });
}
