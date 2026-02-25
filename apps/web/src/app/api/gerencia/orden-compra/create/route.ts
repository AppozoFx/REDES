import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";

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

    const db = adminDb();
    const orderRef = db.collection("ordenes_compra").doc();
    const sequenceRef = db.collection("sequences").doc(`OC_${year}`);

    let correlativo = 0;
    await db.runTransaction(async (tx) => {
      const seqSnap = await tx.get(sequenceRef);
      const current = seqSnap.exists ? Number((seqSnap.data() as any)?.counter || 0) : 0;
      correlativo = current + 1;
      tx.set(
        sequenceRef,
        {
          counter: correlativo,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      const codigo = `OC-${year}-${String(correlativo).padStart(8, "0")}`;
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
    });

    const codigo = `OC-${year}-${String(correlativo).padStart(8, "0")}`;
    return NextResponse.json({
      ok: true,
      ordenId: orderRef.id,
      codigo,
      correlativo,
      totales: { subtotal, igv, total },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
