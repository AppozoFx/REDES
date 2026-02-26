import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    const canUse =
      session.isAdmin ||
      session.permissions.includes("VENTAS_EDIT") ||
      session.permissions.includes("VENTAS_DESPACHO_INST") ||
      session.permissions.includes("VENTAS_DESPACHO_MANT") ||
      session.permissions.includes("MATERIALES_TRANSFER_SERVICIO") ||
      session.permissions.includes("MATERIALES_DEVOLUCION") ||
      session.permissions.includes("CUADRILLAS_MANAGE") ||
      session.permissions.includes("ORDENES_LIQUIDAR") ||
      (session.access.areas || []).includes("INSTALACIONES") ||
      (session.access.areas || []).includes("MANTENIMIENTO") ||
      (session.access.roles || []).includes("GESTOR") ||
      (session.access.roles || []).includes("COORDINADOR");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const role = String(searchParams.get("role") || "").trim().toUpperCase();
    const area = String(searchParams.get("area") || "").trim().toUpperCase();
    if (!role) return NextResponse.json({ ok: false, error: "MISSING_ROLE" }, { status: 400 });

    const accessSnap = await adminDb()
      .collection("usuarios_access")
      .where("roles", "array-contains", role)
      .limit(500)
      .get();

    const uids = accessSnap.docs
      .map((d) => ({ id: d.id, data: d.data() as any }))
      .filter((r) => {
        if (!area) return true;
        const areas = Array.isArray(r.data?.areas) ? r.data.areas : [];
        return areas.map((a: any) => String(a || "").toUpperCase()).includes(area);
      })
      .map((r) => r.id);
    const userRefs = uids.map((uid) => adminDb().collection("usuarios").doc(uid));
    const userSnaps = uids.length ? await adminDb().getAll(...userRefs) : [];
    const shortName = (full: string, fallback: string) => {
      const parts = String(full || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      const first = parts[0] || "";
      const firstLast = parts.length >= 4 ? parts[2] || "" : parts[1] || "";
      return `${first} ${firstLast}`.trim() || fallback;
    };

    const userMap = new Map(
      userSnaps.map((s) => {
        const data = s.data() as any;
        const nombres = String(data?.nombres || "").trim();
        const apellidos = String(data?.apellidos || "").trim();
        const full = `${nombres} ${apellidos}`.trim() || s.id;
        const displayName = shortName(full, s.id) || s.id;
        return [s.id, displayName];
      })
    );

    const items = uids.map((uid) => ({ uid, label: userMap.get(uid) || uid }));
    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}

