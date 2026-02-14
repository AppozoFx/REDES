import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";
import { FieldPath } from "firebase-admin/firestore";

export const runtime = "nodejs";

function toPlain(value: any): any {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === "object") {
    if (typeof (value as any)?.toDate === "function") {
      try {
        return (value as any).toDate().toISOString();
      } catch {
        return null;
      }
    }
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = toPlain(v);
    return out;
  }
  return value;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    const canUse =
      session.isAdmin ||
      session.permissions.includes("EQUIPOS_VIEW") ||
      session.permissions.includes("EQUIPOS_EDIT") ||
      session.permissions.includes("EQUIPOS_IMPORT") ||
      session.permissions.includes("EQUIPOS_DESPACHO") ||
      session.permissions.includes("EQUIPOS_DEVOLUCION");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") || 200)));
    const cursor = searchParams.get("cursor");
    const sn = (searchParams.get("sn") || "").trim().toUpperCase();
    const exact = searchParams.get("exact") === "1";
    const estados = searchParams.getAll("estado").map((e) => e.trim().toUpperCase()).filter(Boolean);
    const ubicacion = (searchParams.get("ubicacion") || "").trim().toUpperCase();
    const equipo = (searchParams.get("equipo") || "").trim().toUpperCase();
    const pri_tec = (searchParams.get("pri_tec") || "").trim().toUpperCase();
    const tec_liq = (searchParams.get("tec_liq") || "").trim().toUpperCase();
    const inv = (searchParams.get("inv") || "").trim().toUpperCase();
    const descripcionList = searchParams.getAll("descripcion").map((d) => d.trim()).filter(Boolean);

    const db = adminDb();
    let q: FirebaseFirestore.Query = db.collection("equipos");

    if (sn && exact) {
      const docSnap = await db.collection("equipos").doc(sn).get();
      const items = docSnap.exists ? [toPlain({ id: docSnap.id, ...docSnap.data() })] : [];
      const cuadSnap = await db.collection("cuadrillas").where("area", "==", "INSTALACIONES").get();
      const cuadrillas = cuadSnap.docs.map((d) => toPlain({ id: d.id, ...d.data() }));
      return NextResponse.json({ ok: true, items, hasMore: false, nextCursor: null, cuadrillas });
    }

    if (sn && sn.length === 6) {
      q = q.where("sn_tail", "==", sn);
      q = q.orderBy(FieldPath.documentId());
    } else if (sn) {
      q = q.orderBy(FieldPath.documentId()).startAt(sn).endAt(sn + "\uf8ff");
    } else {
      q = q.orderBy(FieldPath.documentId());
      if (estados.length === 1) {
        q = q.where("estado", "==", estados[0]);
      } else if (estados.length > 1) {
        q = q.where("estado", "in", estados.slice(0, 10));
      } else {
        q = q.where("estado", "in", ["ALMACEN", "CAMPO"]);
      }
    }

    if (ubicacion) q = q.where("ubicacion", "==", ubicacion);
    if (equipo) q = q.where("equipo", "==", equipo);
    if (pri_tec) q = q.where("pri_tec", "==", pri_tec);
    if (tec_liq) q = q.where("tec_liq", "==", tec_liq);
    if (inv) q = q.where("inv", "==", inv);
    if (descripcionList.length > 0) {
      q = q.where("descripcion", "in", descripcionList.slice(0, 10));
    }

    if (cursor) q = q.startAfter(cursor);
    q = q.limit(limit + 1);

    const snap = await q.get();
    const docs = snap.docs.slice(0, limit);
    const items = docs.map((d) => toPlain({ id: d.id, ...d.data() }));
    const hasMore = snap.docs.length > limit;
    const nextCursor = docs.length ? docs[docs.length - 1].id : null;

    const cuadSnap = await db.collection("cuadrillas").where("area", "==", "INSTALACIONES").get();
    const cuadrillas = cuadSnap.docs.map((d) => toPlain({ id: d.id, ...d.data() }));

    return NextResponse.json({ ok: true, items, hasMore, nextCursor, cuadrillas });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
