import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import {
  allocateOrderConsumption,
  buildInstallationConceptTotals,
  buildInstallationSnapshot,
  loadPendingInstallations,
  requestedConceptTotalsFromItems,
} from "@/core/gerencia/ordenCompraLedger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERM_GERENCIA_ORDEN_COMPRA = "GERENCIA_ORDEN_COMPRA";

type OcItem = {
  codigo: string;
  descripcion: string;
  cantidad: number;
  precio: number;
  total: number;
};

function hasGerenciaOcAccess(session: NonNullable<Awaited<ReturnType<typeof getServerSession>>>) {
  const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
  return session.isAdmin || (roles.includes("GERENCIA") && session.permissions.includes(PERM_GERENCIA_ORDEN_COMPRA));
}

function toSafeItems(items: unknown): OcItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => {
      const cantidad = Number((it as any)?.cantidad || 0);
      const precio = Number((it as any)?.precio || 0);
      return {
        codigo: String((it as any)?.codigo || "").trim(),
        descripcion: String((it as any)?.descripcion || "").trim(),
        cantidad: Number.isFinite(cantidad) ? cantidad : 0,
        precio: Number.isFinite(precio) ? precio : 0,
        total: 0,
      };
    })
    .filter((it) => it.codigo && it.descripcion && it.cantidad > 0)
    .map((it) => ({ ...it, total: Number((it.cantidad * it.precio).toFixed(2)) }));
}

function assertYmd(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function ymFromYmd(v: string) {
  return String(v || "").slice(0, 7);
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

    const body = (await req.json().catch(() => null)) as
      | {
          coordinadorUid?: string;
          coordinadorNombre?: string;
          razonSocial?: string;
          ruc?: string;
          periodo?: { desde?: string; hasta?: string };
          items?: unknown;
          observaciones?: string;
        }
      | null;

    const coordinadorUid = String(body?.coordinadorUid || "").trim();
    const coordinadorNombre = String(body?.coordinadorNombre || "").trim();
    const razonSocial = String(body?.razonSocial || "").trim();
    const ruc = String(body?.ruc || "").replace(/\D/g, "");
    const desde = String(body?.periodo?.desde || "").trim();
    const hasta = String(body?.periodo?.hasta || "").trim();
    const observaciones = String(body?.observaciones || "").trim();
    const items = toSafeItems(body?.items);

    if (!coordinadorUid) return NextResponse.json({ ok: false, error: "COORDINADOR_REQUIRED" }, { status: 400 });
    if (!razonSocial) return NextResponse.json({ ok: false, error: "RAZON_SOCIAL_REQUIRED" }, { status: 400 });
    if (!ruc || !/^\d{11}$/.test(ruc)) return NextResponse.json({ ok: false, error: "RUC_INVALID" }, { status: 400 });
    if (!assertYmd(desde) || !assertYmd(hasta) || desde > hasta) {
      return NextResponse.json({ ok: false, error: "RANGO_INVALID" }, { status: 400 });
    }
    if (!items.length) return NextResponse.json({ ok: false, error: "ITEMS_REQUIRED" }, { status: 400 });

    const subtotal = Number(items.reduce((acc, it) => acc + it.total, 0).toFixed(2));
    const igv = Number((subtotal * 0.18).toFixed(2));
    const total = Number((subtotal + igv).toFixed(2));
    const year = new Date().getFullYear();
    const periodoYm = ymFromYmd(desde);
    const periodoYear = Number(desde.slice(0, 4));
    const requestedConcepts = requestedConceptTotalsFromItems(items);
    const { pending, summary } = await loadPendingInstallations({ coordinadorUid, desde, hasta });
    if (requestedConcepts.residencial > summary.residencial) {
      return NextResponse.json({ ok: false, error: "RESIDENCIAL_PENDING_EXCEEDED" }, { status: 409 });
    }
    if (requestedConcepts.condominio > summary.condominio) {
      return NextResponse.json({ ok: false, error: "CONDOMINIO_PENDING_EXCEEDED" }, { status: 409 });
    }
    if (requestedConcepts.cat5e > summary.cat5e) {
      return NextResponse.json({ ok: false, error: "CAT5E_PENDING_EXCEEDED" }, { status: 409 });
    }
    if (requestedConcepts.cat6 > summary.cat6) {
      return NextResponse.json({ ok: false, error: "CAT6_PENDING_EXCEEDED" }, { status: 409 });
    }

    const allocationPlan = allocateOrderConsumption(pending, requestedConcepts);
    if (
      allocationPlan.remaining.residencial > 0 ||
      allocationPlan.remaining.condominio > 0 ||
      allocationPlan.remaining.cat5e > 0 ||
      allocationPlan.remaining.cat6 > 0
    ) {
      return NextResponse.json({ ok: false, error: "PENDING_ALLOCATION_CONFLICT" }, { status: 409 });
    }

    const db = adminDb();
    const sequenceRef = db.collection("sequences").doc(`OC_${year}`);

    let correlativo = 0;
    let codigo = "";
    await db.runTransaction(async (tx) => {
      const seqSnap = await tx.get(sequenceRef);
      const current = seqSnap.exists ? Number((seqSnap.data() as any)?.counter || 0) : 0;
      correlativo = current + 1;
      codigo = `OC-${year}-${String(correlativo).padStart(8, "0")}`;
      const orderRef = db.collection("ordenes_compra").doc(codigo);
      const existingOrderSnap = await tx.get(orderRef);
      if (existingOrderSnap.exists) {
        throw new Error("OC_CODE_COLLISION");
      }

      const installationRefs = allocationPlan.allocations.map((row) => db.collection("instalaciones").doc(row.instalacionId));
      const consumptionRefs = allocationPlan.allocations.map((row) => db.collection("ordenes_compra_consumo").doc(row.instalacionId));
      const docsToLoad = [...installationRefs, ...consumptionRefs];
      const loadedSnaps = docsToLoad.length ? await tx.getAll(...docsToLoad) : [];
      const installationSnaps = loadedSnaps.slice(0, installationRefs.length);
      const consumptionSnaps = loadedSnaps.slice(installationRefs.length);
      const installedById = new Map<string, any>();
      installationSnaps.forEach((snap) => {
        if (snap.exists) installedById.set(snap.id, snap.data() as any);
      });
      const consumedById = new Map<string, { residencial: number; condominio: number; cat5e: number; cat6: number }>();
      consumptionSnaps.forEach((snap) => {
        const data = (snap.exists ? snap.data() : null) as any;
        consumedById.set(snap.id, {
          residencial: Number(data?.consumos?.residencial || 0),
          condominio: Number(data?.consumos?.condominio || 0),
          cat5e: Number(data?.consumos?.cat5e || 0),
          cat6: Number(data?.consumos?.cat6 || 0),
        });
      });

      tx.set(
        sequenceRef,
        {
          counter: correlativo,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      tx.set(orderRef, {
        codigo,
        correlativo,
        year,
        coordinadorUid,
        coordinadorNombre,
        proveedor: {
          razonSocial,
          ruc,
        },
        periodo: { desde, hasta },
        periodoYm,
        periodoYear,
        items,
        totales: { subtotal, igv, total },
        observaciones,
        estado: "BORRADOR",
        pdf: { path: "", url: "", uploadedAt: null },
        audit: {
          createdAt: FieldValue.serverTimestamp(),
          createdBy: session.uid,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: session.uid,
        },
      });

      for (const allocation of allocationPlan.allocations) {
        const latest = installedById.get(allocation.instalacionId) || null;
        if (!latest) {
          throw new Error(`INSTALACION_NOT_FOUND:${allocation.instalacionId}`);
        }
        const raw = buildInstallationConceptTotals(latest);
        const consumed = consumedById.get(allocation.instalacionId) || {
          residencial: 0,
          condominio: 0,
          cat5e: 0,
          cat6: 0,
        };
        if (consumed.residencial + allocation.consumos.residencial > raw.residencial) {
          throw new Error("RESIDENCIAL_ALREADY_CONSUMED");
        }
        if (consumed.condominio + allocation.consumos.condominio > raw.condominio) {
          throw new Error("CONDOMINIO_ALREADY_CONSUMED");
        }
        if (consumed.cat5e + allocation.consumos.cat5e > raw.cat5e) {
          throw new Error("CAT5E_ALREADY_CONSUMED");
        }
        if (consumed.cat6 + allocation.consumos.cat6 > raw.cat6) {
          throw new Error("CAT6_ALREADY_CONSUMED");
        }

        const nextConsumed = {
          residencial: consumed.residencial + allocation.consumos.residencial,
          condominio: consumed.condominio + allocation.consumos.condominio,
          cat5e: consumed.cat5e + allocation.consumos.cat5e,
          cat6: consumed.cat6 + allocation.consumos.cat6,
        };
        const consumptionRef = db.collection("ordenes_compra_consumo").doc(allocation.instalacionId);
        const detailRef = db.collection("ordenes_compra_detalle").doc(`${codigo}__${allocation.instalacionId}`);
        tx.set(detailRef, {
          ordenCompraId: codigo,
          instalacionId: allocation.instalacionId,
          coordinadorUid,
          fechaInstalacion: allocation.fechaInstalacion,
          estado: "BORRADOR",
          consumos: allocation.consumos,
          snapshot: buildInstallationSnapshot(latest, coordinadorUid),
          audit: {
            createdAt: FieldValue.serverTimestamp(),
            createdBy: session.uid,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: session.uid,
          },
        });
        tx.set(
          consumptionRef,
          {
            instalacionId: allocation.instalacionId,
            coordinadorUid,
            fechaInstalacion: allocation.fechaInstalacion,
            consumos: nextConsumed,
            audit: {
              updatedAt: FieldValue.serverTimestamp(),
              updatedBy: session.uid,
            },
          },
          { merge: true }
        );
        consumedById.set(allocation.instalacionId, nextConsumed);
      }
    });

    return NextResponse.json({
      ok: true,
      ordenId: codigo,
      codigo,
      correlativo,
      totales: { subtotal, igv, total },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
