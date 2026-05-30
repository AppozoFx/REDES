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

function toNum(v: unknown) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

export async function GET(req: Request) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

    const coord = await getCoordinadorContext(mobile);
    const { searchParams } = new URL(req.url);
    const ymd = String(searchParams.get("ymd") || todayLimaYmd()).trim();

    const db = adminDb();
    // Predespacho guardado para este coordinador/cuadrillas en la fecha indicada
    const snap = await db.collection("instalaciones_predespacho_rows")
      .where("coordinadorUid", "==", mobile.uid)
      .where("anchor", "==", ymd)
      .limit(100)
      .get();

    if (snap.empty) {
      return NextResponse.json({ ok: true, tienePredespacho: false, ymd, rows: [] });
    }

    const cuadrillaNames = new Map(coord.cuadrillas.map((c) => [c.id, c.nombre]));
    const rows = snap.docs
      .filter((d) => !d.data()?.omitida)
      .map((d) => {
        const x = d.data() as any;
        const cId = String(x.cuadrillaId || "").trim();
        const final = x.final || {};
        return {
          cuadrillaId: cId,
          cuadrillaNombre: cuadrillaNames.get(cId) || String(x.cuadrillaNombre || cId),
          ont: toNum(final.ONT),
          mesh: toNum(final.MESH),
          fono: toNum(final.FONO),
          box: toNum(final.BOX),
          bobinaResi: toNum(x.bobinaResi),
          rolloCondo: !!x.rolloCondo,
          updatedByName: String(x.updatedByName || ""),
          updatedAt: x.updatedAt?.toDate?.()?.toISOString?.() ?? null,
        };
      })
      .sort((a, b) => a.cuadrillaNombre.localeCompare(b.cuadrillaNombre, "es", { sensitivity: "base" }));

    return NextResponse.json({ ok: true, tienePredespacho: rows.length > 0, ymd, rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
