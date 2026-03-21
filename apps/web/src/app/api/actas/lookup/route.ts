import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

function normalizeActa(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

type InstalacionMatch = {
  id: string;
  codigoCliente: string;
  cliente: string;
  cuadrillaNombre: string;
  tipoOrden: string;
  liquidado: boolean;
  liquidadoAt: string;
  correccionPendiente: boolean;
};

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    const canUse =
      session.isAdmin ||
      session.permissions.includes("ORDENES_LIQUIDAR") ||
      (session.access.areas || []).includes("INSTALACIONES");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const acta = normalizeActa(String(searchParams.get("acta") || ""));
    if (!acta) return NextResponse.json({ ok: false, error: "ACTA_REQUIRED" }, { status: 400 });

    const db = adminDb();
    const actaRef = db.collection("actas").doc(acta);
    const [actaSnap, byActaSnap, byMatActaSnap] = await Promise.all([
      actaRef.get(),
      db.collection("instalaciones").where("ACTA", "==", acta).limit(50).get(),
      db.collection("instalaciones").where("materialesLiquidacion.acta", "==", acta).limit(50).get(),
    ]);

    const rowsMap = new Map<string, InstalacionMatch>();
    for (const doc of [...byActaSnap.docs, ...byMatActaSnap.docs]) {
      const x = doc.data() as any;
      const liqEstado = String(x?.liquidacion?.estado || "").toUpperCase();
      const correccionPendiente = !!x?.correccionPendiente;
      const liquidado = (liqEstado === "LIQUIDADO" || !!x?.liquidadoAt) && !correccionPendiente;
      rowsMap.set(doc.id, {
        id: doc.id,
        codigoCliente: String(x?.codigoCliente || x?.orden?.codiSeguiClien || "").trim(),
        cliente: String(x?.cliente || x?.orden?.cliente || "").trim(),
        cuadrillaNombre: String(x?.cuadrillaNombre || x?.orden?.cuadrillaNombre || "").trim(),
        tipoOrden: String(x?.tipoOrden || x?.orden?.tipoOrden || x?.tipo || "").trim().toUpperCase(),
        liquidado,
        liquidadoAt: String(x?.liquidadoAt || x?.liquidacion?.at || "").trim(),
        correccionPendiente,
      });
    }

    const instalaciones = Array.from(rowsMap.values()).sort((a, b) => {
      if (Number(b.liquidado) !== Number(a.liquidado)) return Number(b.liquidado) - Number(a.liquidado);
      return a.codigoCliente.localeCompare(b.codigoCliente, "es", { sensitivity: "base" });
    });

    const actaData = actaSnap.exists ? (actaSnap.data() as any) : null;
    const estadoActa = String(actaData?.estado || "").toUpperCase();
    const instalacionId = String(actaData?.instalacionId || "").trim();
    const recepcionada = !!actaSnap.exists;
    const liquidada = estadoActa === "LIQUIDADA" || instalaciones.some((x) => x.liquidado);

    return NextResponse.json({
      ok: true,
      acta,
      recepcionada,
      liquidada,
      canRelease: recepcionada && (liquidada || !!instalacionId),
      actaDoc: {
        exists: !!actaSnap.exists,
        estado: estadoActa || "NO_RECEPCIONADA",
        instalacionId,
        codigoCliente: String(actaData?.codigoCliente || "").trim(),
        cliente: String(actaData?.cliente || "").trim(),
        coordinadorNombre: String(actaData?.coordinadorNombre || "").trim(),
        cuadrillaNombre: String(actaData?.cuadrillaNombre || "").trim(),
        recibidoAt: String(actaData?.recibidoAt || "").trim(),
        liquidadaAt: String(actaData?.liquidadaAt || "").trim(),
      },
      instalaciones,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
