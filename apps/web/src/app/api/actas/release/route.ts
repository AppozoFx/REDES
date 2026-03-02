import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

const BodySchema = z.object({
  acta: z.string().min(1),
  instalacionId: z.string().optional(),
});

function normalizeActa(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

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
    if (!parsed.success) return NextResponse.json({ ok: false, error: "FORM_INVALIDO" }, { status: 400 });

    const acta = normalizeActa(parsed.data.acta);
    if (!acta) return NextResponse.json({ ok: false, error: "ACTA_REQUIRED" }, { status: 400 });

    const db = adminDb();
    const actaRef = db.collection("actas").doc(acta);

    const result = await db.runTransaction(async (tx) => {
      const actaSnap = await tx.get(actaRef);
      if (!actaSnap.exists) throw new Error("ACTA_NOT_FOUND");
      const actaData = actaSnap.data() as any;

      const linkedInstId = String(parsed.data.instalacionId || actaData?.instalacionId || "").trim();
      let instalacionLiberada = "";

      if (linkedInstId) {
        const instRef = db.collection("instalaciones").doc(linkedInstId);
        const instSnap = await tx.get(instRef);
        if (instSnap.exists) {
          tx.set(
            instRef,
            {
              ACTA: FieldValue.delete(),
              acta: FieldValue.delete(),
              "materialesLiquidacion.acta": FieldValue.delete(),
              correccionPendiente: true,
              liquidadoAt: FieldValue.delete(),
              liquidadoBy: FieldValue.delete(),
              liquidadoYmd: FieldValue.delete(),
              "liquidacion.estado": FieldValue.delete(),
              "liquidacion.at": FieldValue.delete(),
              "liquidacion.by": FieldValue.delete(),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          instalacionLiberada = linkedInstId;
        }
      }

      tx.set(
        actaRef,
        {
          estado: "RECEPCIONADO",
          instalacionId: FieldValue.delete(),
          codigoCliente: FieldValue.delete(),
          cliente: FieldValue.delete(),
          liquidadaAt: FieldValue.delete(),
          liberadaAt: FieldValue.serverTimestamp(),
          liberadaBy: session.uid,
        },
        { merge: true }
      );

      return { instalacionLiberada };
    });

    return NextResponse.json({
      ok: true,
      acta,
      instalacionLiberada: result.instalacionLiberada || null,
    });
  } catch (e: any) {
    const msg = String(e?.message || "ERROR");
    const status = msg === "ACTA_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

