import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";
import { getAsignacionData, resolveGestorVisible, todayLimaYmd } from "@/lib/gestorAsignacion";

export const runtime = "nodejs";

function shortName(full: string, fallback: string) {
  const parts = String(full || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = parts[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  return (last ? `${first} ${last}` : first) || fallback;
}

async function getProgramForDate(ymd: string) {
  const db = adminDb();
  const snap = await db
    .collection("asistencia_programada")
    .where("startYmd", "<=", ymd)
    .where("endYmd", ">=", ymd)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].data() as any;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }

    const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
    const canAdmin = session.isAdmin || roles.includes("GERENCIA") || roles.includes("ALMACEN") || roles.includes("RRHH");
    const canGestor = roles.includes("GESTOR");
    const canUse = canAdmin || canGestor || (session.access.areas || []).includes("INSTALACIONES");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const fecha = String(searchParams.get("fecha") || "").trim();
    const gestorUidParam = String(searchParams.get("gestorUid") || "").trim();
    if (!fecha) return NextResponse.json({ ok: false, error: "FECHA_REQUIRED" }, { status: 400 });

    const gestorUid = canAdmin ? (gestorUidParam || session.uid) : session.uid;

    const db = adminDb();
    let baseSnap = await db
      .collection("cuadrillas")
      .where("area", "==", "INSTALACIONES")
      .where("estado", "==", "HABILITADO")
      .get();

    let docs = baseSnap.docs;
    if (canGestor && !canAdmin) {
      const data = await getAsignacionData(fecha);
      const visible = resolveGestorVisible(gestorUid, data);
      if (!visible.all) {
        const setIds = new Set((visible.ids || []).map((x) => String(x || "").trim()));
        docs = docs.filter((d) => setIds.has(d.id));
      }
    }
    if (canAdmin && gestorUidParam) {
      const data = await getAsignacionData(fecha);
      const visible = resolveGestorVisible(gestorUidParam, data);
      if (!visible.all) {
        const setIds = new Set((visible.ids || []).map((x) => String(x || "").trim()));
        docs = docs.filter((d) => setIds.has(d.id));
      }
    }

    const cuadrillas = docs.map((d: any) => {
      const data = d.data() as any;
      return {
        id: d.id,
        nombre: data?.nombre || d.id,
        zonaId: data?.zonaId || "",
        zonaNombre: data?.zonaNombre || data?.zona || "",
        tipoZona: data?.tipoZona || "",
        gestorUid: data?.gestorUid || "",
        coordinadorUid: data?.coordinadorUid || "",
        tecnicosUids: Array.isArray(data?.tecnicosUids) ? data.tecnicosUids : [],
      };
    });

    const coordUids = Array.from(new Set(cuadrillas.map((c) => String(c.coordinadorUid || "")).filter(Boolean)));
    const coordRefs = coordUids.map((uid) => db.collection("usuarios").doc(uid));
    const coordSnaps = coordUids.length ? await db.getAll(...coordRefs) : [];
    const coordMap = new Map(
      coordSnaps.map((s, i) => {
        const data = s.data() as any;
        const nombres = String(data?.nombres || "").trim();
        const apellidos = String(data?.apellidos || "").trim();
        const label = shortName(`${nombres} ${apellidos}`.trim() || coordUids[i] || s.id, s.id);
        return [coordUids[i] || s.id, label];
      })
    );

    const draftId = `${fecha}_${gestorUid}`;
    const draftRef = db.collection("asistencia_borradores").doc(draftId);
    const draftSnap = await draftRef.get();
    const draft = draftSnap.exists ? (draftSnap.data() as any) : null;
    const draftEstado = String(draft?.estado || "ABIERTO");

    const itemsSnap = await draftRef.collection("cuadrillas").get();
    const draftMap = new Map(itemsSnap.docs.map((d) => [d.id, d.data() as any]));

    const program = await getProgramForDate(fecha);
    const progItems = (program?.items || {}) as Record<string, Record<string, string>>;

    const rows = cuadrillas.map((c) => {
      const d = draftMap.get(c.id) || {};
      const progState = String(progItems?.[c.id]?.[fecha] || "descanso").toLowerCase();
      return {
        ...c,
        coordinadorNombre: c.coordinadorUid ? coordMap.get(c.coordinadorUid) || c.coordinadorUid : "",
        estadoAsistencia: d.estadoAsistencia || progState || "asistencia",
        tecnicosIds: Array.isArray(d.tecnicosIds) ? d.tecnicosIds : c.tecnicosUids,
        observacion: d.observacion || "",
        updatedAt: d.updatedAt || null,
      };
    });

    const allSnap = await db
      .collection("cuadrillas")
      .where("area", "==", "INSTALACIONES")
      .get();
    const assignedTecnicosAll = Array.from(
      new Set(
        allSnap.docs
          .flatMap((d: any) => {
            const data = d.data() as any;
            return Array.isArray(data?.tecnicosUids) ? data.tecnicosUids : [];
          })
          .map((x: any) => String(x || "").trim())
          .filter(Boolean)
      )
    );

    return NextResponse.json({
      ok: true,
      fecha,
      gestorUid,
      draftEstado,
      draft,
      rows,
      assignedTecnicosAll,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
