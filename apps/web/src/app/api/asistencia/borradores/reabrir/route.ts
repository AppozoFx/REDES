import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

const BodySchema = z.object({
  fecha: z.string().min(1),
  gestorUid: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }

    const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
    const canAdmin = session.isAdmin || roles.includes("GERENCIA") || roles.includes("ALMACEN") || roles.includes("RRHH");
    if (!canAdmin) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const raw = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: "FORM_INVALIDO" }, { status: 400 });

    const { fecha, gestorUid } = parsed.data;
    const draftId = `${fecha}_${gestorUid}`;
    const ref = adminDb().collection("asistencia_borradores").doc(draftId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: "BORRADOR_NOT_FOUND" }, { status: 404 });

    const estado = String((snap.data() as any)?.estado || "ABIERTO").toUpperCase();
    if (estado === "CERRADO") {
      return NextResponse.json({ ok: false, error: "BORRADOR_CERRADO" }, { status: 400 });
    }
    if (estado !== "CONFIRMADO") {
      return NextResponse.json({ ok: false, error: "BORRADOR_NO_REABRIBLE" }, { status: 400 });
    }

    await ref.set(
      {
        estado: "ABIERTO",
        reabiertoAt: FieldValue.serverTimestamp(),
        reabiertoBy: session.uid,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: session.uid,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, draftId });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
