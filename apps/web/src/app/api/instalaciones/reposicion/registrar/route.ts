import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { metersToCm } from "@/domain/materiales/repo";
import { addGlobalNotification } from "@/domain/notificaciones/service";

export const runtime = "nodejs";

type ReposicionItem = {
  materialId: string;
  und?: number;
  metros?: number;
  observacion?: string;
};

function normUnd(v: any) {
  const n = Math.floor(Number(v || 0));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function normMetros(v: any) {
  const n = Number(v || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function nextGuia(prefix: string): Promise<string> {
  const db = adminDb();
  const year = new Date().getFullYear();
  const seqRef = db.collection("sequences").doc(`${prefix}_${year}`);
  const n = await db.runTransaction(async (tx) => {
    const snap = await tx.get(seqRef);
    const curr = snap.exists ? Number((snap.data() as any)?.counter || 0) : 0;
    const next = curr + 1;
    tx.set(seqRef, { counter: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return next;
  });
  return `${prefix}-${year}-${String(n).padStart(6, "0")}`;
}

async function getActorShortName(uid: string) {
  try {
    const snap = await adminDb().collection("usuarios").doc(uid).get();
    if (!snap.exists) return uid;
    const data = snap.data() as any;
    const nombres = String(data?.nombres || "").trim();
    const apellidos = String(data?.apellidos || "").trim();
    const displayName = String(data?.displayName || "").trim();
    const nombre1 = nombres.split(/\s+/).filter(Boolean)[0] || "";
    const apellido1 = apellidos.split(/\s+/).filter(Boolean)[0] || "";
    const exacto = `${nombre1} ${apellido1}`.trim();
    if (exacto) return exacto;
    const parts = displayName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0]} ${parts[1]}`;
    if (parts.length === 1) return parts[0];
    return uid;
  } catch {
    return uid;
  }
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
      session.permissions.includes("MATERIALES_TRANSFER_SERVICIO") ||
      session.permissions.includes("MATERIALES_DEVOLUCION");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const raw = (await req.json().catch(() => ({}))) as {
      coordinadorUid?: string;
      coordinadorNombre?: string;
      cuadrillaId?: string;
      cuadrillaNombre?: string;
      observacion?: string;
      items?: ReposicionItem[];
    };
    const cuadrillaId = String(raw?.cuadrillaId || "").trim();
    if (!cuadrillaId) return NextResponse.json({ ok: false, error: "CUADRILLA_REQUIRED" }, { status: 400 });
    const items = Array.isArray(raw?.items) ? raw.items : [];
    if (!items.length) return NextResponse.json({ ok: false, error: "ITEMS_REQUIRED" }, { status: 400 });

    const db = adminDb();
    const cSnap = await db.collection("cuadrillas").doc(cuadrillaId).get();
    if (!cSnap.exists) return NextResponse.json({ ok: false, error: "CUADRILLA_NOT_FOUND" }, { status: 404 });
    const cData = cSnap.data() as any;
    const cuadrillaNombre = String(raw?.cuadrillaNombre || cData?.nombre || cuadrillaId);
    const coordinadorUid = String(raw?.coordinadorUid || cData?.coordinadorUid || cData?.coordinador || "");
    const coordinadorNombre = String(raw?.coordinadorNombre || "");

    const materialIds = Array.from(new Set(items.map((i) => String(i.materialId || "").trim()).filter(Boolean)));
    const matRefs = materialIds.map((id) => db.collection("materiales").doc(id));
    const matSnaps = materialIds.length ? await db.getAll(...matRefs) : [];
    const matById = new Map(matSnaps.map((s: any) => [s.id, s] as const));

    const parsed = items.map((it) => {
      const materialId = String(it.materialId || "").trim();
      const mSnap = matById.get(materialId);
      if (!mSnap?.exists) throw new Error(`MATERIAL_NOT_FOUND ${materialId}`);
      const mat = mSnap.data() as any;
      const unidadTipo = String(mat?.unidadTipo || "").toUpperCase() === "METROS" ? "METROS" : "UND";
      const und = unidadTipo === "UND" ? normUnd(it.und) : 0;
      const metros = unidadTipo === "METROS" ? normMetros(it.metros) : 0;
      if (unidadTipo === "UND" && und <= 0) throw new Error(`UND_INVALIDA ${materialId}`);
      if (unidadTipo === "METROS" && metros <= 0) throw new Error(`METROS_INVALIDOS ${materialId}`);
      return {
        materialId,
        nombre: String(mat?.nombre || materialId),
        unidadTipo: unidadTipo as "UND" | "METROS",
        und,
        metros,
        observacion: String(it.observacion || "").trim(),
      };
    });

    await db.runTransaction(async (tx) => {
      for (const it of parsed) {
        const almRef = db.collection("almacen_stock").doc(it.materialId);
        const cuadRef = db.collection("cuadrillas").doc(cuadrillaId).collection("stock").doc(it.materialId);
        const [almSnap, cuadSnap] = await Promise.all([tx.get(almRef), tx.get(cuadRef)]);
        if (!almSnap.exists) throw new Error(`STOCK_NOT_FOUND ${it.materialId}`);
        if (!cuadSnap.exists) throw new Error(`STOCK_CUADRILLA_INSUFICIENTE ${it.materialId}`);

        const alm = almSnap.data() as any;
        const cuad = cuadSnap.data() as any;
        if (it.unidadTipo === "UND") {
          const stockAlmUnd = Number(alm?.stockUnd || 0);
          if (stockAlmUnd - it.und < 0) throw new Error(`STOCK_INSUFICIENTE_ALMACEN ${it.materialId}`);
          const stockCuadUnd = Number(cuad?.stockUnd || 0);
          if (stockCuadUnd - it.und < 0) throw new Error(`STOCK_CUADRILLA_INSUFICIENTE ${it.materialId}`);
          tx.update(almRef, { stockUnd: FieldValue.increment(-it.und), updatedAt: FieldValue.serverTimestamp() });
        } else {
          const deltaCm = metersToCm(it.metros);
          const stockAlmCm = Number(alm?.stockCm || 0);
          if (stockAlmCm - deltaCm < 0) throw new Error(`STOCK_INSUFICIENTE_ALMACEN ${it.materialId}`);
          const stockCuadCm = Number(cuad?.stockCm || 0);
          if (stockCuadCm - deltaCm < 0) throw new Error(`STOCK_CUADRILLA_INSUFICIENTE ${it.materialId}`);
          tx.update(almRef, { stockCm: FieldValue.increment(-deltaCm), updatedAt: FieldValue.serverTimestamp() });
        }
      }
    });

    const movRef = db.collection("movimientos_inventario").doc();
    const guia = await nextGuia("REPTEC");
    const actorNombre = await getActorShortName(session.uid);
    const createdAt = new Date();
    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Lima",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(createdAt);

    const payloadItems = parsed.map((it) => ({
      materialId: it.materialId,
      nombre: it.nombre,
      unidadTipo: it.unidadTipo,
      undEntregada: it.und,
      metrosEntregados: it.metros,
      undRecibidaMalograda: it.und,
      metrosRecibidosMalogrados: it.metros,
      estadoRecibido: "MALOGRADO",
      observacion: it.observacion,
      status: "OK",
    }));

    await movRef.set({
      area: "INSTALACIONES",
      tipo: "REPOSICION_CUADRILLA",
      guia,
      origen: { type: "ALMACEN", id: "ALMACEN" },
      destino: { type: "CUADRILLA", id: cuadrillaId },
      coordinadorUid,
      coordinadorNombre,
      cuadrillaId,
      cuadrillaNombre,
      itemsMateriales: payloadItems,
      observacion: String(raw?.observacion || ""),
      createdAt: FieldValue.serverTimestamp(),
      createdBy: session.uid,
      createdByName: actorNombre,
      ymd,
    });

    const histRef = db.collection("cuadrillas").doc(cuadrillaId).collection("reposicion_historial").doc();
    await histRef.set({
      movId: movRef.id,
      guia,
      tipo: "REPOSICION",
      cuadrillaId,
      cuadrillaNombre,
      coordinadorUid,
      coordinadorNombre,
      items: payloadItems,
      observacion: String(raw?.observacion || ""),
      createdAt: FieldValue.serverTimestamp(),
      createdBy: session.uid,
      createdByName: actorNombre,
      ymd,
    });

    try {
      await addGlobalNotification({
        title: "Reposicion a Cuadrilla",
        message: `${actorNombre} realizo reposicion de ${payloadItems.length} material(es) a la cuadrilla ${cuadrillaNombre}`,
        type: "success",
        scope: "ALL",
        createdBy: session.uid,
        entityType: "REPOSICION_CUADRILLA",
        entityId: movRef.id,
        action: "CREATE",
        estado: "ACTIVO",
      });
    } catch {}

    return NextResponse.json({
      ok: true,
      movId: movRef.id,
      guia,
      actorNombre,
      cuadrillaId,
      cuadrillaNombre,
      coordinadorUid,
      coordinadorNombre,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
