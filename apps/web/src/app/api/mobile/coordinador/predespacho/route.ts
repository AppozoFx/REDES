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

    const cuadrillaIds = coord.cuadrillasIds;
    if (!cuadrillaIds.length) {
      return NextResponse.json({ ok: true, tienePredespacho: false, ymd, rows: [] });
    }

    const db = adminDb();

    // Leer todos los docs de instalaciones_predespacho para las cuadrillas del coordinador.
    // Se hacen batches de 30 por límite de Firestore 'in'.
    const allDocs: any[] = [];
    for (let i = 0; i < cuadrillaIds.length; i += 30) {
      const batch = cuadrillaIds.slice(i, i + 30);
      const snap = await db.collection("instalaciones_predespacho")
        .where("cuadrillaId", "in", batch)
        .get();
      for (const d of snap.docs) allDocs.push(d.data());
    }

    // Filtrar: el periodo debe cubrir el ymd solicitado y no estar omitido.
    const matching = allDocs.filter(
      (d) => !d.omitida && typeof d.startYmd === "string" && typeof d.endYmd === "string"
            && d.startYmd <= ymd && d.endYmd >= ymd,
    );

    if (!matching.length) {
      return NextResponse.json({ ok: true, tienePredespacho: false, ymd, rows: [] });
    }

    // Agregar por cuadrillaId: los documentos SHARED + modelo se complementan
    // (SHARED tiene FONO/BOX/precon, el doc de modelo tiene ONT/MESH, el doc ALL tiene todo).
    const byId = new Map<string, {
      cuadrillaId: string;
      ont: number; mesh: number; fono: number; box: number;
      bobinaResi: number; rolloCondo: boolean;
      precon: Record<string, number>;
      updatedByName: string; updatedAt: string | null;
    }>();

    for (const d of matching) {
      const cId = String(d.cuadrillaId || "").trim();
      if (!cId) continue;
      if (!byId.has(cId)) {
        byId.set(cId, {
          cuadrillaId: cId,
          ont: 0, mesh: 0, fono: 0, box: 0,
          bobinaResi: 0, rolloCondo: false,
          precon: { PRECON_50: 0, PRECON_100: 0, PRECON_150: 0, PRECON_200: 0 },
          updatedByName: "", updatedAt: null,
        });
      }
      const agg = byId.get(cId)!;
      const final = d.final || {};
      agg.ont  += toNum(final.ONT);
      agg.mesh += toNum(final.MESH);
      agg.fono += toNum(final.FONO);
      agg.box  += toNum(final.BOX);

      // Extras: precon, bobinaResi, rolloCondo vienen del doc ALL o del doc SHARED.
      const isMetaDoc = d.dispatchGroup === "ALL" || d.dispatchGroup === "SHARED";
      if (isMetaDoc) {
        agg.bobinaResi = toNum(d.bobinaResi);
        agg.rolloCondo = !!d.rolloCondo;
        const pc = d.precon || {};
        agg.precon.PRECON_50  += toNum(pc.PRECON_50);
        agg.precon.PRECON_100 += toNum(pc.PRECON_100);
        agg.precon.PRECON_150 += toNum(pc.PRECON_150);
        agg.precon.PRECON_200 += toNum(pc.PRECON_200);
      }
      if (d.updatedByName && !agg.updatedByName) {
        agg.updatedByName = String(d.updatedByName);
        agg.updatedAt = d.updatedAt?.toDate?.()?.toISOString?.() ?? null;
      }
    }

    const cuadrillaNames = new Map(coord.cuadrillas.map((c) => [c.id, c.nombre]));
    const rows = [...byId.values()]
      .map((agg) => ({
        cuadrillaId: agg.cuadrillaId,
        cuadrillaNombre: cuadrillaNames.get(agg.cuadrillaId) || agg.cuadrillaId,
        ont: agg.ont,
        mesh: agg.mesh,
        fono: agg.fono,
        box: agg.box,
        bobinaResi: agg.bobinaResi,
        rolloCondo: agg.rolloCondo,
        precon: agg.precon,
        updatedByName: agg.updatedByName,
        updatedAt: agg.updatedAt,
      }))
      .sort((a, b) => a.cuadrillaNombre.localeCompare(b.cuadrillaNombre, "es", { sensitivity: "base" }));

    return NextResponse.json({ ok: true, tienePredespacho: rows.length > 0, ymd, rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
