import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

const BodySchema = z.object({
  fecha: z.string().min(1),
  gestorUid: z.string().optional(),
  forzar: z.boolean().optional(),
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

    const raw = await req.json();
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: "FORM_INVALIDO" }, { status: 400 });

    const { fecha, gestorUid, forzar } = parsed.data;
    let q: FirebaseFirestore.Query = adminDb()
      .collection("asistencia_borradores")
      .where("fecha", "==", fecha);
    if (gestorUid) q = q.where("gestorUid", "==", gestorUid);

    const snap = await q.get();
    if (snap.empty) return NextResponse.json({ ok: false, error: "SIN_BORRADORES" }, { status: 404 });

    const db = adminDb();
    const now = FieldValue.serverTimestamp();
    const batches: FirebaseFirestore.WriteBatch[] = [];
    let batch = db.batch();
    let ops = 0;
    let hasOps = false;

    const pushBatch = () => {
      batches.push(batch);
      batch = db.batch();
      ops = 0;
    };

    for (const docSnap of snap.docs) {
      const data = docSnap.data() as any;
      const estado = String(data?.estado || "ABIERTO");
      if (estado === "CERRADO") continue;
      if (estado !== "CONFIRMADO" && !forzar) continue;

      const cuadSnap = await docSnap.ref.collection("cuadrillas").get();
      for (const c of cuadSnap.docs) {
        const it = c.data() as any;
        const cuadrillaId = String(it.cuadrillaId || c.id);
        const rowId = `${fecha}_${cuadrillaId}`;
        const rowRef = db.collection("asistencia_cuadrillas").doc(rowId);
        batch.set(
          rowRef,
          {
            fecha,
            cuadrillaId,
            cuadrillaNombre: it.cuadrillaNombre || "",
            gestorUid: data?.gestorUid || "",
            gestorNombre: data?.gestorNombre || "",
            coordinadorUid: it.coordinadorUid || "",
            coordinadorNombre: it.coordinadorNombre || "",
            zonaId: it.zonaId || "",
            zonaNombre: it.zonaNombre || "",
            estadoAsistencia: it.estadoAsistencia || "asistencia",
            tecnicosIds: it.tecnicosIds || [],
            observacion: it.observacion || "",
            confirmadoAt: data?.confirmadoAt || null,
            confirmadoBy: data?.confirmadoBy || "",
            cerradoAt: now,
            cerradoBy: session.uid,
          },
          { merge: true }
        );
        ops++;
        hasOps = true;
        if (ops >= 450) pushBatch();

        const tecnicos = Array.isArray(it.tecnicosIds) ? it.tecnicosIds : [];
        for (const tId of tecnicos) {
          const tRef = db.collection("asistencia_tecnicos").doc(`${fecha}_${tId}`);
          batch.set(
            tRef,
            {
              fecha,
              tecnicoId: tId,
              cuadrillaId,
              estadoAsistencia: it.estadoAsistencia || "asistencia",
              confirmadoAt: data?.confirmadoAt || null,
              confirmadoBy: data?.confirmadoBy || "",
              cerradoAt: now,
              cerradoBy: session.uid,
            },
            { merge: true }
          );
          ops++;
          hasOps = true;
          if (ops >= 450) pushBatch();
        }
      }

      batch.set(
        docSnap.ref,
        {
          estado: "CERRADO",
          cerradoAt: now,
          cerradoBy: session.uid,
        },
        { merge: true }
      );
      ops++;
      hasOps = true;
      if (ops >= 450) pushBatch();
    }

    if (hasOps) batches.push(batch);
    for (const b of batches) {
      await b.commit();
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
