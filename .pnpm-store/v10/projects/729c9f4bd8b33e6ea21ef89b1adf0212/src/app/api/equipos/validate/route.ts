import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { normalizeUbicacion } from "@/domain/equipos/repo";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sn = String(searchParams.get("sn") || "").trim().toUpperCase();
    if (!sn) return NextResponse.json({ ok: false, error: "MISSING_SN" }, { status: 400 });

    const snap = await adminDb().collection("equipos").doc(sn).get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    }

    const data = snap.data() as any;
    const ubicacionRaw = String(data?.ubicacion || "ALMACEN");
    const norm = normalizeUbicacion(ubicacionRaw);
    const equipo = String(data?.equipo || "").trim().toUpperCase();

    if (norm.ubicacion === "ALMACEN") {
      return NextResponse.json({ ok: true, status: "ALMACEN", equipo });
    }

    if (norm.isCuadrilla) {
      return NextResponse.json({
        ok: true,
        status: "DESPACHADO",
        ubicacion: norm.ubicacion,
        equipo,
      });
    }

    return NextResponse.json({
      ok: true,
      status: "NO_ALMACEN",
      ubicacion: norm.ubicacion,
      equipo,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || "ERROR") },
      { status: 500 }
    );
  }
}
