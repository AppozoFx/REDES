import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { normalizeUbicacion } from "@/domain/equipos/repo";
import { addGlobalNotification } from "@/domain/notificaciones/service";
import { KIT_BASE_POR_ONT } from "./service";

const PRECON_IDS = ["PRECON_50", "PRECON_100", "PRECON_150", "PRECON_200"] as const;

async function getUsuarioDisplayName(uid: string) {
  const snap = await adminDb().collection("usuarios").doc(uid).get();
  if (!snap.exists) return uid;
  const data = snap.data() as any;
  const nombres = String(data?.nombres || "").trim();
  const apellidos = String(data?.apellidos || "").trim();
  const parts = `${nombres} ${apellidos}`.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return uid;
  const first = parts[0];
  const firstLast = parts.length >= 4 ? parts[2] || "" : parts[1] || "";
  return `${first} ${firstLast}`.trim() || first;
}

function updateEquiposStockTx(
  tx: FirebaseFirestore.Transaction,
  opts: { cuadrillaId: string; tipo: string; delta: number }
) {
  const db = adminDb();
  const tipo = String(opts.tipo || "UNKNOWN").toUpperCase();
  const ref = db.collection("cuadrillas").doc(opts.cuadrillaId).collection("equipos_stock").doc(tipo);
  tx.set(
    ref,
    {
      tipo,
      cantidad: FieldValue.increment(opts.delta),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function getCuadrillaPreconStock(cuadrillaId: string) {
  const cleanId = String(cuadrillaId || "").trim();
  if (!cleanId) throw new Error("CUADRILLA_REQUIRED");
  const db = adminDb();
  const stock: Record<string, number> = {
    PRECON_50: 0,
    PRECON_100: 0,
    PRECON_150: 0,
    PRECON_200: 0,
  };
  for (const id of PRECON_IDS) {
    const snap = await db.collection("cuadrillas").doc(cleanId).collection("stock").doc(id).get();
    stock[id] = Number((snap.data() as any)?.stockUnd || 0);
  }
  return stock;
}

export async function moveEquipoBetweenCuadrillas(input: {
  sn: string;
  toUbicacion: string;
  fromCuadrillaId?: string;
  toCuadrillaId?: string;
  preconMaterialId?: string;
  caso?: string;
  observacion?: string;
  pri_tec?: string;
  tec_liq?: string;
  inv?: string;
  actorUid: string;
}) {
  const db = adminDb();
  const sn = String(input.sn || "").trim().toUpperCase();
  if (!sn) throw new Error("SN_REQUIRED");

  const ref = db.collection("equipos").doc(sn);
  let prevUb = "";
  let nextUb = "";
  let nextEstado = "";
  let tipoEq = "UNKNOWN";
  let descripcion = "";

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("EQUIPO_NOT_FOUND");
    const e = snap.data() as any;

    prevUb = normalizeUbicacion(String(e.ubicacion || "")).ubicacion;
    const nextNorm = normalizeUbicacion(String(input.toUbicacion || ""));
    nextUb = nextNorm.ubicacion;
    nextEstado = nextNorm.isCuadrilla ? "CAMPO" : nextNorm.ubicacion === "ALMACEN" ? "ALMACEN" : nextNorm.estado;
    tipoEq = String(e.equipo || "UNKNOWN").toUpperCase();
    descripcion = String(e.descripcion || "");

    const fromCuadrillaId = String(input.fromCuadrillaId || "").trim();
    const toCuadrillaId = String(input.toCuadrillaId || "").trim();
    const preconMaterialId = String(input.preconMaterialId || "").trim().toUpperCase();
    const isCuadrillaMove = prevUb !== nextUb && !!fromCuadrillaId && !!toCuadrillaId && fromCuadrillaId !== toCuadrillaId;
    const shouldMoveOntKit = isCuadrillaMove && tipoEq === "ONT";
    const materialMoves = new Map<string, number>();

    if (shouldMoveOntKit) {
      for (const [materialId, qty] of Object.entries(KIT_BASE_POR_ONT)) {
        materialMoves.set(materialId, Number(qty || 0));
      }
      if (preconMaterialId) {
        if (!PRECON_IDS.includes(preconMaterialId as any)) throw new Error("PRECON_INVALIDO");
        materialMoves.set(preconMaterialId, (materialMoves.get(preconMaterialId) || 0) + 1);
      }

      const fromRefs: FirebaseFirestore.DocumentReference[] = [];
      const fromMeta: Array<{ materialId: string; qty: number }> = [];
      for (const [materialId, qty] of materialMoves.entries()) {
        if (!qty) continue;
        fromRefs.push(db.collection("cuadrillas").doc(fromCuadrillaId).collection("stock").doc(materialId));
        fromMeta.push({ materialId, qty });
      }

      if (fromRefs.length) {
        const fromSnaps = await tx.getAll(...fromRefs);
        fromSnaps.forEach((s, idx) => {
          const { materialId, qty } = fromMeta[idx];
          const fromData = (s.data() || {}) as any;
          const fromUnd = Number(fromData.stockUnd || 0);
          if (fromUnd < qty) throw new Error(`STOCK_CUADRILLA_INSUFICIENTE:${materialId}`);
        });
      }
    }

    const cambios: any = {
      audit: { ...(e.audit || {}), updatedAt: FieldValue.serverTimestamp(), updatedBy: input.actorUid },
    };
    if (prevUb !== nextUb) {
      cambios.ubicacion = nextUb;
      cambios.estado = nextEstado;
    }
    if (typeof input.caso === "string") cambios.caso = input.caso;
    if (typeof input.observacion === "string") cambios.observacion = input.observacion;
    if (typeof input.pri_tec === "string") cambios.pri_tec = input.pri_tec;
    if (typeof input.tec_liq === "string") cambios.tec_liq = input.tec_liq;
    if (typeof input.inv === "string") cambios.inv = input.inv;
    tx.update(ref, cambios);

    if (prevUb !== nextUb && input.fromCuadrillaId) {
      updateEquiposStockTx(tx, { cuadrillaId: input.fromCuadrillaId, tipo: tipoEq, delta: -1 });
      const seriesRef = db.collection("cuadrillas").doc(input.fromCuadrillaId).collection("equipos_series").doc(sn);
      tx.delete(seriesRef);
    }
    if (prevUb !== nextUb && input.toCuadrillaId) {
      updateEquiposStockTx(tx, { cuadrillaId: input.toCuadrillaId, tipo: tipoEq, delta: 1 });
      const seriesRef = db.collection("cuadrillas").doc(input.toCuadrillaId).collection("equipos_series").doc(sn);
      tx.set(
        seriesRef,
        {
          SN: sn,
          equipo: tipoEq,
          descripcion,
          ubicacion: nextUb,
          estado: nextEstado,
          guia_despacho: String((e as any)?.guia_despacho || ""),
          f_despachoAt: (e as any)?.f_despachoAt || null,
          f_despachoYmd: (e as any)?.f_despachoYmd || null,
          f_despachoHm: (e as any)?.f_despachoHm || null,
          tecnicos: Array.isArray((e as any)?.tecnicos) ? (e as any).tecnicos : [],
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    if (shouldMoveOntKit) {
      for (const [materialId, qty] of materialMoves.entries()) {
        if (!qty) continue;
        const fromRef = db.collection("cuadrillas").doc(fromCuadrillaId).collection("stock").doc(materialId);
        const toRef = db.collection("cuadrillas").doc(toCuadrillaId).collection("stock").doc(materialId);
        tx.set(
          fromRef,
          {
            materialId,
            unidadTipo: "UND",
            stockUnd: FieldValue.increment(-qty),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        tx.set(
          toRef,
          {
            materialId,
            unidadTipo: "UND",
            stockUnd: FieldValue.increment(qty),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    }
  });

  try {
    const usuario = await getUsuarioDisplayName(input.actorUid);
    if (prevUb !== nextUb) {
      const msg = `${usuario} movió ${tipoEq} (SN: ${sn}) de "${prevUb}" a "${nextUb}"`;
      await addGlobalNotification({
        title: "Movimiento de Equipo",
        message: msg,
        type: "info",
        scope: "ALL",
        createdBy: input.actorUid,
        entityType: "EQUIPO_MOVE",
        entityId: sn,
        action: "UPDATE",
        estado: "ACTIVO",
      });
    }
  } catch {}

  return { ok: true, sn, ubicacion: nextUb, estado: nextEstado };
}

export async function moveEquipoFromPersonalToCuadrilla(input: {
  sn: string;
  fromUid: string;
  toCuadrillaId: string;
  toUbicacion: string;
  actorUid: string;
}) {
  const db = adminDb();
  const sn = String(input.sn || "").trim().toUpperCase();
  const fromUid = String(input.fromUid || "").trim();
  const toCuadrillaId = String(input.toCuadrillaId || "").trim();
  const toUbicacion = String(input.toUbicacion || "").trim();
  if (!sn || !fromUid || !toCuadrillaId) throw new Error("PARAMS_REQUIRED");

  let tipoEq = "UNKNOWN";
  let nextUb = toUbicacion;

  await db.runTransaction(async (tx) => {
    const eqRef = db.collection("equipos").doc(sn);
    const personalSeriesRef = db
      .collection("personal_stock")
      .doc(fromUid)
      .collection("equipos_series")
      .doc(sn);

    const [eqSnap, personalSeriesSnap] = await Promise.all([
      tx.get(eqRef),
      tx.get(personalSeriesRef),
    ]);

    if (!eqSnap.exists) throw new Error("EQUIPO_NOT_FOUND");
    const e = eqSnap.data() as any;

    const ubicacionTipo = String(e?.ubicacionTipo || "").trim().toUpperCase();
    const ubicacionUid = String(e?.ubicacionUid || "").trim();
    if (ubicacionTipo !== "PERSONAL" || ubicacionUid !== fromUid) {
      throw new Error("SN_NO_PERTENECE_A_PERSONAL");
    }

    tipoEq = String(e.equipo || "UNKNOWN").toUpperCase();
    const descripcion = String(e.descripcion || "");
    const nextNorm = normalizeUbicacion(toUbicacion);
    nextUb = nextNorm.ubicacion || toUbicacion;

    tx.update(eqRef, {
      ubicacion: nextUb,
      estado: "CAMPO",
      ubicacionTipo: FieldValue.delete(),
      ubicacionUid: FieldValue.delete(),
      entityRol: FieldValue.delete(),
      audit: { ...(e.audit || {}), updatedAt: FieldValue.serverTimestamp(), updatedBy: input.actorUid },
    });

    const personalStockRef = db
      .collection("personal_stock")
      .doc(fromUid)
      .collection("equipos_stock")
      .doc(tipoEq);
    tx.set(personalStockRef, { tipo: tipoEq, cantidad: FieldValue.increment(-1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (personalSeriesSnap.exists) tx.delete(personalSeriesRef);

    const cuadStockRef = db.collection("cuadrillas").doc(toCuadrillaId).collection("equipos_stock").doc(tipoEq);
    const cuadSeriesRef = db.collection("cuadrillas").doc(toCuadrillaId).collection("equipos_series").doc(sn);
    tx.set(cuadStockRef, { tipo: tipoEq, cantidad: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(cuadSeriesRef, {
      SN: sn,
      equipo: tipoEq,
      descripcion,
      ubicacion: nextUb,
      estado: "CAMPO",
      guia_despacho: String(e?.guia_despacho || ""),
      f_despachoAt: e?.f_despachoAt || null,
      f_despachoYmd: e?.f_despachoYmd || null,
      f_despachoHm: e?.f_despachoHm || null,
      tecnicos: [],
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  try {
    const usuario = await getUsuarioDisplayName(input.actorUid);
    await addGlobalNotification({
      title: "Movimiento de Equipo",
      message: `${usuario} movió ${tipoEq} (SN: ${sn}) de personal a cuadrilla "${nextUb}"`,
      type: "info",
      scope: "ALL",
      createdBy: input.actorUid,
      entityType: "EQUIPO_MOVE",
      entityId: sn,
      action: "UPDATE",
      estado: "ACTIVO",
    });
  } catch {}

  return { ok: true, sn, ubicacion: nextUb, estado: "CAMPO" };
}
