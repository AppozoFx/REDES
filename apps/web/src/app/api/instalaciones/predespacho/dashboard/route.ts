import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

type Scope = "all" | "coordinador" | "tecnico";
const EQUIPOS = ["ONT", "MESH", "FONO", "BOX"] as const;

function toYmd(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function shortName(full: string) {
  const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  const first = parts[0] || "";
  const last = parts[1] || "";
  return `${first} ${last}`.trim() || first;
}

function toDate(anchor: string) {
  const raw = String(anchor || "").trim();
  if (!raw) return new Date();
  // Fecha estable en zona Lima para evitar desfases por timezone del servidor.
  const d = new Date(`${raw}T12:00:00-05:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function addDays(d: Date, n: number) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

async function cleanupOldPredespacho(db: FirebaseFirestore.Firestore) {
  const cutoff = addDays(new Date(), -56);
  const cutoffYmd = toYmd(cutoff);

  const runDeleteByField = async (field: "endYmd" | "curYmd") => {
    const snap = await db
      .collection("instalaciones_predespacho")
      .where(field, "<=", cutoffYmd)
      .limit(400)
      .get();
    if (snap.empty) return 0;
    const batch = db.batch();
    let n = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref);
      n += 1;
    }
    await batch.commit();
    return n;
  };

  try {
    await runDeleteByField("endYmd");
    await runDeleteByField("curYmd");
  } catch {
    // no bloquear dashboard por limpieza
  }
}

function rollingAnchors(anchorYmd: string) {
  const end = toDate(anchorYmd);
  const start = addDays(end, -7);
  return {
    start,
    end,
    startYmd: toYmd(start),
    endYmd: toYmd(end),
    periodKey: `${toYmd(start)}_${toYmd(end)}`,
    days: 8,
  };
}

function emptyCounts() {
  return { ONT: 0, MESH: 0, FONO: 0, BOX: 0 };
}

function toInt(v: any) {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

function countFromArrayOrStr(v: any) {
  if (Array.isArray(v)) return v.filter(Boolean).length;
  if (typeof v === "string" && v.trim()) return 1;
  return 0;
}

function parseCantidadMeshFromPlan(plan: any) {
  const s = String(plan || "");
  const m = s.match(/cantidad\s*de\s*mesh\s*:\s*(\d+)/i);
  return m ? toInt(m[1]) : 0;
}

function parseCantidadBoxFromPlan(plan: any) {
  const s = String(plan || "");
  const m1 = s.match(/\+\s*(\d+)\s*win\s*box/i);
  const m2 = s.match(/\b(\d+)\s*win\s*box\b/i);
  const m3 = s.match(/win\s*box\s*x\s*(\d+)/i);
  return toInt((m1 && m1[1]) || (m2 && m2[1]) || (m3 && m3[1]) || 0);
}

function countONT(x: any) {
  if (String(x?.snONT || "").trim()) return 1;
  if (String(x?.proidONT || "").trim()) return 1;
  if (String(x?.proid || "").trim()) return 1;
  if (Array.isArray(x?.snONTs)) return x.snONTs.filter(Boolean).length;
  return 0;
}

function countMESH(x: any) {
  const fromSeries = countFromArrayOrStr(x?.snMESH || x?.snMESHs);
  if (fromSeries) return fromSeries;
  const fromField = toInt(x?.cantMESHwin ?? x?.cantMeshwin ?? x?.cantidadMesh ?? x?.cantMesh ?? 0);
  if (fromField) return fromField;
  if (String(x?.kitWifiPro || "").match(/kit/i)) return 1;
  return parseCantidadMeshFromPlan(x?.plan);
}

function countBOX(x: any) {
  const fromSeries = countFromArrayOrStr(x?.snBOX || x?.snBOXs);
  if (fromSeries) return fromSeries;
  const fromField = toInt(x?.cantBOXwin ?? x?.cantidadBox ?? x?.cantBox ?? 0);
  if (fromField) return fromField;
  return parseCantidadBoxFromPlan(x?.plan);
}

function countFONO(x: any) {
  const fromSeries = countFromArrayOrStr(x?.snFONO || x?.snFONOs);
  if (fromSeries) return fromSeries;
  return toInt(x?.cantFONOwin ?? x?.cantidadFono ?? x?.cantFono ?? 0);
}

function asArray(v: any) {
  return Array.isArray(v) ? v.map((x) => String(x || "").trim()).filter(Boolean) : [];
}

function asStr(v: any) {
  return String(v || "").trim();
}

function keyName(v: any) {
  return asStr(v).toUpperCase();
}

function isExcludedUbicacion(v: any) {
  const s = String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return ["robo", "robado", "perdida", "averia", "garantia"].some((w) => s.includes(w));
}

function resolveScope(roles: string[]): Scope {
  if (roles.includes("COORDINADOR")) return "coordinador";
  if (roles.includes("TECNICO")) return "tecnico";
  return "all";
}

export async function GET(req: Request) {
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
      session.permissions.includes("MATERIALES_TRANSFER_SERVICIO") ||
      session.permissions.includes("EQUIPOS_VIEW");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const scope = resolveScope(roles);
    const { searchParams } = new URL(req.url);
    const anchor = String(searchParams.get("anchor") || "").trim() || toYmd(new Date());
    const period = rollingAnchors(anchor);

    const db = adminDb();
    await cleanupOldPredespacho(db);
    const preconIds = ["PRECON_50", "PRECON_100", "PRECON_150", "PRECON_200"];
    const [cqSnap, usSnap, eqSnap, instSnap, savedSnap, preconDocs] = await Promise.all([
      db.collection("cuadrillas").where("area", "==", "INSTALACIONES").limit(2500).get(),
      db.collection("usuarios").select("nombres", "nombre", "apellidos", "uid").limit(4000).get(),
      db.collection("equipos").where("estado", "in", ["ALMACEN", "CAMPO"]).select("equipo", "estado", "ubicacion").limit(20000).get(),
      db.collection("instalaciones")
        .where("fechaOrdenYmd", ">=", period.startYmd)
        .where("fechaOrdenYmd", "<=", period.endYmd)
        .limit(20000)
        .get(),
      db.collection("instalaciones_predespacho").where("periodKey", "==", period.periodKey).limit(5000).get(),
      db.getAll(...preconIds.map((id) => db.collection("almacen_stock").doc(id))),
    ]);

    const usersIdx = new Map<string, string>();
    for (const d of usSnap.docs) {
      const x = d.data() as any;
      const uid = asStr(x?.uid || d.id);
      const name = shortName(`${asStr(x?.nombres || x?.nombre)} ${asStr(x?.apellidos)}`.trim() || uid);
      if (uid) usersIdx.set(uid, name || uid);
    }

    let cuadrillas = cqSnap.docs.map((d) => {
      const x = d.data() as any;
      const coordUid = asStr(x?.coordinadorUid || x?.coordinadoraUid || x?.coordinadorId || x?.coordinadoraId);
      return {
        id: d.id,
        nombre: asStr(x?.nombre || d.id),
        numeroCuadrilla: asStr(x?.numeroCuadrilla),
        tipo: asStr(x?.r_c || x?.tipo || x?.categoria),
        estado: asStr(x?.estado),
        coordinadorUid: coordUid,
        coordinadorNombre: usersIdx.get(coordUid) || asStr(x?.coordinador || x?.coordinadorNombre || x?.coordinadora || x?.coordinadoraNombre),
        tecnicosUids: Array.from(new Set([
          ...asArray(x?.tecnicosUids),
          ...asArray(x?.tecnicosIds),
          ...asArray(x?.tecnicos),
        ])),
      };
    });

    cuadrillas = cuadrillas.filter((c) => {
      const estado = c.estado.toUpperCase();
      if (!estado) return true;
      return estado === "HABILITADO" || estado === "ACTIVO" || estado === "ACTIVA";
    });

    if (scope === "coordinador") {
      const uid = session.uid;
      cuadrillas = cuadrillas.filter((c) => c.coordinadorUid === uid);
    } else if (scope === "tecnico") {
      const uid = session.uid;
      cuadrillas = cuadrillas.filter((c) => c.tecnicosUids.includes(uid));
    }

    const byKey = new Map<string, string>();
    for (const c of cuadrillas) {
      if (c.id) byKey.set(keyName(c.id), c.id);
      if (c.nombre) byKey.set(keyName(c.nombre), c.id);
      if (c.numeroCuadrilla) byKey.set(keyName(c.numeroCuadrilla), c.id);
    }

    const stockAlmacen = emptyCounts();
    const stockCuadrilla: Record<string, ReturnType<typeof emptyCounts>> = {};
    for (const c of cuadrillas) stockCuadrilla[c.id] = emptyCounts();

    for (const d of eqSnap.docs) {
      const x = d.data() as any;
      const estado = asStr(x?.estado).toUpperCase();
      const eq = asStr(x?.equipo).toUpperCase() as keyof ReturnType<typeof emptyCounts>;
      if (!EQUIPOS.includes(eq)) continue;
      if (estado === "ALMACEN") {
        if (!isExcludedUbicacion(x?.ubicacion)) stockAlmacen[eq] += 1;
      } else if (estado === "CAMPO") {
        const id = byKey.get(keyName(x?.ubicacion || ""));
        if (!id) continue;
        stockCuadrilla[id][eq] += 1;
      }
    }

    const consumoPorCuadrilla: Record<string, ReturnType<typeof emptyCounts>> = {};
    const consumoPromedioPorCuadrilla: Record<string, ReturnType<typeof emptyCounts>> = {};
    const consumoTotal = emptyCounts();
    const consumoPromedioTotal = emptyCounts();
    for (const c of cuadrillas) consumoPorCuadrilla[c.id] = emptyCounts();

    for (const d of instSnap.docs) {
      const x = d.data() as any;
      const liq = x?.liquidacion || {};
      const isLiquid =
        String(liq?.estado || "").toUpperCase() === "LIQUIDADO" ||
        !!liq?.at ||
        !!x?.liquidadoAt;
      if (!isLiquid) continue;

      const cuRaw =
        x?.cuadrillaId ||
        x?.cuadrillaNombre ||
        x?.cuadrilla ||
        x?.orden?.cuadrillaId ||
        x?.orden?.cuadrillaNombre ||
        "";
      const cuId = byKey.get(keyName(cuRaw));
      if (!cuId) continue;

      const c = {
        ONT: countONT(x),
        MESH: countMESH(x),
        FONO: countFONO(x),
        BOX: countBOX(x),
      };

      consumoPorCuadrilla[cuId].ONT += c.ONT;
      consumoPorCuadrilla[cuId].MESH += c.MESH;
      consumoPorCuadrilla[cuId].FONO += c.FONO;
      consumoPorCuadrilla[cuId].BOX += c.BOX;

      consumoTotal.ONT += c.ONT;
      consumoTotal.MESH += c.MESH;
      consumoTotal.FONO += c.FONO;
      consumoTotal.BOX += c.BOX;
    }

    for (const c of cuadrillas) {
      const row = consumoPorCuadrilla[c.id] || emptyCounts();
      consumoPromedioPorCuadrilla[c.id] = {
        ONT: Math.round(row.ONT / period.days),
        MESH: Math.round(row.MESH / period.days),
        FONO: Math.round(row.FONO / period.days),
        BOX: Math.round(row.BOX / period.days),
      };
    }
    consumoPromedioTotal.ONT = Math.round(consumoTotal.ONT / period.days);
    consumoPromedioTotal.MESH = Math.round(consumoTotal.MESH / period.days);
    consumoPromedioTotal.FONO = Math.round(consumoTotal.FONO / period.days);
    consumoPromedioTotal.BOX = Math.round(consumoTotal.BOX / period.days);

    const visibleIds = new Set(cuadrillas.map((c) => c.id));
    const predespacho: Record<string, any> = {};
    const batchIds = new Set<string>();
    for (const d of savedSnap.docs) {
      const x = d.data() as any;
      const id = asStr(x?.cuadrillaId);
      if (!id || !visibleIds.has(id)) continue;
      const batchId = asStr(x?.saveBatchId || "");
      if (batchId) batchIds.add(batchId);
      predespacho[id] = {
        id: d.id,
        updatedAt: x?.updatedAt || null,
        updatedByName: asStr(x?.updatedByName || ""),
        saveBatchId: batchId,
        omitida: !!x?.omitida,
        bobinaResi: toInt(x?.bobinaResi || 0),
        rolloCondo: !!x?.rolloCondo,
        precon: x?.precon || {},
        manual: x?.manual || {},
        final: x?.final || {},
        sugerido: x?.sugerido || {},
      };
    }

    const stockPrecon: Record<string, number> = {
      PRECON_50: 0,
      PRECON_100: 0,
      PRECON_150: 0,
      PRECON_200: 0,
    };
    for (const d of preconDocs) {
      if (!d.exists) continue;
      const x = d.data() as any;
      const id = d.id;
      if (!(id in stockPrecon)) continue;
      stockPrecon[id] = toInt(x?.stockUnd || 0);
    }

    const coordinadores = Array.from(
      new Map(
        cuadrillas
          .filter((c) => c.coordinadorUid || c.coordinadorNombre)
          .map((c) => [c.coordinadorUid || c.coordinadorNombre, {
            id: c.coordinadorUid || c.coordinadorNombre,
            nombre: c.coordinadorNombre || c.coordinadorUid,
          }])
      ).values()
    ).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es", { sensitivity: "base" }));

    return NextResponse.json({
      ok: true,
      scope,
      period,
      cuadrillas,
      coordinadores,
      stockAlmacen,
      stockPrecon,
      stockCuadrilla,
      consumoPorCuadrilla,
      consumoPromedioPorCuadrilla,
      consumoTotal,
      consumoPromedioTotal,
      batchIds: Array.from(batchIds).sort((a, b) => b.localeCompare(a)),
      predespacho,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
