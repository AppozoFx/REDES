import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

const BodySchema = z.object({
  id: z.string().min(1),
  zonaId: z.string().optional(),
  tipoZona: z.string().optional(),
  placa: z.string().optional(),
  gestorUid: z.string().optional(),
  coordinadorUid: z.string().optional(),
  credUsuario: z.string().optional(),
  credPassword: z.string().optional(),
  tecnicosUids: z.array(z.string()).optional(),
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
    const canUse =
      session.isAdmin ||
      session.permissions.includes("CUADRILLAS_MANAGE") ||
      ((session.access.areas || []).includes("INSTALACIONES") && (roles.includes("GESTOR") || roles.includes("ALMACEN")));
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const raw = await req.json();
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: "FORM_INVALIDO" }, { status: 400 });

    const data = parsed.data;
    const ref = adminDb().collection("cuadrillas").doc(data.id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: "CUADRILLA_NOT_FOUND" }, { status: 404 });

    const payload: Record<string, any> = {
      "audit.updatedAt": FieldValue.serverTimestamp(),
      "audit.updatedBy": session.uid,
    };

    if (data.zonaId !== undefined) payload.zonaId = data.zonaId || "";
    if (data.tipoZona !== undefined) payload.tipoZona = data.tipoZona || "";
    if (data.placa !== undefined) payload.placa = data.placa || "";
    if (data.gestorUid !== undefined) payload.gestorUid = data.gestorUid || "";
    if (data.coordinadorUid !== undefined) payload.coordinadorUid = data.coordinadorUid || "";
    if (data.credUsuario !== undefined) payload.credUsuario = data.credUsuario || "";
    if (data.credPassword !== undefined) payload.credPassword = data.credPassword || "";
    if (data.tecnicosUids !== undefined) payload.tecnicosUids = data.tecnicosUids;

    await ref.set(payload, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
