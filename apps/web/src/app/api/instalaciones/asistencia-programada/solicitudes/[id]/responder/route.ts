import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

const COBERTURA_REGLAS: Record<number, {
  minPct: number;
  byCategoria?: { RESIDENCIAL: number; MOTO: number };
}> = {
  0: { minPct: 0, byCategoria: { RESIDENCIAL: 60, MOTO: 40 } },
  1: { minPct: 70 },
  2: { minPct: 85 },
  3: { minPct: 85 },
  4: { minPct: 85 },
  5: { minPct: 85 },
  6: { minPct: 97 },
};

const DAY_NAMES: Record<number, string> = {
  0: "Domingo", 1: "Lunes", 2: "Martes", 3: "Miércoles",
  4: "Jueves", 5: "Viernes", 6: "Sábado",
};

function categoriaCuadrilla(c: { categoria?: string; vehiculo?: string; nombre?: string }) {
  const cat = String(c.categoria || "").toUpperCase();
  const veh = String(c.vehiculo || "").toUpperCase();
  const nom = String(c.nombre || "").toUpperCase();
  if (cat === "RESIDENCIAL" || nom.includes("RESIDENCIAL")) return "RESIDENCIAL";
  if (cat === "CONDOMINIO" || veh === "MOTO" || nom.includes("MOTO")) return "MOTO";
  return "OTRO";
}

function checkCoverage(
  dia: string,
  cuadrillaId: string,
  nuevoEstado: string,
  cuadrillas: Array<{ id: string; categoria?: string; vehiculo?: string; nombre?: string }>,
  items: Record<string, Record<string, string>>,
): { ok: boolean; reason?: string } {
  const dow = new Date(`${dia}T00:00:00`).getDay();
  const regla = COBERTURA_REGLAS[dow];
  if (!regla) return { ok: true };

  const simItems: Record<string, Record<string, string>> = { ...items };
  simItems[cuadrillaId] = { ...(items[cuadrillaId] || {}), [dia]: nuevoEstado };

  const isAsistencia = (cid: string) =>
    String(simItems[cid]?.[dia] || "asistencia").toLowerCase() === "asistencia";

  const total = cuadrillas.length;
  if (total === 0) return { ok: true };

  if (dow === 0 && regla.byCategoria) {
    const residenciales = cuadrillas.filter((c) => categoriaCuadrilla(c) === "RESIDENCIAL");
    const motos = cuadrillas.filter((c) => categoriaCuadrilla(c) === "MOTO");

    if (residenciales.length > 0) {
      const resPct = Math.round(
        (residenciales.filter((c) => isAsistencia(c.id)).length / residenciales.length) * 100,
      );
      if (resPct < regla.byCategoria.RESIDENCIAL) {
        return {
          ok: false,
          reason: `Cobertura Residencial insuficiente para Domingo: ${resPct}% (mínimo ${regla.byCategoria.RESIDENCIAL}%)`,
        };
      }
    }
    if (motos.length > 0) {
      const motoPct = Math.round(
        (motos.filter((c) => isAsistencia(c.id)).length / motos.length) * 100,
      );
      if (motoPct < regla.byCategoria.MOTO) {
        return {
          ok: false,
          reason: `Cobertura Moto insuficiente para Domingo: ${motoPct}% (mínimo ${regla.byCategoria.MOTO}%)`,
        };
      }
    }
    return { ok: true };
  }

  const asistentes = cuadrillas.filter((c) => isAsistencia(c.id)).length;
  const pct = Math.round((asistentes / total) * 100);

  if (pct < regla.minPct) {
    return {
      ok: false,
      reason: `Cobertura insuficiente para ${DAY_NAMES[dow] ?? "ese día"}: ${pct}% (mínimo ${regla.minPct}%)`,
    };
  }

  return { ok: true };
}

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

    // ACEPTAR: validar cobertura y aplicar cambio atómicamente
    const weekRef = db.collection("asistencia_programada").doc(String(solicitud.startYmd));
    const weekSnap = await weekRef.get();
    const weekData = weekSnap.exists ? (weekSnap.data() as any) : {};

    if (String(weekData?.estado || "ABIERTO") === "CERRADO") {
      return NextResponse.json({ ok: false, error: "SEMANA_CERRADA" }, { status: 403 });
    }

    const items = (weekData?.items || {}) as Record<string, Record<string, string>>;

    const cuadrillasSnap = await db
      .collection("cuadrillas")
      .where("area", "==", "INSTALACIONES")
      .where("estado", "==", "HABILITADO")
      .get();
    const cuadrillas = cuadrillasSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as { categoria?: string; vehiculo?: string; nombre?: string }),
    }));

    const coverageCheck = checkCoverage(
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

    // Aplicar cambio y marcar solicitud como aprobada en un batch
    const batch = db.batch();

    const newItems = {
      ...items,
      [solicitud.cuadrillaId]: {
        ...(items[solicitud.cuadrillaId] || {}),
        [solicitud.dia]: solicitud.estadoSolicitado,
      },
    };

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
