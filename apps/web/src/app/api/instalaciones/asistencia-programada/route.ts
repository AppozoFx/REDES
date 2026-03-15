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

function limaTodayYmd() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value || "0000";
  const month = parts.find((p) => p.type === "month")?.value || "00";
  const day = parts.find((p) => p.type === "day")?.value || "00";
  return `${year}-${month}-${day}`;
}

function nextThursdayYmd(baseYmd: string) {
  const base = new Date(`${baseYmd}T00:00:00`);
  const day = base.getDay();
  const diff = (4 - day + 7) % 7;
  const next = new Date(base.getTime() + diff * 24 * 60 * 60 * 1000);
  return next.toISOString().slice(0, 10);
}

async function resolveActiveStartYmd(db: FirebaseFirestore.Firestore, requestedStartYmd?: string) {
  if (requestedStartYmd) return requestedStartYmd;

  const todayYmd = limaTodayYmd();
  const currentSnap = await db
    .collection("asistencia_programada")
    .where("startYmd", "<=", todayYmd)
    .orderBy("startYmd", "desc")
    .limit(8)
    .get();

  const currentDoc = currentSnap.docs.find((doc) => {
    const data = doc.data() as any;
    const startYmd = String(data?.startYmd || doc.id || "").trim();
    const endYmd = String(data?.endYmd || weekEnd(startYmd)).trim();
    return !!startYmd && !!endYmd && todayYmd < endYmd;
  });

  if (currentDoc) {
    const data = currentDoc.data() as any;
    return String(data?.startYmd || currentDoc.id || "").trim();
  }

  const nextSnap = await db
    .collection("asistencia_programada")
    .where("startYmd", ">", todayYmd)
    .orderBy("startYmd", "asc")
    .limit(1)
    .get();

  if (!nextSnap.empty) {
    const data = nextSnap.docs[0].data() as any;
    return String(data?.startYmd || nextSnap.docs[0].id || "").trim();
  }

  return nextThursdayYmd(todayYmd);
}

function buildWeekDays(startYmd: string) {
  const start = new Date(`${startYmd}T00:00:00`);
  return Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(start.getTime() + (i + 1) * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  });
}

function cuadrillaGroupOrder(input: { categoria?: string; vehiculo?: string; nombre?: string }) {
  const categoria = String(input.categoria || "").toUpperCase();
  const vehiculo = String(input.vehiculo || "").toUpperCase();
  const nombre = String(input.nombre || "").toUpperCase();
  if (categoria === "RESIDENCIAL" || nombre.includes("RESIDENCIAL")) return 0;
  if (categoria === "CONDOMINIO" || vehiculo === "MOTO" || nombre.includes("MOTO")) return 1;
  return 2;
}

function normalizeCoordinatorState(raw: any) {
  const status = String(raw?.status || "SIN_INICIAR").toUpperCase();
  if (status === "CONFIRMADO") return "CONFIRMADO";
  if (status === "BORRADOR") return "BORRADOR";
  return "SIN_INICIAR";
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

    const db = adminDb();
    const { searchParams } = new URL(req.url);
    const startYmd = await resolveActiveStartYmd(db, String(searchParams.get("start") || "").trim());
    const endYmd = weekEnd(startYmd);

    const docRef = db.collection("asistencia_programada").doc(startYmd);
    const snap = await docRef.get();
    const data = snap.exists ? (snap.data() as any) : {};
    const estado = String(data?.estado || "ABIERTO");
    const openUntil = String(data?.openUntil || "").trim();
    const coordinadoresMeta = (data?.coordinadores || {}) as Record<string, any>;

    let q = db
      .collection("cuadrillas")
      .where("area", "==", "INSTALACIONES")
      .where("estado", "==", "HABILITADO");
    if (!canAdmin && canCoord) {
      q = q.where("coordinadorUid", "==", session.uid);
    }
    const cuadrillasSnap = await q.get();
    const cuadrillasRaw = cuadrillasSnap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        nombre: String(data?.nombre || d.id),
        categoria: String(data?.categoria || data?.r_c || "").trim(),
        vehiculo: String(data?.vehiculo || "").trim(),
        numeroCuadrilla: Number(data?.numeroCuadrilla || 0) || 0,
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
        categoria: c.categoria,
        vehiculo: c.vehiculo,
        numeroCuadrilla: c.numeroCuadrilla,
        coordinadorUid: c.coordinadorUid || "",
        coordinadorNombre: coordMap.get(c.coordinadorUid || "") || (c.coordinadorUid ? c.coordinadorUid : "-"),
      }))
      .sort((a, b) => {
        const groupDiff = cuadrillaGroupOrder(a) - cuadrillaGroupOrder(b);
        if (groupDiff !== 0) return groupDiff;

        const numDiff = (a.numeroCuadrilla || 0) - (b.numeroCuadrilla || 0);
        if (numDiff !== 0) return numDiff;

        return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
      });

    const coordinadoresEstado = Array.from(
      cuadrillas.reduce((acc, row) => {
        const uid = String(row.coordinadorUid || "").trim();
        if (!uid) return acc;
        const curr = acc.get(uid) || {
          coordinadorUid: uid,
          coordinadorNombre: row.coordinadorNombre || uid,
          status: "SIN_INICIAR",
          cuadrillas: 0,
          updatedAt: "",
          updatedBy: "",
          updatedByNombre: "",
          confirmedAt: "",
          confirmedBy: "",
          confirmedByNombre: "",
          reopenedAt: "",
          reopenedBy: "",
          reopenedByNombre: "",
        };
        const meta = coordinadoresMeta[uid] || {};
        curr.status = normalizeCoordinatorState(meta);
        curr.cuadrillas += 1;
        curr.updatedAt = String(meta?.updatedAt || curr.updatedAt || "");
        curr.updatedBy = String(meta?.updatedBy || curr.updatedBy || "");
        curr.updatedByNombre = String(meta?.updatedByNombre || curr.updatedByNombre || "");
        curr.confirmedAt = String(meta?.confirmedAt || curr.confirmedAt || "");
        curr.confirmedBy = String(meta?.confirmedBy || curr.confirmedBy || "");
        curr.confirmedByNombre = String(meta?.confirmedByNombre || curr.confirmedByNombre || "");
        curr.reopenedAt = String(meta?.reopenedAt || curr.reopenedAt || "");
        curr.reopenedBy = String(meta?.reopenedBy || curr.reopenedBy || "");
        curr.reopenedByNombre = String(meta?.reopenedByNombre || curr.reopenedByNombre || "");
        acc.set(uid, curr);
        return acc;
      }, new Map<string, any>()).values()
    ).sort((a, b) => a.coordinadorNombre.localeCompare(b.coordinadorNombre, "es", { sensitivity: "base" }));

    const myCoordinatorStatus = normalizeCoordinatorState(coordinadoresMeta[session.uid] || {});
    const coordinatorLocked = canCoord && !canAdmin && myCoordinatorStatus === "CONFIRMADO";

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
      coordinadoresEstado,
      myCoordinatorStatus,
      canEdit:
        canAdmin ||
        (canCoord &&
          !coordinatorLocked &&
          estado === "ABIERTO" &&
          (!openUntil || new Date().getTime() <= new Date(openUntil).getTime())),
      canConfirm:
        canCoord &&
        !canAdmin &&
        !coordinatorLocked &&
        estado === "ABIERTO" &&
        (!openUntil || new Date().getTime() <= new Date(openUntil).getTime()),
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
    const currentCoordinadores = (current?.coordinadores || {}) as Record<string, any>;
    const myCoordinatorStatus = normalizeCoordinatorState(currentCoordinadores[session.uid] || {});

    if (!canAdmin && estado === "CERRADO") {
      return NextResponse.json({ ok: false, error: "LOCKED" }, { status: 403 });
    }
    if (!canAdmin && canCoord && myCoordinatorStatus === "CONFIRMADO") {
      return NextResponse.json({ ok: false, error: "COORDINADOR_CONFIRMADO" }, { status: 403 });
    }

    const weekDays = buildWeekDays(startYmd);
    const itemsNext: Record<string, Record<string, string>> = { ...(current?.items || {}) };

    // merge updates
    Object.entries(items || {}).forEach(([cid, row]) => {
      itemsNext[cid] = { ...(itemsNext[cid] || {}), ...(row || {}) };
    });

    // validate max descanso per cuadrilla
    const maxDescanso = 2;
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
    const existingCoordinadores = currentCoordinadores;
    const nextCoordinadores = { ...existingCoordinadores };
    if (canCoord && !canAdmin) {
      const prev = existingCoordinadores[session.uid] || {};
      nextCoordinadores[session.uid] = {
        ...prev,
        status: "BORRADOR",
        updatedAt: new Date().toISOString(),
        updatedBy: session.uid,
        updatedByNombre: actorNombre,
      };
    }

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
        coordinadores: nextCoordinadores,
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
