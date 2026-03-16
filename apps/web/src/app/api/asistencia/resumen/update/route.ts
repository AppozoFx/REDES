import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

const BodySchema = z.object({
  target: z.enum(["cuadrillas", "tecnicos"]),
  fecha: z.string().min(1),
  cuadrillaId: z.string().optional(),
  tecnicoId: z.string().optional(),
  patch: z.object({
    estadoAsistencia: z.string().optional(),
    observacion: z.string().optional(),
  }),
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }

    const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
    const canAdmin = session.isAdmin || roles.includes("GERENCIA") || roles.includes("ALMACEN") || roles.includes("RRHH") || roles.includes("SUPERVISOR") || roles.includes("SEGURIDAD");
    if (!canAdmin) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const raw = await req.json();
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: "FORM_INVALIDO" }, { status: 400 });

    const { target, fecha, cuadrillaId, tecnicoId, patch } = parsed.data;

    if (target === "cuadrillas" && !cuadrillaId) {
      return NextResponse.json({ ok: false, error: "CUADRILLA_REQUIRED" }, { status: 400 });
    }
    if (target === "tecnicos" && !tecnicoId) {
      return NextResponse.json({ ok: false, error: "TECNICO_REQUIRED" }, { status: 400 });
    }

    const db = adminDb();
    if (target === "cuadrillas") {
      const id = `${fecha}_${cuadrillaId}`;
      const ref = db.collection("asistencia_cuadrillas").doc(id);
      const update: Record<string, any> = {
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: session.uid,
      };
      if (patch.estadoAsistencia !== undefined) update.estadoAsistencia = patch.estadoAsistencia;
      if (patch.observacion !== undefined) update.observacion = patch.observacion;
      await ref.set(update, { merge: true });
      return NextResponse.json({ ok: true });
    }

    const id = `${fecha}_${tecnicoId}`;
    const ref = db.collection("asistencia_tecnicos").doc(id);
    const update: Record<string, any> = {
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: session.uid,
    };
    if (patch.estadoAsistencia !== undefined) update.estadoAsistencia = patch.estadoAsistencia;
    await ref.set(update, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
