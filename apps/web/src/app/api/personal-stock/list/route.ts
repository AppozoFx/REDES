import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    const canUse =
      session.isAdmin ||
      session.permissions.includes("EQUIPOS_DESPACHO") ||
      session.permissions.includes("EQUIPOS_DEVOLUCION") ||
      session.permissions.includes("MATERIALES_TRANSFER_SERVICIO") ||
      session.permissions.includes("MATERIALES_DEVOLUCION") ||
      session.permissions.includes("EQUIPOS_VIEW");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const rolFilter = searchParams.get("rol"); // "COORDINADOR" | "SUPERVISOR" | null (ambos)

    const db = adminDb();
    const accessSnap = await db.collection("usuarios_access")
      .where("estadoAcceso", "==", "HABILITADO")
      .limit(500)
      .get();

    const uidsFiltrados: string[] = [];
    for (const doc of accessSnap.docs) {
      const data = doc.data() as any;
      const roles: string[] = (data?.roles || []).map((r: any) => String(r || "").toUpperCase());
      const esCoord = roles.includes("COORDINADOR");
      const esSuper = roles.includes("SUPERVISOR");
      if (rolFilter === "COORDINADOR" && !esCoord) continue;
      if (rolFilter === "SUPERVISOR" && !esSuper) continue;
      if (!rolFilter && !esCoord && !esSuper) continue;
      uidsFiltrados.push(doc.id);
    }

    if (!uidsFiltrados.length) return NextResponse.json({ ok: true, items: [] });

    const chunkSize = 300;
    const users: any[] = [];
    for (let i = 0; i < uidsFiltrados.length; i += chunkSize) {
      const chunk = uidsFiltrados.slice(i, i + chunkSize);
      const refs = chunk.map((uid) => db.collection("usuarios").doc(uid));
      const snaps = await db.getAll(...refs);
      for (const snap of snaps) {
        if (!snap.exists) continue;
        const d = snap.data() as any;
        const nombres = String(d?.nombres || "").trim();
        const apellidos = String(d?.apellidos || "").trim();
        const partes = `${nombres} ${apellidos}`.trim().split(/\s+/).filter(Boolean);
        const nombre = partes.length ? `${partes[0]} ${partes.length >= 4 ? partes[2] : partes[1] || ""}`.trim() : snap.id;
        users.push({ uid: snap.id, nombre, nombres, apellidos, celular: d?.celular || "" });
      }
    }

    // Adjuntar rol a cada user
    const accessByUid = new Map(accessSnap.docs.map((d) => [d.id, d.data() as any]));
    const items = users
      .map((u) => {
        const acc = accessByUid.get(u.uid);
        const roles: string[] = (acc?.roles || []).map((r: any) => String(r || "").toUpperCase());
        const rol = roles.includes("COORDINADOR") ? "COORDINADOR" : roles.includes("SUPERVISOR") ? "SUPERVISOR" : "OTRO";
        return { ...u, rol };
      })
      .filter((u) => u.rol !== "OTRO")
      .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es", { sensitivity: "base" }));

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
