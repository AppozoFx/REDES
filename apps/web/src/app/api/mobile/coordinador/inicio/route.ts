import { NextResponse } from "next/server";
import { getMobileAuthContext } from "@/core/auth/mobile";
import { getCoordinadorContext } from "@/core/auth/mobileCoordinador";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayLimaYm() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima", year: "numeric", month: "2-digit",
  }).format(new Date()).slice(0, 7);
}

function monthRange(ym: string) {
  const start = `${ym}-01`;
  const end = `${ym}-31`;
  return { start, end };
}

function norm(v: unknown) { return String(v || "").trim().toUpperCase(); }
function toNum(v: unknown) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

export async function GET(req: Request) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

    const coord = await getCoordinadorContext(mobile);
    const { searchParams } = new URL(req.url);
    const ym = String(searchParams.get("ym") || todayLimaYm()).trim();
    const { start, end } = monthRange(ym);

    const db = adminDb();
    const [ordenesSnap, ventasSnap] = await Promise.all([
      db.collection("ordenes").where("fSoliYmd", ">=", start).where("fSoliYmd", "<=", end).limit(15000).get(),
      db.collection("ventas").where("coordinadorUid", "==", mobile.uid).limit(2000).get(),
    ]);

    // Mapa cuadrillaId → resumen
    type CuadRow = { id: string; nombre: string; finalizadas: number; garantias: number; ventas: number; cat6: number; cat5e: number; dias: Map<string, { finalizadas: number; garantias: number; cat6: number; cat5e: number }> };
    const byId = new Map<string, CuadRow>();
    for (const c of coord.cuadrillas) {
      byId.set(c.id, { id: c.id, nombre: c.nombre, finalizadas: 0, garantias: 0, ventas: 0, cat6: 0, cat5e: 0, dias: new Map() });
    }

    for (const d of ordenesSnap.docs) {
      const o = d.data() as any;
      const cId = String(o?.cuadrillaId || "").trim();
      const row = byId.get(cId);
      if (!row) continue;
      const ymd = String(o?.fSoliYmd || "").trim();
      const finalizada = norm(o?.estado).includes("FINAL");
      const garantia = [o?.tipo, o?.tipoTraba, o?.idenServi].map(norm).join(" ").includes("GARANTIA");
      if (!row.dias.has(ymd)) row.dias.set(ymd, { finalizadas: 0, garantias: 0, cat6: 0, cat5e: 0 });
      const dia = row.dias.get(ymd)!;
      if (finalizada && !garantia) { row.finalizadas++; dia.finalizadas++; }
      if (garantia) { row.garantias++; dia.garantias++; }
      const cat6 = toNum(o?.cat6); const cat5e = toNum(o?.cat5e);
      row.cat6 += cat6; dia.cat6 += cat6;
      row.cat5e += cat5e; dia.cat5e += cat5e;
    }

    const [ymYear, ymMonth] = ym.split("-").map(Number);
    for (const d of ventasSnap.docs) {
      const v = d.data() as any;
      const ms = v?.createdAt?.toDate?.()?.getTime?.() || 0;
      const date = new Date(ms);
      if (date.getFullYear() !== ymYear || date.getMonth() + 1 !== ymMonth) continue;
      const row = byId.get(String(v?.cuadrillaId || "").trim());
      if (row) row.ventas++;
    }

    const cuadrillas = Array.from(byId.values()).map((r) => ({
      cuadrillaId: r.id,
      cuadrillaNombre: r.nombre,
      finalizadas: r.finalizadas,
      garantias: r.garantias,
      ventas: r.ventas,
      cat6: r.cat6,
      cat5e: r.cat5e,
      dias: Array.from(r.dias.entries()).map(([ymd, v]) => ({ ymd, ...v })).sort((a, b) => a.ymd.localeCompare(b.ymd)),
    })).sort((a, b) => a.cuadrillaNombre.localeCompare(b.cuadrillaNombre, "es", { sensitivity: "base" }));

    const resumen = cuadrillas.reduce(
      (acc, r) => { acc.finalizadas += r.finalizadas; acc.garantias += r.garantias; acc.ventas += r.ventas; acc.cat6 += r.cat6; acc.cat5e += r.cat5e; return acc; },
      { finalizadas: 0, garantias: 0, ventas: 0, cat6: 0, cat5e: 0 }
    );

    return NextResponse.json({ ok: true, ym, resumen, cuadrillas });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
