import { NextResponse } from "next/server";
import { getMobileAuthContext } from "@/core/auth/mobile";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toFiniteNumber(v: unknown): number | null {
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
    const mobile = await getMobileAuthContext(req);
    if (!mobile) {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const roles = (mobile.access.roles || []).map((r) => String(r || "").trim().toUpperCase());
    if (!roles.includes("TECNICO") && !roles.includes("ADMIN")) {
      return NextResponse.json({ ok: false, error: "ROLE_TECNICO_REQUIRED" }, { status: 403 });
    }

    const snap = await adminDb()
      .collection("cuadrillas")
      .where("estado", "==", "HABILITADO")
      .limit(200)
      .get();

    const items = snap.docs
      .map((d) => {
        const x = d.data() as any;
        const lat = toFiniteNumber(x.lat);
        const lng = toFiniteNumber(x.lng);
        if (lat === null || lng === null) return null;
        return {
          id: d.id,
          nombre: String(x.nombre || d.id),
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
