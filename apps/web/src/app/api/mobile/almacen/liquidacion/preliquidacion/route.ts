import { NextResponse } from "next/server";
import { getMobileAuthContext } from "@/core/auth/mobile";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function preliqDocId(pedido: string, ymd: string) {
  const cleanPedido = String(pedido || "").trim().replace(/[\/\\\s]+/g, "_");
  return `${cleanPedido}_${ymd}`;
}

function cleanSeries(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .slice(0, 4);
}

export async function GET(req: Request) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

    const roles = (mobile.access.roles || []).map((r) => String(r || "").trim().toUpperCase());
    const areas = (mobile.access.areas || []).map((a) => String(a || "").trim().toUpperCase());
    const allowed =
      roles.includes("ALMACEN") || roles.includes("ADMIN") || areas.includes("ALMACEN");
    if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const ordenId = String(searchParams.get("ordenId") || "").trim();
    if (!ordenId) return NextResponse.json({ ok: false, error: "ORDEN_ID_REQUIRED" }, { status: 400 });

    const db = adminDb();
    const ordenSnap = await db.collection("ordenes").doc(ordenId).get();
    if (!ordenSnap.exists) return NextResponse.json({ ok: false, error: "ORDEN_NOT_FOUND" }, { status: 404 });

    const orden = ordenSnap.data() as any;
    const codigoCliente = String(orden?.codiSeguiClien || "").trim();
    const fechaYmd = String(orden?.fechaFinVisiYmd || orden?.fSoliYmd || "").trim();

    if (!codigoCliente || !fechaYmd) {
      return NextResponse.json({ ok: true, found: false });
    }

    const snap = await db.collection("telegram_preliquidaciones").doc(preliqDocId(codigoCliente, fechaYmd)).get();
    if (!snap.exists) return NextResponse.json({ ok: true, found: false });

    const row = (snap.data() || {}) as Record<string, unknown>;
    const pre = (row.preliquidacion || {}) as Record<string, unknown>;

    return NextResponse.json({
      ok: true,
      found: true,
      item: {
        ordenId,
        codigoCliente,
        fechaYmd,
        snOnt: String(pre.snOnt || "").trim(),
        snMeshes: cleanSeries(pre.snMeshes),
        snBoxes: cleanSeries(pre.snBoxes),
        snFono: String(pre.snFono || "").trim(),
        rotuloNapCto: String(pre.rotuloNapCto || "").trim(),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
