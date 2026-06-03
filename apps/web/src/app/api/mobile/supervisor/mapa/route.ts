import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getMobileAuthContext } from "@/core/auth/mobile";
import { getSupervisorContext, getSupervisorAssignments, listSupervisorOrders } from "@/core/auth/mobileSupervisor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) { const n = Number(v); if (Number.isFinite(n)) return n; }
  return null;
}

function isGarantia(x: any) {
  return `${x?.tipo || ""} ${x?.tipoTraba || ""} ${x?.idenServi || ""} ${x?.tipoServicio || ""}`.toUpperCase().includes("GARANTIA");
}

async function listAllOrdersWithGeo(ymd: string) {
  const db = adminDb();
  const docsById = new Map<string, any>();
  const [snap1, snap2] = await Promise.all([
    db.collection("ordenes").where("fSoliYmd", "==", ymd).limit(5000).get(),
    db.collection("ordenes").where("fechaFinVisiYmd", "==", ymd).limit(5000).get(),
  ]);
  for (const doc of [...snap1.docs, ...snap2.docs]) docsById.set(doc.id, doc.data());

  return Array.from(docsById.entries())
    .filter(([, data]) => {
      const primaryYmd = String(data?.fSoliYmd || "").trim();
      const fallbackYmd = String(data?.fechaFinVisiYmd || "").trim();
      return (primaryYmd || fallbackYmd) === ymd;
    })
    .map(([id, data]) => ({
      id,
      ordenId: String(data?.ordenId || id),
      cliente: String(data?.cliente || "").trim(),
      direccion: String(data?.direccion || data?.direccion1 || "").trim(),
      estado: String(data?.estado || "").trim(),
      isGarantia: isGarantia(data),
      cuadrillaId: String(data?.cuadrillaId || "").trim(),
      cuadrillaNombre: String(data?.cuadrillaNombre || "").trim(),
      region: String(data?.region || data?.zonaDistrito || data?.distrito || "").trim(),
      hasSupervision: !!data?.supervision?.supervisorUid,
      lat: toNum(data?.lat),
      lng: toNum(data?.lng),
    }))
    .filter((o) => typeof o.lat === "number" && typeof o.lng === "number");
}

export async function GET(req: Request) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

    const ctx = await getSupervisorContext(mobile);
    const { searchParams } = new URL(req.url);
    const ymd = String(searchParams.get("ymd") || todayLimaYmd()).trim();
    const modo = String(searchParams.get("modo") || "ORDENES").toUpperCase();

    let items: any[];

    if (modo === "CUADRILLAS") {
      // Todas las órdenes del día con geo (igual que Coordinador)
      items = await listAllOrdersWithGeo(ymd);
    } else {
      // MIS_ORDENES / GARANTIAS: solo cuadrillas del supervisor
      const soloGarantias = modo === "GARANTIAS";
      const assignments = await getSupervisorAssignments(ctx.uid, ymd);
      const allOrders = await listSupervisorOrders(assignments.cuadrillasHoy, ymd, soloGarantias);
      items = allOrders
        .filter((o) => typeof o.lat === "number" && typeof o.lng === "number")
        .map((o) => ({ ...o }));
    }

    return NextResponse.json({ ok: true, ymd, modo, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
