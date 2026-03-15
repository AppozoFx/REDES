import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

const BodySchema = z.object({
  fecha: z.string().min(1),
  gestorUid: z.string().optional(),
  cuadrillas: z
    .array(
      z.object({
        cuadrillaId: z.string().min(1),
        cuadrillaNombre: z.string().optional(),
        zonaId: z.string().optional(),
        zonaNombre: z.string().optional(),
        estadoAsistencia: z.string().min(1),
        tecnicosIds: z.array(z.string()).optional(),
        observacion: z.string().optional(),
        coordinadorUid: z.string().optional(),
        coordinadorNombre: z.string().optional(),
      })
    )
    .min(1),
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
    const canGestor = roles.includes("GESTOR");
    const canUse = canAdmin || canGestor || (session.access.areas || []).includes("INSTALACIONES");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const raw = await req.json();
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: "FORM_INVALIDO" }, { status: 400 });

    const data = parsed.data;
    if (canAdmin && !data.gestorUid) {
      return NextResponse.json({ ok: false, error: "GESTOR_REQUIRED" }, { status: 400 });
    }
    const gestorUid = canAdmin ? String(data.gestorUid || "").trim() : session.uid;
    const draftId = `${data.fecha}_${gestorUid}`;

    const db = adminDb();
    const ref = db.collection("asistencia_borradores").doc(draftId);
    const snap = await ref.get();
    const estadoActual = snap.exists ? String((snap.data() as any)?.estado || "ABIERTO") : "ABIERTO";
    if (estadoActual === "CERRADO") {
      return NextResponse.json({ ok: false, error: "BORRADOR_BLOQUEADO" }, { status: 400 });
    }
    if (estadoActual === "CONFIRMADO" && !canAdmin) {
      return NextResponse.json({ ok: false, error: "BORRADOR_BLOQUEADO" }, { status: 400 });
    }

    const batch = db.batch();
    batch.set(
      ref,
      {
        fecha: data.fecha,
        gestorUid,
        estado: estadoActual === "CONFIRMADO" ? "CONFIRMADO" : "ABIERTO",
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: session.uid,
      },
      { merge: true }
    );

    data.cuadrillas.forEach((c) => {
      const cRef = ref.collection("cuadrillas").doc(c.cuadrillaId);
      batch.set(
        cRef,
        {
          cuadrillaId: c.cuadrillaId,
          cuadrillaNombre: c.cuadrillaNombre || "",
          zonaId: c.zonaId || "",
          zonaNombre: c.zonaNombre || "",
          estadoAsistencia: c.estadoAsistencia,
          tecnicosIds: c.tecnicosIds || [],
          observacion: c.observacion || "",
          coordinadorUid: c.coordinadorUid || "",
          coordinadorNombre: c.coordinadorNombre || "",
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: session.uid,
        },
        { merge: true }
      );
    });

    await batch.commit();
    return NextResponse.json({ ok: true, draftId });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
