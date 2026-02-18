import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ActionType =
  | "HEARTBEAT"
  | "INICIAR_REFRIGERIO"
  | "TERMINAR_REFRIGERIO"
  | "FINALIZAR_TURNO";

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    const canUse = session.isAdmin || session.access.roles.includes("GESTOR");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as { action?: ActionType };
    const action = String(body?.action || "").toUpperCase() as ActionType;
    const allowed: ActionType[] = ["HEARTBEAT", "INICIAR_REFRIGERIO", "TERMINAR_REFRIGERIO", "FINALIZAR_TURNO"];
    if (!allowed.includes(action)) {
      return NextResponse.json({ ok: false, error: "ACTION_INVALIDA" }, { status: 400 });
    }

    const db = adminDb();
    const uid = session.uid;
    const ymd = todayLimaYmd();
    const jornadaRef = db.collection("gestor_jornadas").doc(`${uid}_${ymd}`);
    const presenciaRef = db.collection("gestor_presencia").doc(uid);

    let errorCode = "";
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(jornadaRef);
      const data = (snap.data() || {}) as any;

      const ensureBase = () => {
        if (!snap.exists) {
          tx.set(jornadaRef, {
            uid,
            ymd,
            estadoTurno: "EN_TURNO",
            ingresoAt: FieldValue.serverTimestamp(),
            salidaAt: null,
            refrigerio: { inicioAt: null, finAt: null, duracionMin: 0 },
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: uid,
          });
        }
      };

      ensureBase();

      if (action === "HEARTBEAT") {
        tx.set(
          presenciaRef,
          {
            uid,
            online: true,
            source: "WEB",
            lastSeenAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        tx.set(
          jornadaRef,
          { updatedAt: FieldValue.serverTimestamp(), updatedBy: uid },
          { merge: true }
        );
        return;
      }

      const estadoTurno = String(data?.estadoTurno || "EN_TURNO").toUpperCase();
      const refInicio = data?.refrigerio?.inicioAt;
      const refFin = data?.refrigerio?.finAt;
      const duracionMin = Number(data?.refrigerio?.duracionMin || 0);

      if (action === "INICIAR_REFRIGERIO") {
        if (estadoTurno === "FINALIZADO") {
          errorCode = "TURNO_FINALIZADO";
          return;
        }
        if (refInicio && refFin) {
          errorCode = "REFRIGERIO_YA_USADO";
          return;
        }
        if (refInicio && !refFin) {
          errorCode = "REFRIGERIO_EN_CURSO";
          return;
        }
        tx.set(
          jornadaRef,
          {
            estadoTurno: "EN_REFRIGERIO",
            refrigerio: {
              inicioAt: FieldValue.serverTimestamp(),
              finAt: null,
              duracionMin,
            },
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: uid,
          },
          { merge: true }
        );
      }

      if (action === "TERMINAR_REFRIGERIO") {
        if (!refInicio) {
          errorCode = "REFRIGERIO_NO_INICIADO";
          return;
        }
        if (refFin) {
          errorCode = "REFRIGERIO_YA_TERMINADO";
          return;
        }
        const startMillis =
          typeof refInicio?.toMillis === "function" ? refInicio.toMillis() : Date.now();
        const nowMillis = Date.now();
        const extra = Math.max(0, Math.round((nowMillis - startMillis) / 60000));

        tx.set(
          jornadaRef,
          {
            estadoTurno: "EN_TURNO",
            refrigerio: {
              inicioAt: refInicio,
              finAt: FieldValue.serverTimestamp(),
              duracionMin: duracionMin + extra,
            },
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: uid,
          },
          { merge: true }
        );
      }

      if (action === "FINALIZAR_TURNO") {
        if (estadoTurno === "EN_REFRIGERIO") {
          errorCode = "TERMINA_REFRIGERIO_PRIMERO";
          return;
        }
        if (estadoTurno === "FINALIZADO") return;
        tx.set(
          jornadaRef,
          {
            estadoTurno: "FINALIZADO",
            salidaAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: uid,
          },
          { merge: true }
        );
        tx.set(
          presenciaRef,
          {
            uid,
            online: false,
            source: "WEB",
            lastSeenAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      } else {
        tx.set(
          presenciaRef,
          {
            uid,
            online: true,
            source: "WEB",
            lastSeenAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    });

    if (errorCode) {
      return NextResponse.json({ ok: false, error: errorCode }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
