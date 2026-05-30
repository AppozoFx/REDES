import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES_PERMITIDOS = ["GESTOR", "JEFATURA", "GERENCIA"];

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }

    const userRoles = session.access.roles.map((r) => r.toUpperCase());
    const canAct = session.isAdmin || userRoles.some((r) => ROLES_PERMITIDOS.includes(r));
    if (!canAct) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const alertaId = String(params.id || "").trim();
    if (!alertaId) return NextResponse.json({ ok: false, error: "ID_REQUIRED" }, { status: 400 });

    const raw = (await req.json().catch(() => ({}))) as { accion?: string };
    const accion = String(raw?.accion || "").trim().toUpperCase();
    if (!["ACEPTAR", "RECHAZAR"].includes(accion)) {
      return NextResponse.json({ ok: false, error: "ACCION_INVALIDA" }, { status: 400 });
    }

    const db = adminDb();
    const alertaRef = db.collection("alertas_app").doc(alertaId);
    const alertaSnap = await alertaRef.get();

    if (!alertaSnap.exists) {
      return NextResponse.json({ ok: false, error: "ALERTA_NOT_FOUND" }, { status: 404 });
    }

    const alerta = alertaSnap.data() as any;
    if (alerta.estado !== "PENDIENTE") {
      return NextResponse.json({ ok: false, error: "ALERTA_YA_RESPONDIDA" }, { status: 409 });
    }

    const respondidoPorRol = userRoles.find((r) => ROLES_PERMITIDOS.includes(r)) ?? "ADMIN";
    const nuevoEstado = accion === "ACEPTAR" ? "ACEPTADA" : "RECHAZADA";

    // Obtener nombre real del respondedor
    const respondedorSnap = await db.collection("usuarios").doc(session.uid).get();
    const respondedorData = respondedorSnap.exists ? (respondedorSnap.data() as any) : {};
    const respondedorNombre = `${String(respondedorData?.nombres || "").trim()} ${String(respondedorData?.apellidos || "").trim()}`.trim() || session.uid;

    await alertaRef.update({
      estado: nuevoEstado,
      respondidoAt: FieldValue.serverTimestamp(),
      respondidoPorUid: session.uid,
      respondidoPorNombre: respondedorNombre,
      respondidoPorRol: respondidoPorRol,
    });

    const cuadrillaId = String(alerta.cuadrillaId || "").trim();

    if (accion === "ACEPTAR") {
      // --- CERRAR_RUTA: actualizar cuadrilla_estado_diario ---
      if (alerta.tipo === "CERRAR_RUTA" && cuadrillaId) {
        const ymd = todayLimaYmd();
        const cuadrillaNombre = String(alerta.cuadrillaNombre || cuadrillaId);
        await db.collection("cuadrilla_estado_diario").doc(`${ymd}_${cuadrillaId}`).set(
          {
            ymd,
            cuadrillaId,
            cuadrillaNombre,
            gestorUid: session.uid,
            estadoRuta: "RUTA_CERRADA",
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: session.uid,
          },
          { merge: true }
        );
      }

      // --- Notificar al técnico en la campana (CERRAR_RUTA y REQUIERE_ATENCION) ---
      const firmante = `${respondedorNombre} (${respondidoPorRol})`;
      const notifMap: Record<string, { tipo: string; titulo: string; mensaje: string }> = {
        CERRAR_RUTA: {
          tipo: "CERRAR_RUTA_APROBADA",
          titulo: "Solicitud de cierre aprobada",
          mensaje: `Aprobada por ${firmante}.`,
        },
        REQUIERE_ATENCION: {
          tipo: "ATENCION_ATENDIDA",
          titulo: "Solicitud de atención atendida",
          mensaje: `Atendida por ${firmante}.`,
        },
      };

      const notifPayload = notifMap[alerta.tipo];
      if (notifPayload && cuadrillaId) {
        const notiRef = db
          .collection("notificaciones_tecnico")
          .doc(cuadrillaId)
          .collection("items")
          .doc();
        await notiRef.set({
          ...notifPayload,
          datos: { alertaId },
          leido: false,
          creadoAt: FieldValue.serverTimestamp(),
        });
      }
    }

    return NextResponse.json({ ok: true, estado: nuevoEstado });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
