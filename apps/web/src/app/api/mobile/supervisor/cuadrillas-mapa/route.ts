import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getMobileAuthContext } from "@/core/auth/mobile";
import { getSupervisorContext, getSupervisorAssignments } from "@/core/auth/mobileSupervisor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v); if (Number.isFinite(n)) return n;
  }
  return null;
}

function tsToMs(v: any): number | null {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate().getTime();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  if (typeof v?._seconds === "number") return v._seconds * 1000;
  return null;
}

export async function GET(req: Request) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

    await getSupervisorContext(mobile);

    // Devuelve TODAS las cuadrillas de instalaciones (igual que Coordinador)
    const snap = await adminDb()
      .collection("cuadrillas")
      .where("area", "==", "INSTALACIONES")
      .where("estado", "==", "HABILITADO")
      .get();

    const snaps = snap.docs;

    const items = snaps
      .map((snap) => {
        const data = snap.data() as any;
        const lat = toNum(data?.lat);
        const lng = toNum(data?.lng);
        return {
          id: snap.id,
          nombre: String(data?.nombre || snap.id),
          categoria: String(data?.categoria || ""),
          vehiculo: String(data?.vehiculo || ""),
          lat,
          lng,
          lastLocationAt: tsToMs(data?.lastLocationAt),
          estadoActual: String(data?.estadoActual || ""),
        };
      })
      .filter((item) => item.lat !== null && item.lng !== null);

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
