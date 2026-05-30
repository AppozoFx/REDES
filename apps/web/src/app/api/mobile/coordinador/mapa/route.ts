import { NextResponse } from "next/server";
import { getMobileAuthContext } from "@/core/auth/mobile";
import { getCoordinadorContext } from "@/core/auth/mobileCoordinador";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

export async function GET(req: Request) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

    const coord = await getCoordinadorContext(mobile);
    if (!coord.cuadrillasIds.length) return NextResponse.json({ ok: true, ymd: todayLimaYmd(), items: [] });

    const { searchParams } = new URL(req.url);
    const ymd = String(searchParams.get("ymd") || todayLimaYmd()).trim();
    const db = adminDb();

    // Órdenes de TODAS las cuadrillas del coordinador para ese día
    const [snap1, snap2] = await Promise.all([
      db.collection("ordenes").where("fSoliYmd", "==", ymd).limit(5000).get(),
      db.collection("ordenes").where("fechaFinVisiYmd", "==", ymd).limit(5000).get(),
    ]);

    const docsById = new Map<string, any>();
    for (const d of [...snap1.docs, ...snap2.docs]) docsById.set(d.id, d.data());

    const cuadrillasSet = new Set(coord.cuadrillasIds);
    // Mapa cuadrillaId → nombre (para el popup)
    const cuadrillaNames = new Map(coord.cuadrillas.map((c) => [c.id, c.nombre]));

    const items = Array.from(docsById.entries())
      .filter(([, o]) => cuadrillasSet.has(String(o?.cuadrillaId || "").trim()))
      .map(([id, o]) => {
        const lat = toNum(o?.lat); const lng = toNum(o?.lng);
        if (lat === null || lng === null) return null;
        const cId = String(o?.cuadrillaId || "").trim();
        return {
          id,
          ordenId: String(o?.ordenId || id),
          cliente: String(o?.cliente || "").trim(),
          codigoCliente: String(o?.codiSeguiClien || "").trim(),
          direccion: String(o?.direccion || o?.direccion1 || "").trim(),
          estado: String(o?.estado || "").trim(),
          tipoTrabajo: String(o?.tipoTraba || o?.tipo || "").trim(),
          fechaProgramadaHm: String(o?.fSoliHm || o?.fechaFinVisiHm || "").trim(),
          cuadrillaNombre: cuadrillaNames.get(cId) || cId,
          lat, lng,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ ok: true, ymd, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
