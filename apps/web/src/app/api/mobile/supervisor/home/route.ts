import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getMobileAuthContext } from "@/core/auth/mobile";
import { getSupervisorContext, getSupervisorAssignments, listSupervisorOrders } from "@/core/auth/mobileSupervisor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
}

export async function GET(req: Request) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

    const ctx = await getSupervisorContext(mobile);
    const ymd = todayLimaYmd();
    const assignments = await getSupervisorAssignments(ctx.uid, ymd);

    const cuadrillaIds = assignments.cuadrillasHoy;
    const [cuadrillasSnap, orders] = await Promise.all([
      cuadrillaIds.length
        ? adminDb().getAll(...cuadrillaIds.map((id) => adminDb().collection("cuadrillas").doc(id)))
        : Promise.resolve([]),
      listSupervisorOrders(cuadrillaIds, ymd),
    ]);

    const cuadrillasHoy = cuadrillaIds.map((id, i) => {
      const data = (cuadrillasSnap as any[])[i]?.exists ? ((cuadrillasSnap as any[])[i].data() as any) : {};
      const ordenes = orders.filter((o) => o.cuadrillaId === id);
      return {
        id,
        nombre: String(data?.nombre || id),
        ordenesTotal: ordenes.length,
        garantiasTotal: ordenes.filter((o) => o.isGarantia).length,
        estadoActual: String(data?.estadoActual || ""),
      };
    });

    // Group orders by region
    const regionMap = new Map<string, { regionId: string; regionNombre: string; total: number; garantias: number; finalizadas: number; pendientes: number }>();
    for (const order of orders) {
      const rid = order.region || "SIN_REGION";
      const entry = regionMap.get(rid) || { regionId: rid, regionNombre: rid === "SIN_REGION" ? "Sin región" : rid, total: 0, garantias: 0, finalizadas: 0, pendientes: 0 };
      entry.total += 1;
      if (order.isGarantia) entry.garantias += 1;
      if (order.isFinalizada) entry.finalizadas += 1;
      else entry.pendientes += 1;
      regionMap.set(rid, entry);
    }

    return NextResponse.json({
      ok: true,
      ymd,
      supervisor: { uid: ctx.uid, nombre: ctx.nombre, nombreCorto: ctx.nombreCorto, vehiculoPlaca: ctx.vehiculoPlaca },
      trackingHabilitado: ctx.trackingHabilitado,
      regionesHoy: assignments.regionesHoy,
      cuadrillasHoy,
      ordenesPorRegion: Array.from(regionMap.values()).sort((a, b) => b.total - a.total),
      totales: {
        ordenes: orders.filter((o) => !o.isGarantia).length,
        garantias: orders.filter((o) => o.isGarantia).length,
        finalizadas: orders.filter((o) => o.isFinalizada).length,
        pendientes: orders.filter((o) => !o.isFinalizada).length,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
