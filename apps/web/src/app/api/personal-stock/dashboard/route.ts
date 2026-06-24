import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

const TIPOS_EQUIPO = ["ONT", "MESH", "FONO", "BOX"] as const;

export async function GET() {
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
      session.permissions.includes("EQUIPOS_DESPACHO") ||
      session.permissions.includes("EQUIPOS_DEVOLUCION") ||
      (session.access.areas || []).includes("INSTALACIONES");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const db = adminDb();

    // Leer todos los equipos con ubicacionTipo PERSONAL
    const eqSnap = await db.collection("equipos")
      .where("ubicacionTipo", "==", "PERSONAL")
      .where("estado", "==", "CAMPO")
      .select("SN", "equipo", "descripcion", "ubicacion", "ubicacionUid", "entityRol", "guia_despacho", "f_despachoYmd", "f_despachoHm")
      .limit(5000)
      .get();

    const equipos = eqSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];

    // Agrupar por ubicacionUid
    const byUid = new Map<string, { equipos: any[]; conteo: Record<string, number> }>();
    for (const eq of equipos) {
      const uid = String(eq.ubicacionUid || "");
      if (!uid) continue;
      if (!byUid.has(uid)) byUid.set(uid, { equipos: [], conteo: {} });
      const entry = byUid.get(uid)!;
      entry.equipos.push(eq);
      const tipo = String(eq.equipo || "").toUpperCase();
      if (TIPOS_EQUIPO.includes(tipo as any)) {
        entry.conteo[tipo] = (entry.conteo[tipo] || 0) + 1;
      }
    }

    // Leer info de usuarios implicados
    const uids = Array.from(byUid.keys());
    let personas: any[] = [];
    if (uids.length) {
      const chunkSize = 300;
      for (let i = 0; i < uids.length; i += chunkSize) {
        const chunk = uids.slice(i, i + chunkSize);
        const refs = chunk.map((uid) => db.collection("usuarios").doc(uid));
        const snaps = await db.getAll(...refs);
        for (const snap of snaps) {
          if (!snap.exists) continue;
          const d = snap.data() as any;
          const partes = `${String(d?.nombres || "").trim()} ${String(d?.apellidos || "").trim()}`.trim().split(/\s+/).filter(Boolean);
          const nombre = partes.length ? `${partes[0]} ${partes.length >= 4 ? partes[2] : partes[1] || ""}`.trim() : snap.id;
          personas.push({ uid: snap.id, nombre });
        }
      }
    }

    // Leer stock de materiales de cada persona con equipo
    const stockPorPersona: Record<string, any[]> = {};
    for (const uid of uids) {
      try {
        const matSnap = await db.collection("personal_stock").doc(uid).collection("stock").get();
        stockPorPersona[uid] = matSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } catch {
        stockPorPersona[uid] = [];
      }
    }

    // También personas que solo tienen materiales (sin equipos en campo)
    const accessSnap = await db.collection("usuarios_access")
      .where("estadoAcceso", "==", "HABILITADO")
      .limit(500)
      .get();
    const personasConStock: string[] = [];
    for (const doc of accessSnap.docs) {
      const roles: string[] = ((doc.data() as any)?.roles || []).map((r: any) => String(r || "").toUpperCase());
      if (roles.includes("COORDINADOR") || roles.includes("SUPERVISOR")) {
        if (!byUid.has(doc.id)) personasConStock.push(doc.id);
      }
    }
    for (const uid of personasConStock) {
      try {
        const matSnap = await db.collection("personal_stock").doc(uid).collection("stock").get();
        const mats = matSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (mats.some((m: any) => (m.stockUnd || 0) > 0 || (m.stockCm || 0) > 0)) {
          stockPorPersona[uid] = mats;
          if (!uids.includes(uid)) {
            const uSnap = await db.collection("usuarios").doc(uid).get();
            if (uSnap.exists) {
              const d = uSnap.data() as any;
              const partes = `${String(d?.nombres || "").trim()} ${String(d?.apellidos || "").trim()}`.trim().split(/\s+/).filter(Boolean);
              const nombre = partes.length ? `${partes[0]} ${partes.length >= 4 ? partes[2] : partes[1] || ""}`.trim() : uid;
              personas.push({ uid, nombre });
            }
          }
        }
      } catch {}
    }

    // Construir resumen
    const personasIdx = new Map(personas.map((p) => [p.uid, p.nombre]));
    const resumen = Array.from(new Set([...uids, ...Object.keys(stockPorPersona)])).map((uid) => {
      const entry = byUid.get(uid);
      return {
        uid,
        nombre: personasIdx.get(uid) || uid,
        conteoEquipos: entry?.conteo || {},
        totalEquipos: Object.values(entry?.conteo || {}).reduce((a, b) => a + b, 0),
        stockMateriales: stockPorPersona[uid] || [],
        series: entry?.equipos || [],
      };
    }).filter((r) => r.totalEquipos > 0 || r.stockMateriales.length > 0)
      .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es", { sensitivity: "base" }));

    return NextResponse.json({ ok: true, resumen, truncated: eqSnap.size >= 5000 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
