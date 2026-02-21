import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

const BodySchema = z.object({
  id: z.string().min(1),
  tipoOrden: z.enum(["RESIDENCIAL", "CONDOMINIO"]).optional(),
  coordinadorCuadrilla: z.string().optional(),
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
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "FORM_INVALIDO" }, { status: 400 });
    }

    const data = parsed.data;
    const db = adminDb();
    const instRef = db.collection("instalaciones").doc(data.id);
    const instSnap = await instRef.get();
    if (!instSnap.exists) return NextResponse.json({ ok: false, error: "INSTALACION_NOT_FOUND" }, { status: 404 });

    const payload: any = {
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (data.tipoOrden !== undefined) payload["orden.tipoOrden"] = data.tipoOrden;
    if (data.coordinadorCuadrilla !== undefined) {
      payload["orden.coordinadorCuadrilla"] = String(data.coordinadorCuadrilla || "");
    }
    if (data.observacion !== undefined) payload["liquidacion.observacion"] = String(data.observacion || "");
    await instRef.update(payload);
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}


