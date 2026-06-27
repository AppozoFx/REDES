import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

// Solo asistencia↔descanso están permitidos en solicitudes de cambio
const ESTADOS_SOLICITUD = ["asistencia", "descanso"];

// DOW 0=Dom 1=Lun ... 6=Sab
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

  // Simular el cambio
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

export async function GET(req: Request) {
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

    const { searchParams } = new URL(req.url);
    const startYmd = String(searchParams.get("startYmd") || "").trim();
    if (!startYmd) return NextResponse.json({ ok: false, error: "MISSING_START" }, { status: 400 });

    const db = adminDb();

    if (canAdmin) {
      const snap = await db
        .collection("solicitudes_cambio_asistencia")
        .where("startYmd", "==", startYmd)
        .get();
      const solicitudes = snap.docs
        .map((doc) => ({ id: doc.id, ...(doc.data() as object) }))
        .sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      return NextResponse.json({ ok: true, solicitudes });
    }

    // Coordinador: recibidas + enviadas (dos queries por limitación Firestore)
    const [recibidas, enviadas] = await Promise.all([
      db
        .collection("solicitudes_cambio_asistencia")
        .where("startYmd", "==", startYmd)
        .where("propietarioUid", "==", session.uid)
        .get(),
      db
        .collection("solicitudes_cambio_asistencia")
        .where("startYmd", "==", startYmd)
        .where("solicitanteUid", "==", session.uid)
        .get(),
    ]);

    const seen = new Set<string>();
    const solicitudes: object[] = [];
    [...recibidas.docs, ...enviadas.docs].forEach((doc) => {
      if (!seen.has(doc.id)) {
        seen.add(doc.id);
        solicitudes.push({ id: doc.id, ...(doc.data() as object) });
      }
    });
    solicitudes.sort((a: any, b: any) =>
      String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
    );

    return NextResponse.json({ ok: true, solicitudes });
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
    const roles = (session.access.roles || []).map((r: string) => String(r || "").toUpperCase());
    const canAdmin = session.isAdmin || roles.includes("GERENCIA") || roles.includes("JEFATURA");
    const canCoord = roles.includes("COORDINADOR");
    if (!canAdmin && !canCoord) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const body = await req.json();
    const { startYmd, dia, cuadrillaId, estadoSolicitado, mensaje } = body;

    if (!startYmd || !dia || !cuadrillaId || !estadoSolicitado) {
      return NextResponse.json({ ok: false, error: "MISSING_FIELDS" }, { status: 400 });
    }
    if (!ESTADOS_SOLICITUD.includes(String(estadoSolicitado).toLowerCase())) {
      return NextResponse.json({ ok: false, error: "ESTADO_INVALIDO" }, { status: 400 });
    }

    const db = adminDb();

    // Verificar que la semana está abierta
    const weekDoc = await db.collection("asistencia_programada").doc(String(startYmd)).get();
    const weekData = weekDoc.exists ? (weekDoc.data() as any) : {};
    if (String(weekData?.estado || "ABIERTO") === "CERRADO") {
      return NextResponse.json({ ok: false, error: "SEMANA_CERRADA" }, { status: 403 });
    }

    // Verificar cuadrilla y propietario
    const cuadrillaDoc = await db.collection("cuadrillas").doc(String(cuadrillaId)).get();
    if (!cuadrillaDoc.exists) {
      return NextResponse.json({ ok: false, error: "CUADRILLA_NOT_FOUND" }, { status: 404 });
    }
    const cuadrillaData = cuadrillaDoc.data() as any;
    const propietarioUid = String(cuadrillaData?.coordinadorUid || "").trim();

    if (!canAdmin && propietarioUid === session.uid) {
      return NextResponse.json({ ok: false, error: "ES_CUADRILLA_PROPIA" }, { status: 400 });
    }

    const items = (weekData?.items || {}) as Record<string, Record<string, string>>;
    const estadoActual = String(items[cuadrillaId]?.[dia] || "asistencia").toLowerCase();

    if (estadoActual === String(estadoSolicitado).toLowerCase()) {
      return NextResponse.json({ ok: false, error: "MISMO_ESTADO" }, { status: 400 });
    }

    // Verificar que no hay ya una solicitud PENDIENTE para esta celda
    const pendSnap = await db
      .collection("solicitudes_cambio_asistencia")
      .where("startYmd", "==", String(startYmd))
      .where("cuadrillaId", "==", String(cuadrillaId))
      .where("dia", "==", String(dia))
      .where("estado", "==", "PENDIENTE")
      .limit(1)
      .get();
    if (!pendSnap.empty) {
      return NextResponse.json({ ok: false, error: "YA_EXISTE_PENDIENTE" }, { status: 409 });
    }

    // Cargar todas las cuadrillas (necesario para cobertura y validación de categoría)
    const cuadrillasSnap = await db
      .collection("cuadrillas")
      .where("area", "==", "INSTALACIONES")
      .where("estado", "==", "HABILITADO")
      .get();
    const cuadrillas = cuadrillasSnap.docs.map((d) => {
      const cd = d.data() as any;
      return {
        id: d.id,
        categoria: String(cd?.categoria || ""),
        vehiculo: String(cd?.vehiculo || ""),
        nombre: String(cd?.nombre || ""),
        coordinadorUid: String(cd?.coordinadorUid || ""),
      };
    });

    // Validar que la cuadrilla target sea de la misma categoría que las del solicitante
    if (!canAdmin) {
      const misCategoriasSet = new Set(
        cuadrillas
          .filter((c) => c.coordinadorUid === session.uid)
          .map((c) => categoriaCuadrilla(c)),
      );
      const targetCategoria = categoriaCuadrilla(cuadrillaData);
      if (misCategoriasSet.size > 0 && !misCategoriasSet.has(targetCategoria)) {
        return NextResponse.json({ ok: false, error: "CATEGORIA_DIFERENTE" }, { status: 400 });
      }
    }

    const coverageCheck = checkCoverage(
      String(dia),
      String(cuadrillaId),
      String(estadoSolicitado).toLowerCase(),
      cuadrillas,
      items,
    );
    if (!coverageCheck.ok) {
      return NextResponse.json(
        { ok: false, error: "COBERTURA_INSUFICIENTE", reason: coverageCheck.reason },
        { status: 400 },
      );
    }

    // Obtener nombres
    const [solicitanteDoc, propietarioDoc] = await Promise.all([
      db.collection("usuarios").doc(session.uid).get(),
      propietarioUid ? db.collection("usuarios").doc(propietarioUid).get() : Promise.resolve(null),
    ]);
    const solData = solicitanteDoc.data() as any;
    const solicitanteNombre =
      shortName(`${solData?.nombres || ""} ${solData?.apellidos || ""}`.trim(), session.uid);
    const propData = propietarioDoc?.data() as any;
    const propietarioNombre = propietarioUid
      ? shortName(`${propData?.nombres || ""} ${propData?.apellidos || ""}`.trim(), propietarioUid)
      : "-";

    const docData = {
      startYmd: String(startYmd),
      dia: String(dia),
      cuadrillaId: String(cuadrillaId),
      cuadrillaNombre: String(cuadrillaData?.nombre || cuadrillaId),
      estadoActual,
      estadoSolicitado: String(estadoSolicitado).toLowerCase(),
      solicitanteUid: session.uid,
      solicitanteNombre,
      propietarioUid,
      propietarioNombre,
      estado: "PENDIENTE",
      mensaje: String(mensaje || "").trim(),
      createdAt: new Date().toISOString(),
    };

    const ref = await db.collection("solicitudes_cambio_asistencia").add(docData);
    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
