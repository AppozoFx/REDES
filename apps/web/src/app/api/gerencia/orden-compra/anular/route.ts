import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERM_GERENCIA_ORDEN_COMPRA = "GERENCIA_ORDEN_COMPRA";

function hasGerenciaOcAccess(session: NonNullable<Awaited<ReturnType<typeof getServerSession>>>) {
  const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
  return session.isAdmin || (roles.includes("GERENCIA") && session.permissions.includes(PERM_GERENCIA_ORDEN_COMPRA));
}

function toNum(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toStr(v: unknown) {
  return String(v || "").trim();
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    if (!hasGerenciaOcAccess(session)) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as { ordenId?: string; motivo?: string } | null;
    const ordenId = toStr(body?.ordenId);
    const motivo = toStr(body?.motivo);
    if (!ordenId) return NextResponse.json({ ok: false, error: "ORDEN_REQUIRED" }, { status: 400 });

    const db = adminDb();
    const ordenRef = db.collection("ordenes_compra").doc(ordenId);

    await db.runTransaction(async (tx) => {
      const ordenSnap = await tx.get(ordenRef);
      if (!ordenSnap.exists) throw new Error("ORDEN_NOT_FOUND");

      const orden = ordenSnap.data() as any;
      const estadoActual = toStr(orden?.estado).toUpperCase();
      if (estadoActual === "ANULADA") throw new Error("ORDEN_ALREADY_CANCELLED");
      if (estadoActual !== "BORRADOR" && estadoActual !== "GENERADA") {
        throw new Error("ORDEN_CANCEL_NOT_ALLOWED");
      }

      const detailSnap = await tx.get(
        db.collection("ordenes_compra_detalle").where("ordenCompraId", "==", ordenId).limit(10000)
      );

      const consumoRefs = detailSnap.docs.map((doc) => {
        const instalacionId = toStr(doc.data()?.instalacionId);
        return db.collection("ordenes_compra_consumo").doc(instalacionId);
      });
      const consumoSnaps = consumoRefs.length ? await tx.getAll(...consumoRefs) : [];
      const consumoById = new Map<string, any>();
      consumoSnaps.forEach((snap) => {
        consumoById.set(snap.id, snap.exists ? snap.data() : null);
      });

      for (const detailDoc of detailSnap.docs) {
        const detail = detailDoc.data() as any;
        const instalacionId = toStr(detail?.instalacionId);
        if (!instalacionId) continue;

        const current = consumoById.get(instalacionId) || {};
        const currentConsumos = {
          residencial: toNum(current?.consumos?.residencial),
          condominio: toNum(current?.consumos?.condominio),
          cat5e: toNum(current?.consumos?.cat5e),
          cat6: toNum(current?.consumos?.cat6),
        };
        const revert = {
          residencial: toNum(detail?.consumos?.residencial),
          condominio: toNum(detail?.consumos?.condominio),
          cat5e: toNum(detail?.consumos?.cat5e),
          cat6: toNum(detail?.consumos?.cat6),
        };
        const next = {
          residencial: currentConsumos.residencial - revert.residencial,
          condominio: currentConsumos.condominio - revert.condominio,
          cat5e: currentConsumos.cat5e - revert.cat5e,
          cat6: currentConsumos.cat6 - revert.cat6,
        };
        if (next.residencial < 0 || next.condominio < 0 || next.cat5e < 0 || next.cat6 < 0) {
          throw new Error("OC_CONSUMPTION_UNDERFLOW");
        }

        const consumoRef = db.collection("ordenes_compra_consumo").doc(instalacionId);
        tx.set(
          consumoRef,
          {
            instalacionId,
            coordinadorUid: toStr(detail?.coordinadorUid),
            fechaInstalacion: toStr(detail?.fechaInstalacion),
            consumos: next,
            audit: {
              updatedAt: FieldValue.serverTimestamp(),
              updatedBy: session.uid,
            },
          },
          { merge: true }
        );

        tx.set(
          detailDoc.ref,
          {
            estado: "ANULADA",
            anulacion: {
              at: FieldValue.serverTimestamp(),
              by: session.uid,
              reason: motivo,
            },
            audit: {
              updatedAt: FieldValue.serverTimestamp(),
              updatedBy: session.uid,
            },
          },
          { merge: true }
        );
      }

      tx.set(
        ordenRef,
        {
          estado: "ANULADA",
          anulacion: {
            at: FieldValue.serverTimestamp(),
            by: session.uid,
            reason: motivo,
          },
          audit: {
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: session.uid,
          },
        },
        { merge: true }
      );
    });

    return NextResponse.json({ ok: true, ordenId });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
