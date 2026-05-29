import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function toTimestampMs(v: unknown): number | null {
  if (!v) return null;
  if (typeof (v as any)?.toDate === "function") {
    try { return (v as any).toDate().getTime(); } catch { return null; }
  }
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }

    const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
    const canView =
      session.isAdmin ||
      session.permissions.includes("ORDENES_MAPA_VIEW") ||
      roles.includes("COORDINADOR") ||
      roles.includes("SUPERVISOR") ||
      roles.includes("SEGURIDAD") ||
      roles.includes("GERENCIA");
    if (!canView) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const snap = await adminDb()
      .collection("cuadrillas")
      .where("estado", "==", "HABILITADO")
      .limit(200)
      .get();

    const items = snap.docs
      .map((d) => {
        const x = d.data() as any;
        const lat = toNum(x.lat);
        const lng = toNum(x.lng);
        if (lat === null || lng === null) return null;
        return {
          id: d.id,
          nombre: String(x.nombre || d.id),
          area: String(x.area || ""),
          categoria: String(x.categoria || ""),
          vehiculo: String(x.vehiculo || ""),
          lat,
          lng,
          lastLocationAt: toTimestampMs(x.lastLocationAt),
        };
      })
      .filter(Boolean);

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
