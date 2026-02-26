import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { metersToCm } from "@/domain/materiales/repo";
import { addGlobalNotification } from "@/domain/notificaciones/service";

export const runtime = "nodejs";

type EstadoDevolucion = "BUENO" | "MALO" | "NO_ENTREGA";

type DevolucionItem = {
  materialId: string;
  und?: number;
  metros?: number;
  estado: EstadoDevolucion;
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
      session.permissions.includes("MATERIALES_DEVOLUCION") ||
      session.permissions.includes("MATERIALES_TRANSFER_SERVICIO");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    const hasArea = session.isAdmin || (session.access.areas || []).includes("MANTENIMIENTO");
    if (!hasArea) return NextResponse.json({ ok: false, error: "AREA_FORBIDDEN" }, { status: 403 });

    const raw = (await req.json().catch(() => ({}))) as {
      tecnicoUid?: string;
      tecnicoNombre?: string;
      coordinadorUid?: string;
      coordinadorNombre?: string;
      cuadrillaId?: string;
      cuadrillaNombre?: string;
      observacion?: string;
      items?: DevolucionItem[];
    };
    const tecnicoUid = String(raw?.tecnicoUid || "").trim();
    if (!tecnicoUid) return NextResponse.json({ ok: false, error: "TECNICO_REQUIRED" }, { status: 400 });
    const items = Array.isArray(raw?.items) ? raw.items : [];
    if (!items.length) return NextResponse.json({ ok: false, error: "ITEMS_REQUIRED" }, { status: 400 });

    const db = adminDb();

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
      const estado = String(it.estado || "").toUpperCase();
      if (!["BUENO", "MALO", "NO_ENTREGA"].includes(estado)) {
        throw new Error(`ESTADO_INVALIDO ${materialId}`);
      }
      return {
        materialId,
        nombre: String(mat?.nombre || materialId),
        unidadTipo: unidadTipo as "UND" | "METROS",
        und,
        metros,
        estado: estado as EstadoDevolucion,
        observacion: String(it.observacion || "").trim(),
      };
    });

    await db.runTransaction(async (tx) => {
      for (const it of parsed) {
        const almRef = db.collection("almacen_stock").doc(it.materialId);
        const tecRef = db.collection("usuarios").doc(tecnicoUid).collection("stock_materiales_mant").doc(it.materialId);
        const activoRef = db.collection("usuarios").doc(tecnicoUid).collection("activos_asignados_mant").doc(it.materialId);
        const [tecSnap] = await Promise.all([tx.get(tecRef)]);
        if (!tecSnap.exists) throw new Error(`STOCK_TECNICO_NOT_FOUND ${it.materialId}`);
        const tec = tecSnap.data() as any;

        if (it.unidadTipo === "UND") {
          const stockUnd = Number(tec?.stockUnd || 0);
          if (stockUnd - it.und < 0) throw new Error(`STOCK_INSUFICIENTE_TECNICO ${it.materialId}`);
          tx.update(tecRef, { stockUnd: FieldValue.increment(-it.und), updatedAt: FieldValue.serverTimestamp() });
          tx.set(activoRef, { pendienteUnd: FieldValue.increment(-it.und), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          if (it.estado === "BUENO") {
            tx.set(almRef, { materialId: it.materialId, unidadTipo: "UND", stockUnd: FieldValue.increment(it.und), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          }
        } else {
          const deltaCm = metersToCm(it.metros);
          const stockCm = Number(tec?.stockCm || 0);
          if (stockCm - deltaCm < 0) throw new Error(`STOCK_INSUFICIENTE_TECNICO ${it.materialId}`);
          tx.update(tecRef, { stockCm: FieldValue.increment(-deltaCm), updatedAt: FieldValue.serverTimestamp() });
          tx.set(activoRef, { pendienteCm: FieldValue.increment(-deltaCm), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          if (it.estado === "BUENO") {
            tx.set(almRef, { materialId: it.materialId, unidadTipo: "METROS", stockCm: FieldValue.increment(deltaCm), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          }
        }
      }
    });

    const movRef = db.collection("movimientos_inventario").doc();
    const guia = await nextGuia("MMTECDEV");
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
      und: it.und,
      metros: it.metros,
      estadoDevolucion: it.estado,
      observacion: it.observacion,
      status: "OK",
    }));

    await movRef.set({
      area: "MANTENIMIENTO",
      tipo: "DEVOLUCION_TECNICO",
      guia,
      origen: { type: "TECNICO", id: tecnicoUid },
      destino: { type: "ALMACEN", id: "ALMACEN" },
      tecnicoUid,
      tecnicoNombre: String(raw?.tecnicoNombre || tecnicoUid),
      coordinadorUid: String(raw?.coordinadorUid || ""),
      coordinadorNombre: String(raw?.coordinadorNombre || ""),
      cuadrillaId: String(raw?.cuadrillaId || ""),
      cuadrillaNombre: String(raw?.cuadrillaNombre || ""),
      itemsMateriales: payloadItems,
      observacion: String(raw?.observacion || ""),
      createdAt: FieldValue.serverTimestamp(),
      createdBy: session.uid,
      createdByName: actorNombre,
      ymd,
    });

    const histRef = db.collection("usuarios").doc(tecnicoUid).collection("materiales_historial_mant").doc();
    await histRef.set({
      movId: movRef.id,
      tipo: "DEVOLUCION",
      guia,
      tecnicoUid,
      tecnicoNombre: String(raw?.tecnicoNombre || tecnicoUid),
      items: payloadItems,
      observacion: String(raw?.observacion || ""),
      createdAt: FieldValue.serverTimestamp(),
      createdBy: session.uid,
      createdByName: actorNombre,
      ymd,
    });

    try {
      await addGlobalNotification({
        title: "Devolucion de Tecnico",
        message: `${actorNombre} registro devolucion de ${payloadItems.length} material(es) del tecnico ${String(raw?.tecnicoNombre || tecnicoUid)}`,
        type: "success",
        scope: "ALL",
        createdBy: session.uid,
        entityType: "DEVOLUCION_TECNICO",
        entityId: movRef.id,
        action: "CREATE",
        estado: "ACTIVO",
      });
    } catch {}

    return NextResponse.json({ ok: true, movId: movRef.id, guia, actorNombre });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}

