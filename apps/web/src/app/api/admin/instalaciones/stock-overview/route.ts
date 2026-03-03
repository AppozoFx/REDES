import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EquipoKind = "ONT" | "MESH" | "FONO" | "BOX";

const HUAWEI_HINTS = ["HUAWEI", "HG", "EG814", "EG824", "KIT HUAWEI"];
const ZTE_HINTS = ["ZTE", "ZXHN", "F670", "F680", "F660", "H196A", "KIT ZTE"];

function normText(v: any) {
  return String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function toInt(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function asStr(v: any) {
  return String(v || "").trim();
}

function shortName(full: string) {
  const parts = asStr(full).split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  const first = parts[0] || "";
  const firstLast = parts.length >= 4 ? parts[2] || "" : parts[1] || "";
  return `${first} ${firstLast}`.trim() || first;
}

function toYmd(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function modelFromEquipo(eq: any): "HUAWEI" | "ZTE" | null {
  const fields = [eq?.descripcion, eq?.modelo, eq?.marca, eq?.fabricante, eq?.nombre, eq?.tipoModelo];
  for (const f of fields) {
    const s = normText(f);
    if (!s) continue;
    if (HUAWEI_HINTS.some((h) => s.includes(h))) return "HUAWEI";
    if (ZTE_HINTS.some((h) => s.includes(h))) return "ZTE";
  }
  return null;
}

function equipoKind(v: any): EquipoKind | null {
  const s = normText(v);
  if (s === "ONT" || s.includes("ONT")) return "ONT";
  if (s === "MESH" || s.includes("MESH")) return "MESH";
  if (s === "FONO" || s.includes("FONO")) return "FONO";
  if (s === "BOX" || s.includes("BOX") || s.includes("WINBOX")) return "BOX";
  return null;
}

function emptyEquipos() {
  return {
    ONT: 0,
    MESH: 0,
    FONO: 0,
    BOX: 0,
    ONT_HUAWEI: 0,
    ONT_ZTE: 0,
    MESH_HUAWEI: 0,
    MESH_ZTE: 0,
  };
}

function canView(session: NonNullable<Awaited<ReturnType<typeof getServerSession>>>) {
  if (session.isAdmin) return true;
  if (session.access.estadoAcceso !== "HABILITADO") return false;
  const areas = new Set((session.access.areas || []).map((a) => String(a || "").toUpperCase()));
  return areas.has("INSTALACIONES");
}

function canAdjust(session: NonNullable<Awaited<ReturnType<typeof getServerSession>>>) {
  if (session.isAdmin) return true;
  return session.permissions.includes("MATERIALES_TRANSFER_SERVICIO");
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (!canView(session)) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    const { searchParams } = new URL(req.url);
    const includeInactive = String(searchParams.get("includeInactive") || "").trim() === "1";

    const db = adminDb();
    const [cuadSnap, usersSnap, eqSnap, materialsSnap] = await Promise.all([
      db.collection("cuadrillas")
        .where("area", "==", "INSTALACIONES")
        .select(
          "nombre",
          "numeroCuadrilla",
          "estado",
          "coordinadorUid",
          "coordinadoraUid",
          "coordinadorId",
          "coordinadoraId",
          "coordinador",
          "coordinadorNombre",
          "coordinadora",
          "coordinadoraNombre"
        )
        .limit(1200)
        .get(),
      db.collection("usuarios").select("nombres", "apellidos", "displayName").limit(5000).get(),
      db.collection("equipos")
        .where("estado", "in", ["ALMACEN", "CAMPO"])
        .select("equipo", "estado", "ubicacion", "descripcion", "modelo", "marca", "fabricante", "nombre", "tipoModelo")
        .limit(25000)
        .get(),
      db.collection("materiales").select("nombre", "descripcion", "unidadTipo", "estado").limit(3000).get(),
    ]);

    const usersMap = new Map<string, string>();
    for (const u of usersSnap.docs) {
      const x = u.data() as any;
      const displayName = asStr(x?.displayName);
      const composed = `${asStr(x?.nombres)} ${asStr(x?.apellidos)}`.trim();
      usersMap.set(u.id, shortName(displayName || composed || u.id));
    }

    const cuadrillasAll = cuadSnap.docs
      .map((d) => {
        const x = d.data() as any;
        const estado = normText(x?.estado);
        const coordUid = asStr(x?.coordinadorUid || x?.coordinadoraUid || x?.coordinadorId || x?.coordinadoraId);
        const coordNombre = usersMap.get(coordUid) || asStr(x?.coordinador || x?.coordinadorNombre || x?.coordinadora || x?.coordinadoraNombre || coordUid);
        return {
          id: d.id,
          nombre: asStr(x?.nombre || d.id),
          numeroCuadrilla: asStr(x?.numeroCuadrilla || ""),
          estado: estado || "ACTIVO",
          coordinadorUid: coordUid,
          coordinadorNombre: coordNombre,
        };
      })
      .filter(Boolean) as Array<{ id: string; nombre: string; numeroCuadrilla: string; estado: string; coordinadorUid: string; coordinadorNombre: string }>;

    const ACTIVE_STATES = new Set(["HABILITADO", "HABILITADA", "ACTIVO", "ACTIVA"]);
    const cuadrillas = includeInactive
      ? cuadrillasAll
      : cuadrillasAll.filter((c) => ACTIVE_STATES.has(normText(c.estado)));

    const byKey = new Map<string, string>();
    for (const c of cuadrillas) {
      byKey.set(normText(c.id), c.id);
      if (c.nombre) byKey.set(normText(c.nombre), c.id);
      if (c.numeroCuadrilla) byKey.set(normText(c.numeroCuadrilla), c.id);
    }

    const byCuadrilla = new Map<string, ReturnType<typeof emptyEquipos>>();
    for (const c of cuadrillas) byCuadrilla.set(c.id, emptyEquipos());
    const almacen = emptyEquipos();

    for (const d of eqSnap.docs) {
      const x = d.data() as any;
      const kind = equipoKind(x?.equipo);
      if (!kind) continue;
      const estado = normText(x?.estado);
      const ubicacion = asStr(x?.ubicacion);
      const ubicacionId = byKey.get(normText(ubicacion)) || "";
      const model = modelFromEquipo(x);

      if (estado === "ALMACEN") {
        almacen[kind] += 1;
        if (kind === "ONT" && model === "HUAWEI") almacen.ONT_HUAWEI += 1;
        if (kind === "ONT" && model === "ZTE") almacen.ONT_ZTE += 1;
        if (kind === "MESH" && model === "HUAWEI") almacen.MESH_HUAWEI += 1;
        if (kind === "MESH" && model === "ZTE") almacen.MESH_ZTE += 1;
        continue;
      }

      if (estado === "CAMPO" && ubicacionId && byCuadrilla.has(ubicacionId)) {
        const row = byCuadrilla.get(ubicacionId)!;
        row[kind] += 1;
        if (kind === "ONT" && model === "HUAWEI") row.ONT_HUAWEI += 1;
        if (kind === "ONT" && model === "ZTE") row.ONT_ZTE += 1;
        if (kind === "MESH" && model === "HUAWEI") row.MESH_HUAWEI += 1;
        if (kind === "MESH" && model === "ZTE") row.MESH_ZTE += 1;
      }
    }

    const stockPromises = cuadrillas.map(async (c) => {
      const snap = await db.collection("cuadrillas").doc(c.id).collection("stock").limit(800).get();
      let totalUnd = 0;
      let totalMetros = 0;
      const materiales = snap.docs.map((m) => {
        const x = m.data() as any;
        const stockUnd = toInt(x?.stockUnd);
        const stockCm = toInt(x?.stockCm);
        const metros = stockCm > 0 ? stockCm / 100 : 0;
        totalUnd += Math.max(0, stockUnd);
        totalMetros += Math.max(0, metros);
        return {
          materialId: m.id,
          stockUnd: Math.max(0, stockUnd),
          stockMetros: Math.max(0, Number(metros.toFixed(2))),
        };
      });
      return {
        cuadrillaId: c.id,
        materialCount: materiales.length,
        totalUnd,
        totalMetros: Number(totalMetros.toFixed(2)),
        materiales,
      };
    });

    const stockByCuadRows = await Promise.all(stockPromises);
    const stockByCuad = new Map(stockByCuadRows.map((r) => [r.cuadrillaId, r]));

    const materialesCatalog = materialsSnap.docs
      .map((m) => {
        const x = m.data() as any;
        const nombre = asStr(x?.nombre || x?.descripcion || m.id);
        const unidadTipo = normText(x?.unidadTipo) === "METROS" ? "METROS" : "UND";
        return { id: m.id, nombre, unidadTipo, estado: asStr(x?.estado || "") };
      })
      .filter((m) => normText(m.estado || "ACTIVO") !== "INACTIVO")
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));

    const rows = cuadrillas.map((c) => {
      const eq = byCuadrilla.get(c.id) || emptyEquipos();
      const st = stockByCuad.get(c.id) || { materialCount: 0, totalUnd: 0, totalMetros: 0, materiales: [] };
      const criticos: string[] = [];
      if (eq.ONT <= 0) criticos.push("SIN_ONT");
      if (eq.MESH <= 0) criticos.push("SIN_MESH");
      if (eq.ONT + eq.MESH + eq.FONO + eq.BOX <= 0) criticos.push("SIN_EQUIPOS");
      if (st.materialCount <= 0) criticos.push("SIN_MATERIALES");
      return {
        ...c,
        equipos: eq,
        materiales: st,
        criticos,
      };
    });

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      canAdjustStock: canAdjust(session),
      almacen,
      materialesCatalog,
      rows,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (!canView(session)) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    if (!canAdjust(session)) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as {
      cuadrillaId?: string;
      materialId?: string;
      und?: number;
      metros?: number;
      observacion?: string;
    };

    const cuadrillaId = asStr(body?.cuadrillaId);
    const materialId = asStr(body?.materialId);
    const und = Math.floor(Number(body?.und || 0));
    const metros = Number(body?.metros || 0);
    const observacion = asStr(body?.observacion);

    if (!cuadrillaId) return NextResponse.json({ ok: false, error: "MISSING_CUADRILLA" }, { status: 400 });
    if (!materialId) return NextResponse.json({ ok: false, error: "MISSING_MATERIAL" }, { status: 400 });
    if (und <= 0 && metros <= 0) return NextResponse.json({ ok: false, error: "MISSING_QTY" }, { status: 400 });
    if (!observacion) return NextResponse.json({ ok: false, error: "MISSING_OBSERVACION" }, { status: 400 });

    const db = adminDb();
    const [cuadSnap, matSnap] = await Promise.all([
      db.collection("cuadrillas").doc(cuadrillaId).get(),
      db.collection("materiales").doc(materialId).get(),
    ]);
    if (!cuadSnap.exists) return NextResponse.json({ ok: false, error: "CUADRILLA_NOT_FOUND" }, { status: 404 });
    if (!matSnap.exists) return NextResponse.json({ ok: false, error: "MATERIAL_NOT_FOUND" }, { status: 404 });
    const area = normText((cuadSnap.data() as any)?.area);
    if (area !== "INSTALACIONES") return NextResponse.json({ ok: false, error: "INVALID_CUADRILLA" }, { status: 400 });

    const mat = matSnap.data() as any;
    const unidadTipo = normText(mat?.unidadTipo) === "METROS" ? "METROS" : "UND";
    const deltaUnd = unidadTipo === "UND" ? und : 0;
    const deltaCm = unidadTipo === "METROS" ? Math.round(Math.max(0, metros) * 100) : 0;
    if (unidadTipo === "UND" && deltaUnd <= 0) {
      return NextResponse.json({ ok: false, error: "UND_REQUIRED" }, { status: 400 });
    }
    if (unidadTipo === "METROS" && deltaCm <= 0) {
      return NextResponse.json({ ok: false, error: "METROS_REQUIRED" }, { status: 400 });
    }

    const stockRef = db.collection("cuadrillas").doc(cuadrillaId).collection("stock").doc(materialId);
    await db.runTransaction(async (tx) => {
      const curr = await tx.get(stockRef);
      if (!curr.exists) {
        tx.set(
          stockRef,
          {
            materialId,
            unidadTipo,
            stockUnd: 0,
            stockCm: 0,
            createdAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
      tx.set(
        stockRef,
        {
          materialId,
          unidadTipo,
          stockUnd: FieldValue.increment(deltaUnd),
          stockCm: FieldValue.increment(deltaCm),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: session.uid,
        },
        { merge: true }
      );
    });

    const cuad = cuadSnap.data() as any;
    const materialNombre = asStr(mat?.nombre || mat?.descripcion || materialId);
    await db.collection("movimientos_inventario").add({
      area: "INSTALACIONES",
      tipo: "AJUSTE_STOCK_CUADRILLA",
      origen: { type: "ADMIN_AJUSTE", id: session.uid },
      destino: { type: "CUADRILLA", id: cuadrillaId },
      cuadrillaId,
      cuadrillaNombre: asStr(cuad?.nombre || cuadrillaId),
      materialId,
      materialNombre,
      unidadTipo,
      und: deltaUnd,
      metros: deltaCm > 0 ? Number((deltaCm / 100).toFixed(2)) : 0,
      observacion,
      createdBy: session.uid,
      createdAt: FieldValue.serverTimestamp(),
      ymd: toYmd(new Date()),
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
