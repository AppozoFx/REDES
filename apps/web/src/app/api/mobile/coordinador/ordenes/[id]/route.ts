import { NextResponse } from "next/server";
import { getMobileAuthContext } from "@/core/auth/mobile";
import { getCoordinadorContext } from "@/core/auth/mobileCoordinador";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanValue(v: unknown): string {
  return String(v || "").trim();
}

function toInt(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return 0;
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function isGarantia(data: any): boolean {
  return String(data?.tipoTraba || data?.tipo || "").trim().toUpperCase().includes("GARANTIA") ||
    String(data?.isGarantia || "").trim().toUpperCase() === "TRUE" ||
    data?.isGarantia === true;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const mobile = await getMobileAuthContext(req);
    if (!mobile) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

    const coord = await getCoordinadorContext(mobile);

    const snap = await adminDb().collection("ordenes").doc(id).get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: "ORDER_NOT_FOUND" }, { status: 404 });

    const data = snap.data() as any;
    const orderCuadrillaId = cleanValue(data?.cuadrillaId);
    if (coord.cuadrillasIds.length && !coord.cuadrillasIds.includes(orderCuadrillaId)) {
      return NextResponse.json({ ok: false, error: "ORDER_NOT_IN_COORDINATOR_CUADRILLAS" }, { status: 403 });
    }

    return NextResponse.json({
      ok: true,
      item: {
        id: snap.id,
        ordenId: cleanValue(data?.ordenId || snap.id),
        cliente: cleanValue(data?.cliente),
        codigoCliente: cleanValue(data?.codiSeguiClien),
        documento: cleanValue(data?.documento || data?.nroDoc),
        telefono: cleanValue(data?.telefono || data?.celular),
        direccion: cleanValue(data?.direccion || data?.direccion1),
        estado: cleanValue(data?.estado),
        tipoTrabajo: cleanValue(data?.tipoTraba || data?.tipo),
        tipoServicio: cleanValue(data?.idenServi),
        fechaProgramadaHm: cleanValue(data?.fSoliHm || data?.fechaFinVisiHm),
        fechaProgramadaYmd: cleanValue(data?.fSoliYmd || data?.fechaFinVisiYmd),
        isGarantia: isGarantia(data),
        region: cleanValue(data?.region || data?.zonaDistrito || data?.distrito),
        cuadrillaId: orderCuadrillaId,
        cuadrillaNombre: cleanValue(data?.cuadrillaNombre),
        lat: toNum(data?.lat),
        lng: toNum(data?.lng),
        cantMesh: toInt(data?.cantMESHwin),
        cantFono: toInt(data?.cantFONOwin),
        cantBox: toInt(data?.cantBOXwin),
      },
    });
  } catch (e: any) {
    const status = String(e?.message || "").includes("NOT_FOUND") ? 404 : 500;
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status });
  }
}
