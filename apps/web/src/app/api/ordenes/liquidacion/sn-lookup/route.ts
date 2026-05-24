import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";
import { normalizeUbicacion } from "@/domain/equipos/repo";

export const runtime = "nodejs";

type LookupReason =
  | "NOT_FOUND"
  | "IN_TARGET_CUADRILLA"
  | "IN_OTHER_CUADRILLA"
  | "IN_ALMACEN"
  | "IN_GARANTIA"
  | "IN_AVERIA"
  | "IN_WIN"
  | "IN_PERDIDO"
  | "IN_ROBO"
  | "ALREADY_INSTALLED"
  | "UNKNOWN_LOCATION";

function resolveReason(normUbicacion: string, isCuadrilla: boolean): LookupReason {
  if (isCuadrilla) return "IN_OTHER_CUADRILLA";
  if (normUbicacion === "ALMACEN") return "IN_ALMACEN";
  if (normUbicacion === "GARANTIA") return "IN_GARANTIA";
  if (normUbicacion === "AVERIA") return "IN_AVERIA";
  if (normUbicacion === "WIN") return "IN_WIN";
  if (normUbicacion === "PERDIDO") return "IN_PERDIDO";
  if (normUbicacion === "ROBO") return "IN_ROBO";
  if (normUbicacion === "INSTALADOS") return "ALREADY_INSTALLED";
  return "UNKNOWN_LOCATION";
}

function buildActionHint(reason: LookupReason, targetCuadrillaNombre: string): string {
  if (reason === "IN_TARGET_CUADRILLA") return "Disponible para liquidar en esta cuadrilla.";
  if (reason === "IN_OTHER_CUADRILLA") {
    return targetCuadrillaNombre
      ? `Mover equipo a ${targetCuadrillaNombre} antes de liquidar.`
      : "Mover equipo a la cuadrilla objetivo antes de liquidar.";
  }
  if (reason === "ALREADY_INSTALLED") return "No permitir liquidar este SN porque ya figura instalado.";
  if (reason === "NOT_FOUND") return "Verificar el serial ingresado.";
  if (reason === "IN_ALMACEN") return "El equipo sigue en almacen; no corresponde liquidarlo desde esta cuadrilla.";
  if (reason === "IN_GARANTIA" || reason === "IN_AVERIA") return "El equipo no esta disponible para liquidacion.";
  if (reason === "IN_WIN") return "Revisar con WIN antes de liquidar este SN.";
  if (reason === "IN_PERDIDO" || reason === "IN_ROBO") return "No corresponde liquidar este SN.";
  return "Revisar la ubicacion real del equipo antes de liquidar.";
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }

    const allowed = session.isAdmin || session.permissions.includes("ORDENES_LIQUIDAR");
    if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const sn = String(searchParams.get("sn") || "").trim().toUpperCase();
    const targetCuadrillaId = String(searchParams.get("cuadrillaId") || "").trim();
    if (!sn) return NextResponse.json({ ok: false, error: "SN_REQUIRED" }, { status: 400 });

    const db = adminDb();
    const equipoSnap = await db.collection("equipos").doc(sn).get();
    if (!equipoSnap.exists) {
      return NextResponse.json({
        ok: true,
        sn,
        found: false,
        equipo: "",
        proid: "",
        inTargetCuadrillaStock: false,
        targetCuadrillaId,
        targetCuadrillaNombre: "",
        ubicacion: "",
        estado: "",
        isCuadrilla: false,
        currentCuadrillaId: "",
        currentCuadrillaNombre: "",
        isInstalado: false,
        cliente: "",
        codigoCliente: "",
        reason: "NOT_FOUND",
        actionHint: "Verificar el serial ingresado.",
      });
    }

    const equipo = equipoSnap.data() as any;
    const equipoTipo = String(equipo?.equipo || "").trim().toUpperCase();
    const proid = String(equipo?.proId || equipo?.proid || "").trim();
    const ubicacionRaw = String(equipo?.ubicacion || "");
    const estadoRaw = String(equipo?.estado || "");
    const currentNorm = normalizeUbicacion(ubicacionRaw);

    let targetCuadrillaNombre = "";
    let inTargetCuadrillaStock = false;
    if (targetCuadrillaId) {
      const [targetSnap, seriesSnap] = await Promise.all([
        db.collection("cuadrillas").doc(targetCuadrillaId).get(),
        db.collection("cuadrillas").doc(targetCuadrillaId).collection("equipos_series").doc(sn).get(),
      ]);
      targetCuadrillaNombre = String((targetSnap.data() as any)?.nombre || "").trim();
      inTargetCuadrillaStock = seriesSnap.exists;
    }

    let currentCuadrillaId = "";
    let currentCuadrillaNombre = "";
    if (currentNorm.isCuadrilla) {
      currentCuadrillaNombre = currentNorm.ubicacion;
      const cuadSnap = await db
        .collection("cuadrillas")
        .where("nombre", "==", currentNorm.ubicacion)
        .limit(1)
        .get();
      if (!cuadSnap.empty) currentCuadrillaId = cuadSnap.docs[0].id;
    }

    let reason: LookupReason;
    if (inTargetCuadrillaStock) reason = "IN_TARGET_CUADRILLA";
    else if (currentNorm.ubicacion === "INSTALADOS" || estadoRaw.toUpperCase() === "INSTALADO") reason = "ALREADY_INSTALLED";
    else reason = resolveReason(currentNorm.ubicacion, currentNorm.isCuadrilla);

    return NextResponse.json({
      ok: true,
      sn,
      found: true,
      equipo: equipoTipo,
      proid,
      inTargetCuadrillaStock,
      targetCuadrillaId,
      targetCuadrillaNombre,
      ubicacion: currentNorm.ubicacion || ubicacionRaw,
      estado: currentNorm.estado || estadoRaw,
      isCuadrilla: currentNorm.isCuadrilla,
      currentCuadrillaId,
      currentCuadrillaNombre,
      isInstalado: reason === "ALREADY_INSTALLED",
      cliente: String(equipo?.cliente || "").trim(),
      codigoCliente: String(equipo?.codigoCliente || "").trim(),
      reason,
      actionHint: buildActionHint(reason, targetCuadrillaNombre),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
