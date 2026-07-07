import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";
import { coberturaTrasCambio, cupoYCuotaCoordinador, limaTodayYmd } from "@/domain/asistenciaProgramada/cobertura";

export const runtime = "nodejs";

function shortName(full: string, fallback: string) {
  const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
  const first = parts[0] || "";
  const firstLast = parts.length >= 4 ? parts[2] || "" : parts[1] || "";
  return `${first} ${firstLast}`.trim() || fallback;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    const roles = (session.access.roles || []).map((r: string) => String(r || "").toUpperCase());
    const canAdmin = session.isAdmin || roles.includes("GERENCIA") || roles.includes("JEFATURA");
    const canCoord = roles.includes("COORDINADOR");
    if (!canAdmin && !canCoord) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const accion = String(body?.accion || "").toUpperCase();
    const comment = String(body?.comment || "").trim();

    if (!["ACEPTAR", "RECHAZAR"].includes(accion)) {
      return NextResponse.json({ ok: false, error: "ACCION_INVALIDA" }, { status: 400 });
    }

    const db = adminDb();
    const solicitudRef = db.collection("solicitudes_cambio_asistencia").doc(id);
    const solicitudSnap = await solicitudRef.get();

    if (!solicitudSnap.exists) {
      return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    }

    const solicitud = solicitudSnap.data() as any;

    if (solicitud.estado !== "PENDIENTE") {
      return NextResponse.json({ ok: false, error: "YA_RESUELTA" }, { status: 409 });
    }

    if (!canAdmin && solicitud.propietarioUid !== session.uid) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    const resolverDoc = await db.collection("usuarios").doc(session.uid).get();
    const resolverData = resolverDoc.data() as any;
    const resolvedByNombre = shortName(
      `${resolverData?.nombres || ""} ${resolverData?.apellidos || ""}`.trim(),
      session.uid,
    );
    const resolvedAt = new Date().toISOString();

    if (accion === "RECHAZAR") {
      await solicitudRef.update({
        estado: "RECHAZADA",
        resolvedAt,
        resolvedBy: session.uid,
        resolvedByNombre,
        resolutionComment: comment,
      });
      return NextResponse.json({ ok: true, accion: "RECHAZADA" });
    }

    if (!canAdmin && String(solicitud.dia) < limaTodayYmd()) {
      return NextResponse.json(
        { ok: false, error: "No se puede aplicar: el día solicitado ya pasó." },
        { status: 400 },
      );
    }

    // ACEPTAR: validar cobertura y aplicar cambio atómicamente
    const weekRef = db.collection("asistencia_programada").doc(String(solicitud.startYmd));
    const weekSnap = await weekRef.get();
    const weekData = weekSnap.exists ? (weekSnap.data() as any) : {};

    if (String(weekData?.estado || "ABIERTO") === "CERRADO") {
      return NextResponse.json({ ok: false, error: "SEMANA_CERRADA" }, { status: 403 });
    }
    if (!canAdmin && String(weekData?.edicionCoordinadores || "ABIERTA").toUpperCase() === "PAUSADA") {
      return NextResponse.json(
        { ok: false, error: "Gerencia está revisando esta semana. La edición de coordinadores está pausada temporalmente." },
        { status: 403 },
      );
    }

    const items = (weekData?.items || {}) as Record<string, Record<string, string>>;

    const cuadrillasSnap = await db
      .collection("cuadrillas")
      .where("area", "==", "INSTALACIONES")
      .where("estado", "==", "HABILITADO")
      .get();
    const cuadrillas = cuadrillasSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as { categoria?: string; vehiculo?: string; nombre?: string; coordinadorUid?: string }),
    }));

    const coverageCheck = coberturaTrasCambio(
      String(solicitud.dia),
      String(solicitud.cuadrillaId),
      String(solicitud.estadoSolicitado),
      cuadrillas,
      items,
    );

    if (!coverageCheck.ok) {
      return NextResponse.json(
        { ok: false, error: "COBERTURA_INSUFICIENTE", reason: coverageCheck.reason },
        { status: 400 },
      );
    }

    const newItems = {
      ...items,
      [solicitud.cuadrillaId]: {
        ...(items[solicitud.cuadrillaId] || {}),
        [solicitud.dia]: solicitud.estadoSolicitado,
      },
    };

    // Es la cuadrilla del propietario la que cambia de estado — su cuota es la que se evalúa.
    if (solicitud.propietarioUid) {
      const cuotaCheck = cupoYCuotaCoordinador(String(solicitud.dia), String(solicitud.propietarioUid), cuadrillas, newItems);
      if (!cuotaCheck.ok) {
        return NextResponse.json(
          { ok: false, error: "CUOTA_EXCEDIDA", reason: cuotaCheck.errorMsg },
          { status: 400 },
        );
      }
    }

    // Aplicar cambio y marcar solicitud como aprobada en un batch
    const batch = db.batch();

    batch.set(weekRef, { items: newItems, updatedAt: resolvedAt }, { merge: true });
    batch.update(solicitudRef, {
      estado: "APROBADA",
      resolvedAt,
      resolvedBy: session.uid,
      resolvedByNombre,
      resolutionComment: comment,
    });

    await batch.commit();
    return NextResponse.json({ ok: true, accion: "APROBADA" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
