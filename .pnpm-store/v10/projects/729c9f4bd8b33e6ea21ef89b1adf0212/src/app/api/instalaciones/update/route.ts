import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

const BodySchema = z.object({
  id: z.string().min(1),
  planGamer: z.string().optional(),
  kitWifiPro: z.string().optional(),
  servicioCableadoMesh: z.string().optional(),
  cat5e: z.coerce.number().int().nonnegative().optional(),
  cat6: z.coerce.number().int().nonnegative().optional(),
  puntosUTP: z.coerce.number().int().nonnegative().optional(),
  observacion: z.string().optional(),
});

export async function POST(req: Request) {
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

    const raw = await req.json();
    const merged = raw && typeof raw === "object" && raw.changes ? { ...raw, ...raw.changes } : raw;
    const parsed = BodySchema.safeParse(merged);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "FORM_INVALIDO" }, { status: 400 });
    }

    const data = parsed.data;
    const ref = adminDb().collection("instalaciones").doc(data.id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });

    const payload: Record<string, any> = {
      updatedAt: FieldValue.serverTimestamp(),
    };
    const serviciosPatch: Record<string, any> = {};
    const liquidacionPatch: Record<string, any> = {};
    const liquidacionServiciosPatch: Record<string, any> = {};

    if (data.planGamer !== undefined) {
      serviciosPatch.planGamer = String(data.planGamer || "");
      liquidacionServiciosPatch.planGamer = String(data.planGamer || "");
    }
    if (data.kitWifiPro !== undefined) {
      serviciosPatch.kitWifiPro = String(data.kitWifiPro || "");
      liquidacionServiciosPatch.kitWifiPro = String(data.kitWifiPro || "");
    }
    if (data.servicioCableadoMesh !== undefined) {
      serviciosPatch.servicioCableadoMesh = String(data.servicioCableadoMesh || "");
      liquidacionServiciosPatch.servicioCableadoMesh = String(data.servicioCableadoMesh || "");
    }
    if (data.cat5e !== undefined) {
      serviciosPatch.cat5e = Number(data.cat5e || 0);
      liquidacionServiciosPatch.cat5e = Number(data.cat5e || 0);
    }
    if (data.cat6 !== undefined) {
      serviciosPatch.cat6 = Number(data.cat6 || 0);
      liquidacionServiciosPatch.cat6 = Number(data.cat6 || 0);
    }
    if (data.puntosUTP !== undefined) {
      serviciosPatch.puntosUTP = Number(data.puntosUTP || 0);
      liquidacionServiciosPatch.puntosUTP = Number(data.puntosUTP || 0);
    }
    if (data.observacion !== undefined) {
      liquidacionPatch.observacion = String(data.observacion || "");
    }

    if (Object.keys(serviciosPatch).length) payload.servicios = serviciosPatch;
    if (Object.keys(liquidacionServiciosPatch).length) {
      liquidacionPatch.servicios = liquidacionServiciosPatch;
    }
    if (Object.keys(liquidacionPatch).length) payload.liquidacion = liquidacionPatch;

    await ref.set(payload, { merge: true });
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
