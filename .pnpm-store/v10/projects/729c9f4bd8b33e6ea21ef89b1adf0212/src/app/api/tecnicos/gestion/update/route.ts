import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

const BodySchema = z.object({
  id: z.string().min(1),
  celular: z.string().optional(),
  dni_ce: z.string().optional(),
  fecha_nacimiento: z.string().optional(),
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
      ((session.access.areas || []).includes("INSTALACIONES") &&
        (roles.includes("GESTOR") || roles.includes("ALMACEN")));
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const raw = await req.json();
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: "FORM_INVALIDO" }, { status: 400 });

    const data = parsed.data;
    const ref = adminDb().collection("usuarios").doc(data.id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: "USUARIO_NOT_FOUND" }, { status: 404 });

    const payload: Record<string, any> = {
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (data.celular !== undefined) payload.celular = data.celular || "";
    if (data.dni_ce !== undefined) payload.nroDoc = data.dni_ce || "";
    if (data.fecha_nacimiento !== undefined) payload.fNacimiento = data.fecha_nacimiento || "";

    await ref.set(payload, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
