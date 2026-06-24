import { NextResponse } from "next/server";
import { getMobileAuthContext } from "@/core/auth/mobile";
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

    const roles = (mobile.access.roles || []).map((r) => String(r || "").trim().toUpperCase());
    const areas = (mobile.access.areas || []).map((a) => String(a || "").trim().toUpperCase());
    const allowed =
      roles.includes("ALMACEN") ||
      roles.includes("ADMIN") ||
      areas.includes("ALMACEN") ||
      areas.includes("INSTALACIONES");
    if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const ymd = String(searchParams.get("ymd") || todayLimaYmd()).trim();
    const db = adminDb();

    const [snap1, snap2, cuadrillasSnap] = await Promise.all([
      db.collection("ordenes").where("fSoliYmd", "==", ymd).limit(5000).get(),
      db.collection("ordenes").where("fechaFinVisiYmd", "==", ymd).limit(5000).get(),
      db.collection("cuadrillas").select("nombre").get(),
    ]);

    const docsById = new Map<string, any>();
    for (const d of [...snap1.docs, ...snap2.docs]) docsById.set(d.id, d.data());

    const cuadrillaNames = new Map<string, string>();
    for (const d of cuadrillasSnap.docs) cuadrillaNames.set(d.id, String((d.data() as any).nombre || d.id));

    const items = Array.from(docsById.entries())
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
          cuadrillaId: cId,
          cuadrillaNombre: cuadrillaNames.get(cId) || String(o?.cuadrillaNombre || cId).trim(),
          lat, lng,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ ok: true, ymd, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
