import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { addGlobalNotification } from "@/domain/notificaciones/service";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

const ESTADOS = [
  "asistencia",
  "falta",
  "suspendida",
  "descanso",
  "descanso medico",
  "vacaciones",
];

function shortName(full: string, fallback: string) {
  const parts = String(full || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = parts[0] || "";
  const firstLast = parts.length >= 4 ? parts[2] || "" : parts[1] || "";
  return `${first} ${firstLast}`.trim() || fallback;
}

function weekEnd(startYmd: string) {
  const start = new Date(`${startYmd}T00:00:00`);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return end.toISOString().slice(0, 10);
}

function buildWeekDays(startYmd: string) {
  const start = new Date(`${startYmd}T00:00:00`);
  return Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(start.getTime() + (i + 1) * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  });
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
    const canAdmin = session.isAdmin || roles.includes("GERENCIA");
    const canCoord = roles.includes("COORDINADOR");
    if (!canAdmin && !canCoord) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const startYmd = String(searchParams.get("start") || "").trim();
    if (!startYmd) return NextResponse.json({ ok: false, error: "MISSING_START" }, { status: 400 });

    const db = adminDb();
    const endYmd = weekEnd(startYmd);

    const docRef = db.collection("asistencia_programada").doc(startYmd);
    const snap = await docRef.get();
    const data = snap.exists ? (snap.data() as any) : {};
    const estado = String(data?.estado || "ABIERTO");
    const openUntil = String(data?.openUntil || "").trim();

    let q = db.collection("cuadrillas").where("estado", "==", "HABILITADO");
    if (!canAdmin && canCoord) {
      q = q.where("coordinadorUid", "==", session.uid);
    }
    const cuadrillasSnap = await q.get();
    const cuadrillasRaw = cuadrillasSnap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        nombre: String(data?.nombre || d.id),
        coordinadorUid: String(data?.coordinadorUid || data?.coordinador || "").trim(),
      };
    });

    const coordUids = Array.from(new Set(cuadrillasRaw.map((c) => c.coordinadorUid).filter(Boolean)));
    const coordSnaps = await Promise.all(
      coordUids.map(async (uid) => {
        const snap = await db.collection("usuarios").doc(uid).get();
        return { uid, data: snap.exists ? (snap.data() as any) : null };
      })
    );
    const coordMap = new Map<string, string>();
    coordSnaps.forEach(({ uid, data }) => {
      const nombre = shortName(`${data?.nombres || ""} ${data?.apellidos || ""}`.trim(), uid);
      coordMap.set(uid, nombre || uid);
    });

    const cuadrillas = cuadrillasRaw
      .map((c) => ({
        id: c.id,
        nombre: c.nombre,
        coordinadorUid: c.coordinadorUid || "",
        coordinadorNombre: coordMap.get(c.coordinadorUid || "") || (c.coordinadorUid ? c.coordinadorUid : "-"),
      }))
      .sort((a, b) => {
        const ac = a.coordinadorNombre || "";
        const bc = b.coordinadorNombre || "";
        if (ac !== bc) return ac.localeCompare(bc, "es", { sensitivity: "base" });
        return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
      });

    const items = (data?.items || {}) as Record<string, Record<string, string>>;
    const feriados = Array.isArray(data?.feriados) ? data.feriados : [];

    return NextResponse.json({
      ok: true,
      startYmd,
      endYmd: data?.endYmd || endYmd,
      estado,
      items,
      feriados,
      openUntil,
      cuadrillas,
      canEdit:
        canAdmin ||
        (canCoord &&
          estado === "ABIERTO" &&
          (!openUntil || new Date().getTime() <= new Date(openUntil).getTime())),
      canAdmin,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
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
    const canCoord = roles.includes("COORDINADOR");
    if (!canAdmin && !canCoord) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const body = await req.json();
    const startYmd = String(body?.startYmd || "").trim();
    const endYmd = String(body?.endYmd || "").trim() || weekEnd(startYmd);
    const items = (body?.items || {}) as Record<string, Record<string, string>>;
    const openUntil = String(body?.openUntil || "").trim();
    const feriados = Array.isArray(body?.feriados) ? body.feriados : [];
    if (!startYmd) return NextResponse.json({ ok: false, error: "MISSING_START" }, { status: 400 });

    const db = adminDb();
    const docRef = db.collection("asistencia_programada").doc(startYmd);
    const snap = await docRef.get();
    const current = snap.exists ? (snap.data() as any) : {};
    const estado = String(current?.estado || "ABIERTO");

    if (!canAdmin && estado === "CERRADO") {
      return NextResponse.json({ ok: false, error: "LOCKED" }, { status: 403 });
    }

    const weekDays = buildWeekDays(startYmd);
    const itemsNext: Record<string, Record<string, string>> = { ...(current?.items || {}) };

    // merge updates
    Object.entries(items || {}).forEach(([cid, row]) => {
      itemsNext[cid] = { ...(itemsNext[cid] || {}), ...(row || {}) };
    });

    // validate max descanso per cuadrilla (1 normal, 2 si hay feriado en la semana)
    const maxDescanso = feriados.length > 0 ? 2 : 1;
    for (const [cid, row] of Object.entries(itemsNext)) {
      let descanso = 0;
      weekDays.forEach((d) => {
        const v = String(row?.[d] || "asistencia").toLowerCase();
        if (v === "descanso") descanso++;
      });
      if (descanso > maxDescanso) {
        return NextResponse.json({ ok: false, error: `MAX_DESCANSO:${cid}` }, { status: 400 });
      }
      // normalize invalid values
      weekDays.forEach((d) => {
        const v = String(row?.[d] || "asistencia").toLowerCase();
        if (!ESTADOS.includes(v)) row[d] = "asistencia";
      });
    }

    const actorSnap = await db.collection("usuarios").doc(session.uid).get();
    const actorData = actorSnap.data() as any;
    const actorNombre = shortName(`${actorData?.nombres || ""} ${actorData?.apellidos || ""}`.trim(), session.uid);

    await docRef.set(
      {
        startYmd,
        endYmd,
        items: itemsNext,
        feriados,
        ...(canAdmin && openUntil ? { openUntil } : {}),
        updatedAt: new Date().toISOString(),
        updatedBy: session.uid,
        updatedByNombre: actorNombre,
        createdAt: current?.createdAt || new Date().toISOString(),
        createdBy: current?.createdBy || session.uid,
        createdByNombre: current?.createdByNombre || actorNombre,
        estado: current?.estado || "ABIERTO",
      },
      { merge: true }
    );

    if (!canAdmin && canCoord) {
      await addGlobalNotification({
        title: "Actualizacion de asistencia programada",
        message: `${actorNombre} actualizo la programacion semanal (${startYmd} a ${endYmd}).`,
        type: "info",
        scope: "ALL",
        createdBy: session.uid,
        entityType: "ASISTENCIA_PROGRAMADA",
        entityId: startYmd,
        action: "UPDATE",
        estado: "ACTIVO",
      });
    }

    await db.collection("auditoria").add({
      modulo: "ASISTENCIA_PROGRAMADA",
      accion: "SAVE",
      startYmd,
      actorUid: session.uid,
      actorNombre,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
