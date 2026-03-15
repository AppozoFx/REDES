import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { addGlobalNotification } from "@/domain/notificaciones/service";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

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
    const canAdmin = session.isAdmin || roles.includes("GERENCIA");
    if (!canAdmin) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const body = await req.json();
    const startYmd = String(body?.startYmd || "").trim();
    const coordinadorUid = String(body?.coordinadorUid || "").trim();
    if (!startYmd) return NextResponse.json({ ok: false, error: "MISSING_START" }, { status: 400 });
    if (!coordinadorUid) return NextResponse.json({ ok: false, error: "MISSING_COORDINADOR" }, { status: 400 });

    const db = adminDb();
    const actorSnap = await db.collection("usuarios").doc(session.uid).get();
    const actorData = actorSnap.data() as any;
    const actorNombre = shortName(`${actorData?.nombres || ""} ${actorData?.apellidos || ""}`.trim(), session.uid);

    const coordSnap = await db.collection("usuarios").doc(coordinadorUid).get();
    const coordData = coordSnap.data() as any;
    const coordNombre = shortName(`${coordData?.nombres || ""} ${coordData?.apellidos || ""}`.trim(), coordinadorUid);

    const docRef = db.collection("asistencia_programada").doc(startYmd);
    const snap = await docRef.get();
    const current = snap.exists ? (snap.data() as any) : {};
    const estado = String(current?.estado || "ABIERTO");
    if (estado === "CERRADO") return NextResponse.json({ ok: false, error: "LOCKED" }, { status: 403 });
    const prevCoordinadores = (current?.coordinadores || {}) as Record<string, any>;
    const prev = prevCoordinadores[coordinadorUid] || {};
    const nextCoordinadores = {
      ...prevCoordinadores,
      [coordinadorUid]: {
        ...prev,
        status: "BORRADOR",
        reopenedAt: new Date().toISOString(),
        reopenedBy: session.uid,
        reopenedByNombre: actorNombre,
      },
    };

    await docRef.set(
      {
        coordinadores: nextCoordinadores,
        updatedAt: new Date().toISOString(),
        updatedBy: session.uid,
        updatedByNombre: actorNombre,
      },
      { merge: true }
    );

    await db.collection("auditoria").add({
      modulo: "ASISTENCIA_PROGRAMADA",
      accion: "REABRIR_COORDINADOR",
      startYmd,
      actorUid: session.uid,
      actorNombre,
      coordinadorUid,
      coordinadorNombre: coordNombre,
      createdAt: new Date().toISOString(),
    });

    await addGlobalNotification({
      title: "Gerencia reabrio coordinador",
      message: `${actorNombre} reabrio la programacion de ${coordNombre} para la semana que inicia ${startYmd}.`,
      type: "info",
      scope: "ALL",
      createdBy: session.uid,
      entityType: "ASISTENCIA_PROGRAMADA",
      entityId: startYmd,
      action: "UPDATE",
      estado: "ACTIVO",
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
