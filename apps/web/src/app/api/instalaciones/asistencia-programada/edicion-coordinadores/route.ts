import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { addGlobalNotification } from "@/domain/notificaciones/service";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

// Pausa/reanuda la edición de coordinadores sin cerrar la semana (`estado`).
// Pensado para que Gerencia pueda revisar la programación sin que los
// coordinadores sigan haciendo cambios, sin necesidad de cerrar la semana
// completa (lo que además bloquearía otras herramientas de admin).

function shortName(full: string, fallback: string) {
  const parts = String(full || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = parts[0] || "";
  const firstLast = parts.length >= 4 ? parts[2] || "" : parts[1] || "";
  return `${first} ${firstLast}`.trim() || fallback;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
    const canAdmin = session.isAdmin || roles.includes("GERENCIA") || roles.includes("JEFATURA");
    if (!canAdmin) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const body = await req.json();
    const startYmd = String(body?.startYmd || "").trim();
    const edicionCoordinadores = String(body?.edicionCoordinadores || "").trim().toUpperCase();
    if (!startYmd) return NextResponse.json({ ok: false, error: "MISSING_START" }, { status: 400 });
    if (!["ABIERTA", "PAUSADA"].includes(edicionCoordinadores)) {
      return NextResponse.json({ ok: false, error: "INVALID_EDICION" }, { status: 400 });
    }

    const db = adminDb();
    const actorSnap = await db.collection("usuarios").doc(session.uid).get();
    const actorData = actorSnap.data() as any;
    const actorNombre = shortName(`${actorData?.nombres || ""} ${actorData?.apellidos || ""}`.trim(), session.uid);

    await db.collection("asistencia_programada").doc(startYmd).set(
      {
        edicionCoordinadores,
        edicionCoordinadoresAt: new Date().toISOString(),
        edicionCoordinadoresBy: session.uid,
        edicionCoordinadoresByNombre: actorNombre,
        updatedAt: new Date().toISOString(),
        updatedBy: session.uid,
        updatedByNombre: actorNombre,
      },
      { merge: true }
    );

    await db.collection("auditoria").add({
      modulo: "ASISTENCIA_PROGRAMADA",
      accion: edicionCoordinadores === "PAUSADA" ? "PAUSAR_EDICION_COORDINADORES" : "REANUDAR_EDICION_COORDINADORES",
      startYmd,
      actorUid: session.uid,
      actorNombre,
      createdAt: new Date().toISOString(),
    });

    if (edicionCoordinadores === "PAUSADA") {
      await addGlobalNotification({
        title: "Revisión de asistencia programada",
        message: `${actorNombre} pausó la edición de coordinadores para revisar la programación que inicia ${startYmd}.`,
        type: "info",
        scope: "ALL",
        createdBy: session.uid,
        entityType: "ASISTENCIA_PROGRAMADA",
        entityId: startYmd,
        action: "UPDATE",
        estado: "ACTIVO",
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
