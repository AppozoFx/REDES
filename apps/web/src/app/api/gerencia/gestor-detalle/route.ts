import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteState = "OPERATIVA" | "EN_CAMPO" | "RUTA_CERRADA";

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function tramoFromHm(hm: string) {
  const h = Number(String(hm || "").split(":")[0]);
  if (!Number.isFinite(h)) return "Sin tramo";
  if (h < 10) return "Primer Tramo";
  if (h < 14) return "Segundo Tramo";
  return "Tercer Tramo";
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
    const canUse = session.isAdmin || roles.includes("GERENCIA");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const gestorUid = String(searchParams.get("gestorUid") || "").trim();
    const ymd = String(searchParams.get("ymd") || todayLimaYmd()).trim();
    if (!gestorUid) return NextResponse.json({ ok: false, error: "GESTOR_REQUIRED" }, { status: 400 });

    const db = adminDb();
    const cuadrillasSnap = await db
      .collection("cuadrillas")
      .where("estado", "==", "HABILITADO")
      .where("gestorUid", "==", gestorUid)
      .get();

    const cuadrillas = cuadrillasSnap.docs.map((d) => ({
      cuadrillaId: d.id,
      cuadrillaNombre: String((d.data() as any)?.nombre || d.id),
    }));
    const cuadrillaIds = cuadrillas.map((c) => c.cuadrillaId);

    const [stateSnaps, ordenesSnap] = await Promise.all([
      cuadrillaIds.length
        ? db.getAll(...cuadrillaIds.map((id) => db.collection("cuadrilla_estado_diario").doc(`${ymd}_${id}`)))
        : Promise.resolve([] as any[]),
      db.collection("ordenes").where("fSoliYmd", "==", ymd).limit(5000).get(),
    ]);

    const stateMap = new Map<string, RouteState>();
    for (const s of stateSnaps as any[]) {
      const data = s.data?.() as any;
      const cuadrillaId = String(data?.cuadrillaId || "");
      if (!cuadrillaId) continue;
      const estado = String(data?.estadoRuta || "OPERATIVA").toUpperCase();
      const safe = estado === "EN_CAMPO" || estado === "RUTA_CERRADA" ? estado : "OPERATIVA";
      stateMap.set(cuadrillaId, safe as RouteState);
    }

    const cuadrillaNameMap = new Map(cuadrillas.map((c) => [c.cuadrillaId, c.cuadrillaNombre]));
    const setIds = new Set(cuadrillaIds);

    const ordenes = ordenesSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .filter((x) => setIds.has(String(x?.cuadrillaId || "").trim()))
      .map((x) => ({
        id: String(x?.ordenId || x?.id || ""),
        cuadrillaId: String(x?.cuadrillaId || ""),
        cuadrillaNombre: cuadrillaNameMap.get(String(x?.cuadrillaId || "")) || String(x?.cuadrillaNombre || x?.cuadrillaId || ""),
        tramo: tramoFromHm(String(x?.fSoliHm || x?.fechaFinVisiHm || "")),
        cliente: String(x?.cliente || ""),
        estado: String(x?.estado || ""),
        estadoLlamada: String(x?.estadoLlamada || ""),
        observacionLlamada: String(x?.observacionLlamada || ""),
      }));

    const stats = new Map<
      string,
      { ordenes: number; agendada: number; iniciada: number; finalizada: number; llamadasTotal: number; llamadasRealizadas: number }
    >();
    for (const cid of cuadrillaIds) {
      stats.set(cid, { ordenes: 0, agendada: 0, iniciada: 0, finalizada: 0, llamadasTotal: 0, llamadasRealizadas: 0 });
    }
    for (const o of ordenes) {
      const st = stats.get(o.cuadrillaId);
      if (!st) continue;
      st.ordenes += 1;
      const e = String(o.estado || "").toUpperCase();
      if (e.includes("AGEN")) st.agendada += 1;
      else if (e.includes("INIC") || e.includes("CAMINO")) st.iniciada += 1;
      else if (e.includes("FINAL")) st.finalizada += 1;
      st.llamadasTotal += 1;
      if (String(o.estadoLlamada || "").trim()) st.llamadasRealizadas += 1;
    }

    const cuadrillasDetalle = cuadrillas.map((c) => {
      const st = stats.get(c.cuadrillaId)!;
      return {
        cuadrillaId: c.cuadrillaId,
        cuadrillaNombre: c.cuadrillaNombre,
        estadoRuta: stateMap.get(c.cuadrillaId) || "OPERATIVA",
        ordenes: {
          total: st.ordenes,
          agendada: st.agendada,
          iniciada: st.iniciada,
          finalizada: st.finalizada,
        },
        llamadas: {
          total: st.llamadasTotal,
          realizadas: st.llamadasRealizadas,
          pendientes: Math.max(0, st.llamadasTotal - st.llamadasRealizadas),
        },
      };
    });

    return NextResponse.json({
      ok: true,
      ymd,
      gestorUid,
      cuadrillas: cuadrillasDetalle,
      ordenes,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
