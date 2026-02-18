import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteState = "OPERATIVA" | "EN_CAMPO" | "RUTA_CERRADA";

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function tsToIso(v: any): string | null {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate().toISOString();
  if (typeof v?.seconds === "number") return new Date(v.seconds * 1000).toISOString();
  if (typeof v?._seconds === "number") return new Date(v._seconds * 1000).toISOString();
  return typeof v === "string" ? v : null;
}

function normalizeOrderState(raw: string): "AGENDADA" | "EN_CAMINO" | "FINALIZADA" | "OTROS" {
  const s = String(raw || "").toUpperCase();
  if (s.includes("FINAL")) return "FINALIZADA";
  if (s.includes("CAMINO")) return "EN_CAMINO";
  if (s.includes("AGEN")) return "AGENDADA";
  return "OTROS";
}

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    const canUse = session.isAdmin || session.access.roles.includes("GESTOR");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const db = adminDb();
    const ymd = todayLimaYmd();
    const uid = session.uid;
    const jornadaId = `${uid}_${ymd}`;
    const jornadaRef = db.collection("gestor_jornadas").doc(jornadaId);
    const presenciaRef = db.collection("gestor_presencia").doc(uid);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(jornadaRef);
      if (!snap.exists) {
        tx.set(jornadaRef, {
          uid,
          ymd,
          estadoTurno: "EN_TURNO",
          ingresoAt: FieldValue.serverTimestamp(),
          salidaAt: null,
          refrigerio: {
            inicioAt: null,
            finAt: null,
            duracionMin: 0,
          },
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: uid,
        });
      }
      tx.set(
        presenciaRef,
        {
          uid,
          online: true,
          lastSeenAt: FieldValue.serverTimestamp(),
          source: "WEB",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

    const [jornadaSnap, cuadrillasSnap, ordenesSnap, notifsSnap] = await Promise.all([
      jornadaRef.get(),
      db.collection("cuadrillas").where("gestorUid", "==", uid).get(),
      db.collection("ordenes").where("gestorCuadrilla", "==", uid).limit(3000).get(),
      db.collection("notificaciones").orderBy("createdAt", "desc").limit(40).get(),
    ]);

    const cuadrillas = cuadrillasSnap.docs.map((d) => ({
      id: d.id,
      nombre: String((d.data() as any)?.nombre || d.id),
    }));
    const cuadrillaIds = cuadrillas.map((c) => c.id);

    const stateRefs = cuadrillaIds.map((id) =>
      db.collection("cuadrilla_estado_diario").doc(`${ymd}_${id}`)
    );
    const stateSnaps = stateRefs.length ? await db.getAll(...stateRefs) : [];
    const stateMap = new Map<string, RouteState>();
    for (const s of stateSnaps) {
      const data = s.data() as any;
      const cuadrillaId = String(data?.cuadrillaId || "");
      if (!cuadrillaId) continue;
      const estado = String(data?.estadoRuta || "OPERATIVA").toUpperCase();
      const safe = estado === "EN_CAMPO" || estado === "RUTA_CERRADA" ? estado : "OPERATIVA";
      stateMap.set(cuadrillaId, safe as RouteState);
    }

    const statsByCuadrilla = new Map<
      string,
      { total: number; agendada: number; enCamino: number; finalizada: number; otros: number; llamadasTotal: number; llamadasRealizadas: number }
    >();
    for (const c of cuadrillas) {
      statsByCuadrilla.set(c.id, {
        total: 0,
        agendada: 0,
        enCamino: 0,
        finalizada: 0,
        otros: 0,
        llamadasTotal: 0,
        llamadasRealizadas: 0,
      });
    }

    for (const doc of ordenesSnap.docs) {
      const x = doc.data() as any;
      const orderYmd = String(x?.fechaFinVisiYmd || x?.fSoliYmd || "").trim();
      if (orderYmd !== ymd) continue;
      const cuadrillaId = String(x?.cuadrillaId || "").trim();
      if (!cuadrillaId || !statsByCuadrilla.has(cuadrillaId)) continue;

      const st = statsByCuadrilla.get(cuadrillaId)!;
      st.total += 1;
      const bucket = normalizeOrderState(String(x?.estado || ""));
      if (bucket === "AGENDADA") st.agendada += 1;
      else if (bucket === "EN_CAMINO") st.enCamino += 1;
      else if (bucket === "FINALIZADA") st.finalizada += 1;
      else st.otros += 1;

      st.llamadasTotal += 1;
      const llamada = String(x?.estadoLlamada || "").trim();
      if (llamada) st.llamadasRealizadas += 1;
    }

    const notifImport = notifsSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .find((n) => {
        const title = String(n?.title || "").toUpperCase();
        const entityType = String(n?.entityType || "").toUpperCase();
        return entityType === "ORDENES" && title.includes("IMPORT");
      });

    let importUserName = "";
    if (notifImport?.createdBy) {
      const u = await db.collection("usuarios").doc(String(notifImport.createdBy)).get();
      if (u.exists) {
        const data = u.data() as any;
        importUserName = String(
          data?.displayName || `${data?.nombres || ""} ${data?.apellidos || ""}`.trim()
        );
      }
    }

    const jornada = (jornadaSnap.data() || {}) as any;
    const out = {
      ok: true,
      jornada: {
        ymd,
        estadoTurno: String(jornada?.estadoTurno || "EN_TURNO").toUpperCase(),
        ingresoAt: tsToIso(jornada?.ingresoAt),
        salidaAt: tsToIso(jornada?.salidaAt),
        refrigerio: {
          inicioAt: tsToIso(jornada?.refrigerio?.inicioAt),
          finAt: tsToIso(jornada?.refrigerio?.finAt),
          duracionMin: Number(jornada?.refrigerio?.duracionMin || 0),
        },
      },
      cuadrillas: cuadrillas.map((c) => {
        const st = statsByCuadrilla.get(c.id)!;
        const estadoRuta = stateMap.get(c.id) || "OPERATIVA";
        return {
          cuadrillaId: c.id,
          cuadrillaNombre: c.nombre,
          estadoRuta,
          ordenes: {
            total: st.total,
            agendada: st.agendada,
            enCamino: st.enCamino,
            finalizada: st.finalizada,
            otros: st.otros,
          },
          llamadas: {
            total: st.llamadasTotal,
            realizadas: st.llamadasRealizadas,
            completas: st.llamadasTotal > 0 && st.llamadasRealizadas >= st.llamadasTotal,
          },
        };
      }),
      ultimaImportacion: notifImport
        ? {
            at: tsToIso(notifImport.createdAt),
            byUid: String(notifImport.createdBy || ""),
            byNombre: importUserName || String(notifImport.createdBy || ""),
            message: String(notifImport.message || ""),
          }
        : null,
    };

    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
