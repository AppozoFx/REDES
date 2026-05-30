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
  const m = ym.trim().match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]); const mm = Number(m[2]);
  if (!Number.isFinite(y) || mm < 1 || mm > 12) return null;
  const lastDay = new Date(y, mm, 0).getDate();
  return { start: `${m[1]}-${m[2]}-01`, end: `${m[1]}-${m[2]}-${String(lastDay).padStart(2, "0")}` };
}

function clean(v: any) { return String(v || "").trim(); }

function isGarantia(o: any) {
  return `${clean(o?.tipo)} ${clean(o?.tipoTraba)} ${clean(o?.idenServi)}`.toUpperCase().includes("GARANTIA");
}

function inRange(ymd: string, start: string, end: string) {
  return ymd >= start && ymd <= end;
}

export async function GET(req: Request) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

    const coord = await getCoordinadorContext(mobile);
    if (!coord.cuadrillasIds.length) return NextResponse.json({ ok: true, ym: todayLimaYm(), pendientesByCuadrilla: [] });

    const { searchParams } = new URL(req.url);
    const ym = clean(searchParams.get("ym") || todayLimaYm());
    const range = monthRange(ym);
    if (!range) return NextResponse.json({ ok: false, error: "YM_INVALID" }, { status: 400 });
    const { start, end } = range;

    const db = adminDb();
    const cuadrillaNames = new Map(coord.cuadrillas.map((c) => [c.id, c.nombre]));

    // 1. Consultar órdenes por cuadrilla (equality query → índice automático, sin composite)
    //    Mucho más rápido que leer todo el mes completo en un solo barrido
    const cuadrillaSnaps = await Promise.all(
      coord.cuadrillas.map((c) =>
        db.collection("ordenes").where("cuadrillaId", "==", c.id).limit(1500).get()
          .then((snap) => ({ cuadrillaId: c.id, snap }))
      )
    );

    // 2. Filtrar en memoria: FINALIZADA, en rango del mes, no garantía, con pedido
    const ordenesDelMes: Array<{ pedido: string; cliente: string; ymd: string; cuadrillaId: string }> = [];
    for (const { cuadrillaId, snap } of cuadrillaSnaps) {
      for (const doc of snap.docs) {
        const o = doc.data() as any;
        const estado = clean(o?.estado).toUpperCase();
        if (estado !== "FINALIZADA") continue;
        if (isGarantia(o)) continue;
        const ymd = clean(o?.fechaFinVisiYmd || o?.fSoliYmd);
        if (!inRange(ymd, start, end)) continue;
        const pedido = clean(o?.codiSeguiClien || o?.ordenId);
        if (!pedido) continue;
        ordenesDelMes.push({ pedido, cliente: clean(o?.cliente), ymd, cuadrillaId });
      }
    }

    if (!ordenesDelMes.length) {
      return NextResponse.json({ ok: true, ym, pendientesByCuadrilla: [] });
    }

    // 3. Preliquidaciones del mes — range query en campo único `ymd` (índice automático)
    const preliqSnap = await db.collection("telegram_preliquidaciones")
      .where("ymd", ">=", start)
      .where("ymd", "<=", end)
      .orderBy("ymd")
      .limit(10000)
      .get();

    const preliqPedidos = new Set(preliqSnap.docs.map((d) => clean(d.data()?.pedido)).filter(Boolean));

    // 4. Órdenes sin plantilla
    const sinPlantilla = ordenesDelMes.filter((o) => !preliqPedidos.has(o.pedido));

    // 5. Agrupar por cuadrilla
    const byCuadrilla = new Map<string, { cuadrillaId: string; cuadrillaNombre: string; pedidos: Array<{ pedido: string; cliente: string; ymd: string }> }>();
    for (const o of sinPlantilla) {
      if (!byCuadrilla.has(o.cuadrillaId)) {
        byCuadrilla.set(o.cuadrillaId, {
          cuadrillaId: o.cuadrillaId,
          cuadrillaNombre: cuadrillaNames.get(o.cuadrillaId) || o.cuadrillaId,
          pedidos: [],
        });
      }
      byCuadrilla.get(o.cuadrillaId)!.pedidos.push({ pedido: o.pedido, cliente: o.cliente, ymd: o.ymd });
    }

    const pendientesByCuadrilla = Array.from(byCuadrilla.values())
      .map((c) => ({ ...c, total: c.pedidos.length, pedidos: c.pedidos.sort((a, b) => b.ymd.localeCompare(a.ymd)) }))
      .sort((a, b) => a.cuadrillaNombre.localeCompare(b.cuadrillaNombre, "es", { sensitivity: "base" }));

    return NextResponse.json({ ok: true, ym, pendientesByCuadrilla });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
