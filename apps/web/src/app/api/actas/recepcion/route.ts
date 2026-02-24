import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";
import { addGlobalNotification } from "@/domain/notificaciones/service";
import { toDatePartsLima } from "@/domain/equipos/repo";

export const runtime = "nodejs";

const BodySchema = z.object({
  coordinadorUid: z.string().min(1),
  cuadrillaId: z.string().optional(),
  actas: z.array(z.string().min(1)).min(1),
});

function shortName(name: string) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  const first = parts[0];
  const firstLast = parts.length >= 4 ? parts[2] || "" : parts[1] || "";
  return `${first} ${firstLast}`.trim() || first;
}

async function nextGuia(prefix: string): Promise<string> {
  const db = adminDb();
  const year = new Date().getFullYear();
  const seqRef = db.collection("sequences").doc(`${prefix}_${year}`);
  const n = await db.runTransaction(async (tx) => {
    const snap = await tx.get(seqRef);
    const curr = snap.exists ? (snap.data() as any)?.counter || 0 : 0;
    const next = curr + 1;
    tx.set(seqRef, { counter: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return next as number;
  });
  return `${prefix}-${year}-${String(n).padStart(6, "0")}`;
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
      (session.access.areas || []).includes("INSTALACIONES") ||
      session.permissions.includes("CUADRILLAS_MANAGE");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const raw = await req.json();
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false, error: "FORM_INVALIDO" }, { status: 400 });

    const { coordinadorUid, cuadrillaId, actas } = parsed.data;
    const normalizeActa = (raw: string) => {
      const digits = String(raw || "").replace(/\D/g, "");
      if (!digits) return "";
      if (digits.length <= 3) return digits;
      return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    };
    const codes = Array.from(new Set(actas.map((a) => normalizeActa(a)).filter(Boolean)));
    if (!codes.length) return NextResponse.json({ ok: false, error: "SIN_ACTAS" }, { status: 400 });

    const db = adminDb();
    const coordSnap = await db.collection("usuarios").doc(coordinadorUid).get();
    const coordData = coordSnap.exists ? (coordSnap.data() as any) : {};
    const coordNombre = shortName(
      `${String(coordData?.nombres || "").trim()} ${String(coordData?.apellidos || "").trim()}`.trim() ||
        coordinadorUid
    );

    let cuadrillaNombre = "";
    let tecnicosUids: string[] = [];
    if (cuadrillaId) {
      const cuadSnap = await db.collection("cuadrillas").doc(cuadrillaId).get();
      if (!cuadSnap.exists) return NextResponse.json({ ok: false, error: "CUADRILLA_NOT_FOUND" }, { status: 404 });
      const cuad = cuadSnap.data() as any;
      const cuadCoord = String(cuad?.coordinadorUid || "");
      if (cuadCoord && cuadCoord !== coordinadorUid) {
        return NextResponse.json({ ok: false, error: "CUADRILLA_NO_PERTENECE_COORDINADOR" }, { status: 400 });
      }
      cuadrillaNombre = String(cuad?.nombre || cuadrillaId);
      tecnicosUids = Array.isArray(cuad?.tecnicosUids) ? cuad.tecnicosUids : [];
    }

    const guiaId = await nextGuia("ACTA");
    const now = new Date();
    const parts = toDatePartsLima(now);

    const actorSnap = await db.collection("usuarios").doc(session.uid).get();
    const actorData = actorSnap.exists ? (actorSnap.data() as any) : {};
    const actorNombre = shortName(
      `${String(actorData?.nombres || "").trim()} ${String(actorData?.apellidos || "").trim()}`.trim() ||
        session.uid
    );

    await db.runTransaction(async (tx) => {
      const actaRefs = codes.map((c) => db.collection("actas").doc(c));
      const actaSnaps = await db.getAll(...actaRefs);
      const exists = actaSnaps.find((s) => s.exists);
      if (exists) throw new Error(`ACTA_YA_REGISTRADA:${exists.id}`);

      const guiaRef = db.collection("actas_guias").doc(guiaId);
      tx.set(
        guiaRef,
        {
          guiaId,
          coordinadorUid,
          coordinadorNombre: coordNombre,
          cuadrillaId: cuadrillaId || "",
          cuadrillaNombre,
          actas: codes,
          totalActas: codes.length,
          recibidoAt: parts.at || FieldValue.serverTimestamp(),
          recibidoYmd: parts.ymd || null,
          recibidoHm: parts.hm || null,
          recibidoBy: session.uid,
          recibidoByNombre: actorNombre,
          estado: "RECEPCIONADO",
          pdfUrl: "",
        },
        { merge: true }
      );

      for (const code of codes) {
        const ref = db.collection("actas").doc(code);
        tx.set(
          ref,
          {
            codigoActa: code,
            guiaId,
            coordinadorUid,
            coordinadorNombre: coordNombre,
            cuadrillaId: cuadrillaId || "",
            cuadrillaNombre,
            entregadoPorTipo: cuadrillaId ? "CUADRILLA" : "COORDINADOR",
            entregadoPorId: cuadrillaId ? cuadrillaId : coordinadorUid,
            entregadoPorNombre: cuadrillaId ? cuadrillaNombre : coordNombre,
            recibidoAt: parts.at || FieldValue.serverTimestamp(),
            recibidoYmd: parts.ymd || null,
            recibidoHm: parts.hm || null,
            recibidoBy: session.uid,
            recibidoByNombre: actorNombre,
            estado: "RECEPCIONADO",
          },
          { merge: true }
        );
      }
    });

    const extraCuad = cuadrillaNombre ? ` Cuadrilla: ${cuadrillaNombre}.` : "";
    await addGlobalNotification({
      title: "Recepción de Actas",
      message: `Guía ${guiaId} registrada por ${actorNombre}. Coordinador: ${coordNombre}.${extraCuad} Total: ${codes.length} acta(s).`,
      type: "success",
      scope: "ALL",
      createdBy: session.uid,
      entityType: "ACTAS_RECEPCION",
      entityId: guiaId,
      action: "CREATE",
      estado: "ACTIVO",
    });

    return NextResponse.json({
      ok: true,
      guiaId,
      coordinadorUid,
      coordinadorNombre: coordNombre,
      cuadrillaId: cuadrillaId || "",
      cuadrillaNombre,
      actas: codes,
      totalActas: codes.length,
      recibidoAt: parts.at ? parts.at.toDate().toISOString() : now.toISOString(),
      recibidoYmd: parts.ymd || null,
      recibidoHm: parts.hm || null,
      recibidoByNombre: actorNombre,
      tecnicosUids,
    });
  } catch (e: any) {
    const msg = String(e?.message || "ERROR");
    if (msg.startsWith("ACTA_YA_REGISTRADA:")) {
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
