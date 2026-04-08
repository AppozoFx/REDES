import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

type Scope = "all" | "coordinador" | "tecnico";

function toYmd(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDays(d: Date, n: number) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

function toDate(anchor: string) {
  const raw = String(anchor || "").trim();
  if (!raw) return new Date();
  // Fecha estable en zona Lima para evitar desfases por timezone del servidor.
  const d = new Date(`${raw}T12:00:00-05:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function rollingAnchors(anchorYmd: string) {
  const end = toDate(anchorYmd);
  const start = addDays(end, -7);
  return {
    startYmd: toYmd(start),
    endYmd: toYmd(end),
    periodKey: `${toYmd(start)}_${toYmd(end)}`,
  };
}

function resolveScope(roles: string[], isAdmin: boolean): Scope {
  const isPrivileged =
    isAdmin ||
    roles.includes("GERENCIA") ||
    roles.includes("ALMACEN") ||
    roles.includes("RRHH");
  if (isPrivileged) return "all";
  if (roles.includes("COORDINADOR")) return "coordinador";
  if (roles.includes("TECNICO")) return "tecnico";
  return "all";
}

function asStr(v: any) {
  return String(v || "").trim();
}

function asArray(v: any) {
  return Array.isArray(v) ? v.map((x) => String(x || "").trim()).filter(Boolean) : [];
}

function toInt(v: any) {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }

    const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
    const canUse =
      session.isAdmin ||
      (session.access.areas || []).includes("INSTALACIONES") ||
      roles.includes("COORDINADOR") ||
      roles.includes("TECNICO") ||
      session.permissions.includes("EQUIPOS_DESPACHO") ||
      session.permissions.includes("MATERIALES_TRANSFER_SERVICIO");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const body = await req.json().catch(() => null);
    const anchor = asStr(body?.anchor) || toYmd(new Date());
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    if (!rows.length) return NextResponse.json({ ok: false, error: "ROWS_REQUIRED" }, { status: 400 });
    const availableStock = body?.availableStock || {};
    const availablePrecon = body?.availablePrecon || {};

    const scope = resolveScope(roles, session.isAdmin);
    if (scope !== "all") {
      return NextResponse.json({ ok: false, error: "READ_ONLY_ROLE" }, { status: 403 });
    }
    const db = adminDb();
    const cqSnap = await db.collection("cuadrillas").where("area", "==", "INSTALACIONES").limit(2500).get();
    let cuadrillas = cqSnap.docs.map((d) => {
      const x = d.data() as any;
      return {
        id: d.id,
        coordinadorUid: asStr(x?.coordinadorUid || x?.coordinadoraUid || x?.coordinadorId || x?.coordinadoraId),
        tecnicosUids: Array.from(new Set([
          ...asArray(x?.tecnicosUids),
          ...asArray(x?.tecnicosIds),
          ...asArray(x?.tecnicos),
        ])),
      };
    });

    const allowed = new Set(cuadrillas.map((c) => c.id));
    const uid = session.uid;
    const period = rollingAnchors(anchor);
    const batchId = asStr(body?.batchId) || `${new Date().toISOString()}_${uid}`;
    const now = new Date().toISOString();
    const userName = asStr(body?.userName || uid);
    const totalPlan = { ONT: 0, MESH: 0, FONO: 0, BOX: 0 };
    const totalPrecon = { PRECON_50: 0, PRECON_100: 0, PRECON_150: 0, PRECON_200: 0 };

    let saved = 0;
    const batch = db.batch();
    for (const row of rows) {
      const cuadrillaId = asStr(row?.cuadrillaId);
      if (!cuadrillaId || !allowed.has(cuadrillaId)) continue;
      const omitida = !!row?.omitida;
      const final = row?.final || {};
      const precon = row?.precon || {};
      if (!omitida) {
        totalPlan.ONT += toInt(final?.ONT);
        totalPlan.MESH += toInt(final?.MESH);
        totalPlan.FONO += toInt(final?.FONO);
        totalPlan.BOX += toInt(final?.BOX);
        totalPrecon.PRECON_50 += toInt(precon?.PRECON_50);
        totalPrecon.PRECON_100 += toInt(precon?.PRECON_100);
        totalPrecon.PRECON_150 += toInt(precon?.PRECON_150);
        totalPrecon.PRECON_200 += toInt(precon?.PRECON_200);
      }
      const ref = db.collection("instalaciones_predespacho").doc(`${period.periodKey}_${cuadrillaId}`);
      batch.set(ref, {
        periodKey: period.periodKey,
        startYmd: period.startYmd,
        endYmd: period.endYmd,
        cuadrillaId,
        objetivo: row?.objetivo || {},
        consumo: row?.consumo || {},
        stock: row?.stock || {},
        sugerido: row?.sugerido || {},
        manual: row?.manual || {},
        final,
        omitida,
        bobinaResi: Number(row?.bobinaResi || 0),
        rolloCondo: !!row?.rolloCondo,
        precon,
        nota: asStr(row?.nota || ""),
        saveBatchId: batchId,
        updatedAt: now,
        updatedBy: uid,
        updatedByName: userName,
      }, { merge: true });
      saved += 1;
    }

    if (!saved) return NextResponse.json({ ok: false, error: "NO_ALLOWED_ROWS" }, { status: 400 });
    if (
      totalPlan.ONT > toInt(availableStock?.ONT) ||
      totalPlan.MESH > toInt(availableStock?.MESH) ||
      totalPlan.FONO > toInt(availableStock?.FONO) ||
      totalPlan.BOX > toInt(availableStock?.BOX)
    ) {
      return NextResponse.json({ ok: false, error: "STOCK_INSUFFICIENT" }, { status: 400 });
    }
    if (
      totalPrecon.PRECON_50 > toInt(availablePrecon?.PRECON_50) ||
      totalPrecon.PRECON_100 > toInt(availablePrecon?.PRECON_100) ||
      totalPrecon.PRECON_150 > toInt(availablePrecon?.PRECON_150) ||
      totalPrecon.PRECON_200 > toInt(availablePrecon?.PRECON_200)
    ) {
      return NextResponse.json({ ok: false, error: "PRECON_STOCK_INSUFFICIENT" }, { status: 400 });
    }
    await batch.commit();
    return NextResponse.json({ ok: true, saved, periodKey: period.periodKey, batchId });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}

