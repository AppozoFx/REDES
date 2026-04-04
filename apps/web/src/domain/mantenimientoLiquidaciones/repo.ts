import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { metersToCm } from "@/domain/materiales/repo";
import {
  type MaterialLiquidacionInput,
  MantenimientoLiquidacionCreateSchema,
  MantenimientoLiquidacionUpdateSchema,
} from "./schemas";

export const MANTENIMIENTO_LIQUIDACIONES_COL = "mantenimiento_liquidaciones";

function col() {
  return adminDb().collection(MANTENIMIENTO_LIQUIDACIONES_COL);
}

function normText(v: unknown) {
  return String(v || "").trim();
}

function ticketDocId(ticketNumero: string) {
  return normText(ticketNumero).replace(/[\/\\#?\[\]]+/g, "_");
}

function normCoord(v: unknown, min: number, max: number) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

function normalizeEstadoLegacy(v: unknown) {
  const estado = normText(v).toUpperCase();
  return estado === "BORRADOR" ? "ABIERTO" : estado;
}

function mapLiquidacionOut(id: string, data: any) {
  return {
    id,
    ...(data as any),
    estado: normalizeEstadoLegacy(data?.estado),
  };
}

function shortNameFromUser(data: any, fallback: string) {
  const nombres = String(data?.nombres || "").trim();
  const apellidos = String(data?.apellidos || "").trim();
  const full = String(data?.displayName || `${nombres} ${apellidos}`.trim() || fallback).trim();
  const parts = full.split(/\s+/).filter(Boolean);
  const first = parts[0] || "";
  const last = parts.length >= 4 ? parts[2] || "" : parts[1] || "";
  return `${first} ${last}`.trim() || fallback;
}

async function loadCuadrillaMant(cuadrillaId: string) {
  const snap = await adminDb().collection("cuadrillas").doc(cuadrillaId).get();
  if (!snap.exists) throw new Error("CUADRILLA_NOT_FOUND");
  const data = snap.data() as any;
  if (String(data?.area || "") !== "MANTENIMIENTO") throw new Error("INVALID_CUADRILLA");

  let coordinadorNombre = "";
  const coordinadorUid = normText(data?.coordinadorUid);
  if (coordinadorUid) {
    const userSnap = await adminDb().collection("usuarios").doc(coordinadorUid).get();
    coordinadorNombre = shortNameFromUser(userSnap.data(), coordinadorUid);
  }

  return {
    id: snap.id,
    nombre: normText(data?.nombre || snap.id),
    coordinadorUid,
    coordinadorNombre,
  };
}

function normalizeMateriales(items: MaterialLiquidacionInput[]) {
  return (Array.isArray(items) ? items : [])
    .map((it) => ({
      materialId: normText(it.materialId),
      descripcion: normText(it.descripcion),
      unidadTipo: it.unidadTipo === "METROS" ? "METROS" : "UND",
      und: Math.max(0, Math.floor(Number(it.und || 0))),
      metros: Math.max(0, Number(it.metros || 0)),
    }))
    .filter((it) => {
      if (!it.materialId) return false;
      return it.unidadTipo === "METROS" ? it.metros > 0 : it.und > 0;
    });
}

export async function listMantenimientoLiquidaciones() {
  const snap = await col().orderBy("audit.createdAt", "desc").limit(500).get();
  return snap.docs.map((d) => mapLiquidacionOut(d.id, d.data()));
}

export async function getMantenimientoLiquidacionById(id: string) {
  const snap = await col().doc(id).get();
  if (!snap.exists) return null;
  return mapLiquidacionOut(snap.id, snap.data());
}

export async function createMantenimientoLiquidacion(input: unknown, actorUid: string) {
  const parsed = MantenimientoLiquidacionCreateSchema.parse(input);
  const cuadrilla = await loadCuadrillaMant(parsed.cuadrillaId);
  const docId = ticketDocId(parsed.ticketNumero);
  if (!docId) throw new Error("TICKET_REQUIRED");
  const ref = col().doc(docId);
  const exists = await ref.get();
  if (exists.exists) throw new Error("TICKET_DUPLICADO");
  const materialesConsumidos = normalizeMateriales(parsed.materialesConsumidos);

  await ref.set({
    ticketNumero: normText(parsed.ticketNumero),
    codigoCaja: normText(parsed.codigoCaja),
    fechaAtencionYmd: normText(parsed.fechaAtencionYmd),
    distrito: normText(parsed.distrito),
    latitud: normCoord(parsed.latitud, -90, 90),
    longitud: normCoord(parsed.longitud, -180, 180),
    cuadrillaId: cuadrilla.id,
    cuadrillaNombre: cuadrilla.nombre,
    coordinadorUid: cuadrilla.coordinadorUid,
    coordinadorNombre: cuadrilla.coordinadorNombre,
    horaInicio: normText(parsed.horaInicio),
    horaFin: normText(parsed.horaFin),
    causaRaiz: normText(parsed.causaRaiz),
    solucion: normText(parsed.solucion),
    observacion: normText(parsed.observacion),
    estado: "ABIERTO",
    origen: parsed.origen,
    materialesConsumidos,
    materialesSnapshot: [],
    movimientoInventarioId: "",
    liquidadoAt: null,
    liquidadoBy: "",
    exportadoWinAt: null,
    exportadoWinBy: "",
    audit: {
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actorUid,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actorUid,
    },
  });

  return { id: ref.id };
}

export async function updateMantenimientoLiquidacion(id: string, input: unknown, actorUid: string) {
  const parsed = MantenimientoLiquidacionUpdateSchema.parse(input);
  const ref = col().doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("NOT_FOUND");
  const curr = snap.data() as any;
  if (normalizeEstadoLegacy(curr?.estado) === "LIQUIDADO") throw new Error("LIQUIDACION_YA_CONFIRMADA");
  if (ticketDocId(parsed.ticketNumero) !== id) throw new Error("TICKET_ID_INMUTABLE");

  const cuadrilla = await loadCuadrillaMant(parsed.cuadrillaId);
  const materialesConsumidos = normalizeMateriales(parsed.materialesConsumidos);

  await ref.set(
    {
      ticketNumero: normText(parsed.ticketNumero),
      codigoCaja: normText(parsed.codigoCaja),
      fechaAtencionYmd: normText(parsed.fechaAtencionYmd),
      distrito: normText(parsed.distrito),
      latitud: normCoord(parsed.latitud, -90, 90),
      longitud: normCoord(parsed.longitud, -180, 180),
      cuadrillaId: cuadrilla.id,
      cuadrillaNombre: cuadrilla.nombre,
      coordinadorUid: cuadrilla.coordinadorUid,
      coordinadorNombre: cuadrilla.coordinadorNombre,
      horaInicio: normText(parsed.horaInicio),
      horaFin: normText(parsed.horaFin),
      causaRaiz: normText(parsed.causaRaiz),
      solucion: normText(parsed.solucion),
      observacion: normText(parsed.observacion),
      origen: parsed.origen,
      estado: normalizeEstadoLegacy(parsed.estado || curr?.estado || "ABIERTO"),
      materialesConsumidos,
      "audit.updatedAt": FieldValue.serverTimestamp(),
      "audit.updatedBy": actorUid,
    },
    { merge: true }
  );
}

export async function deleteMantenimientoLiquidacion(id: string, actorUid: string) {
  const db = adminDb();
  const ref = col().doc(id);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("NOT_FOUND");
    const curr = snap.data() as any;
    const estado = normalizeEstadoLegacy(curr?.estado || "ABIERTO");
    if (estado !== "ABIERTO") throw new Error("SOLO_ABIERTO_ELIMINABLE");

    tx.delete(ref);

    return {
      id,
      deletedBy: actorUid,
    };
  });
}

export async function liquidarMantenimientoLiquidacion(id: string, actorUid: string) {
  const db = adminDb();
  const ref = col().doc(id);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("NOT_FOUND");
    const curr = snap.data() as any;
    const estado = normalizeEstadoLegacy(curr?.estado);
    if (estado === "LIQUIDADO") throw new Error("LIQUIDACION_YA_CONFIRMADA");
    if (estado === "ANULADO") throw new Error("LIQUIDACION_ANULADA");

    const cuadrillaId = normText(curr?.cuadrillaId);
    if (!cuadrillaId) throw new Error("CUADRILLA_REQUIRED");

    const cuadrillaRef = db.collection("cuadrillas").doc(cuadrillaId);
    const cuadrillaSnap = await tx.get(cuadrillaRef);
    if (!cuadrillaSnap.exists) throw new Error("CUADRILLA_NOT_FOUND");
    const cuadrilla = cuadrillaSnap.data() as any;
    if (String(cuadrilla?.area || "") !== "MANTENIMIENTO") throw new Error("INVALID_CUADRILLA");

    const materialesBase = Array.isArray(curr?.materialesConsumidos) ? curr.materialesConsumidos : [];
    const materiales = normalizeMateriales(materialesBase);
    if (!materiales.length) throw new Error("MATERIALES_REQUIRED");

    const materialIds = materiales.map((it) => it.materialId);
    const matRefs = materialIds.map((mid) => db.collection("materiales").doc(mid));
    const stockRefs = materialIds.map((mid) => cuadrillaRef.collection("stock").doc(mid));
    const [matSnaps, stockSnaps] = await Promise.all([tx.getAll(...matRefs), tx.getAll(...stockRefs)]);
    const matMap = new Map(matSnaps.map((s) => [s.id, s]));
    const stockMap = new Map(stockSnaps.map((s) => [s.id, s]));

    const snapshotItems = materiales.map((it) => {
      const mSnap = matMap.get(it.materialId);
      if (!mSnap?.exists) throw new Error(`MATERIAL_NOT_FOUND ${it.materialId}`);
      const m = mSnap.data() as any;
      const unidadTipo = String(m?.unidadTipo || "").toUpperCase() === "METROS" ? "METROS" : "UND";
      const descripcion = normText(m?.nombre || m?.descripcion || it.descripcion || it.materialId);
      const stock = stockMap.get(it.materialId)?.data() as any;

      if (unidadTipo === "UND") {
        const available = Number(stock?.stockUnd || 0);
        if (available - it.und < 0) throw new Error(`STOCK_INSUFICIENTE_CUADRILLA ${it.materialId}`);
        tx.set(
          cuadrillaRef.collection("stock").doc(it.materialId),
          { materialId: it.materialId, unidadTipo: "UND", stockUnd: FieldValue.increment(-it.und), updatedAt: FieldValue.serverTimestamp() },
          { merge: true }
        );
      } else {
        const availableCm = Number(stock?.stockCm || 0);
        const needCm = metersToCm(it.metros);
        if (availableCm - needCm < 0) throw new Error(`STOCK_INSUFICIENTE_CUADRILLA ${it.materialId}`);
        tx.set(
          cuadrillaRef.collection("stock").doc(it.materialId),
          { materialId: it.materialId, unidadTipo: "METROS", stockCm: FieldValue.increment(-needCm), updatedAt: FieldValue.serverTimestamp() },
          { merge: true }
        );
      }

      const precioUnitario =
        unidadTipo === "METROS"
          ? Number(m?.precioPorMetroCents || 0) / 100
          : Number(m?.precioUndCents || 0) / 100;
      const total = unidadTipo === "METROS" ? Number((it.metros * precioUnitario).toFixed(2)) : Number((it.und * precioUnitario).toFixed(2));

      return {
        materialId: it.materialId,
        descripcion,
        unidadTipo,
        und: unidadTipo === "UND" ? it.und : 0,
        metros: unidadTipo === "METROS" ? it.metros : 0,
        precioUnitario,
        total,
        status: "OK",
      };
    });

    const movRef = db.collection("movimientos_inventario").doc();
    tx.set(movRef, {
      area: "MANTENIMIENTO",
      tipo: "LIQUIDACION_MANTENIMIENTO",
      liquidacionId: ref.id,
      ticketNumero: normText(curr?.ticketNumero),
      origen: { type: "CUADRILLA", id: cuadrillaId },
      destino: { type: "TICKET", id: normText(curr?.ticketNumero || ref.id) },
      itemsMateriales: snapshotItems,
      observacion: normText(curr?.observacion),
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actorUid,
    });

    tx.set(
      ref,
      {
        estado: "LIQUIDADO",
        materialesSnapshot: snapshotItems,
        movimientoInventarioId: movRef.id,
        liquidadoAt: FieldValue.serverTimestamp(),
        liquidadoBy: actorUid,
        "audit.updatedAt": FieldValue.serverTimestamp(),
        "audit.updatedBy": actorUid,
      },
      { merge: true }
    );

    return { movimientoInventarioId: movRef.id };
  });
}

export async function corregirMantenimientoLiquidacion(id: string, input: unknown, actorUid: string) {
  const parsed = MantenimientoLiquidacionUpdateSchema.parse(input);
  const db = adminDb();
  const ref = col().doc(id);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("NOT_FOUND");
    const curr = snap.data() as any;
    if (normalizeEstadoLegacy(curr?.estado) !== "LIQUIDADO") throw new Error("LIQUIDACION_NO_CONFIRMADA");

    const cuadrilla = await loadCuadrillaMant(parsed.cuadrillaId);
    const nextMateriales = normalizeMateriales(parsed.materialesConsumidos);
    if (!nextMateriales.length) throw new Error("MATERIALES_REQUIRED");

    const prevSnapshot = Array.isArray(curr?.materialesSnapshot) ? curr.materialesSnapshot : [];
    const prevMap = new Map<string, { unidadTipo: "UND" | "METROS"; und: number; metros: number }>(
      prevSnapshot.map((it: any) => [
        String(it.materialId || ""),
        {
          unidadTipo: String(it.unidadTipo || "UND").toUpperCase() === "METROS" ? "METROS" : "UND",
          und: Math.max(0, Math.floor(Number(it.und || 0))),
          metros: Math.max(0, Number(it.metros || 0)),
        },
      ])
    );
    const nextMap = new Map<string, { unidadTipo: "UND" | "METROS"; und: number; metros: number; descripcion: string }>(
      nextMateriales.map((it) => [
        it.materialId,
        {
          unidadTipo: (it.unidadTipo === "METROS" ? "METROS" : "UND") as "UND" | "METROS",
          und: it.und,
          metros: it.metros,
          descripcion: it.descripcion,
        },
      ])
    );

    const materialIds = Array.from(new Set([...prevMap.keys(), ...nextMap.keys()])).filter(Boolean) as string[];
    const cuadrillaRef = db.collection("cuadrillas").doc(cuadrilla.id);
    const matRefs = materialIds.map((mid) => db.collection("materiales").doc(mid));
    const stockRefs = materialIds.map((mid) => cuadrillaRef.collection("stock").doc(mid));
    const [matSnaps, stockSnaps] = await Promise.all([tx.getAll(...matRefs), tx.getAll(...stockRefs)]);
    const matMap = new Map(matSnaps.map((s) => [s.id, s]));
    const stockMap = new Map(stockSnaps.map((s) => [s.id, s]));

    const deltaItems: Array<any> = [];
    const snapshotItems: Array<any> = [];

    for (const materialId of materialIds) {
      const matSnap = matMap.get(materialId);
      if (!matSnap?.exists) throw new Error(`MATERIAL_NOT_FOUND ${materialId}`);
      const m = matSnap.data() as any;
      const unidadTipo = String(m?.unidadTipo || "").toUpperCase() === "METROS" ? "METROS" : "UND";
      const descripcion = normText(m?.nombre || m?.descripcion || nextMap.get(materialId)?.descripcion || materialId);
      const stock = stockMap.get(materialId)?.data() as any;

      const prev = prevMap.get(materialId) || { unidadTipo, und: 0, metros: 0 };
      const next = nextMap.get(materialId) || { unidadTipo, und: 0, metros: 0 };

      if (unidadTipo === "UND") {
        const delta = Math.max(0, Math.floor(Number(next.und || 0))) - Math.max(0, Math.floor(Number(prev.und || 0)));
        if (delta !== 0) {
          const available = Number(stock?.stockUnd || 0);
          if (delta > 0 && available - delta < 0) throw new Error(`STOCK_INSUFICIENTE_CUADRILLA ${materialId}`);
          tx.set(
            cuadrillaRef.collection("stock").doc(materialId),
            { materialId, unidadTipo: "UND", stockUnd: FieldValue.increment(-delta), updatedAt: FieldValue.serverTimestamp() },
            { merge: true }
          );
          deltaItems.push({ materialId, descripcion, unidadTipo: "UND", undDelta: delta, metrosDelta: 0 });
        }
        if (Number(next.und || 0) > 0) {
          const precioUnitario = Number(m?.precioUndCents || 0) / 100;
          snapshotItems.push({
            materialId,
            descripcion,
            unidadTipo: "UND",
            und: Math.max(0, Math.floor(Number(next.und || 0))),
            metros: 0,
            precioUnitario,
            total: Number((Math.max(0, Math.floor(Number(next.und || 0))) * precioUnitario).toFixed(2)),
            status: "OK",
          });
        }
      } else {
        const delta = Math.max(0, Number(next.metros || 0)) - Math.max(0, Number(prev.metros || 0));
        if (delta !== 0) {
          const deltaCm = metersToCm(Math.abs(delta));
          const availableCm = Number(stock?.stockCm || 0);
          if (delta > 0 && availableCm - deltaCm < 0) throw new Error(`STOCK_INSUFICIENTE_CUADRILLA ${materialId}`);
          tx.set(
            cuadrillaRef.collection("stock").doc(materialId),
            { materialId, unidadTipo: "METROS", stockCm: FieldValue.increment(delta > 0 ? -deltaCm : deltaCm), updatedAt: FieldValue.serverTimestamp() },
            { merge: true }
          );
          deltaItems.push({ materialId, descripcion, unidadTipo: "METROS", undDelta: 0, metrosDelta: delta });
        }
        if (Number(next.metros || 0) > 0) {
          const precioUnitario = Number(m?.precioPorMetroCents || 0) / 100;
          snapshotItems.push({
            materialId,
            descripcion,
            unidadTipo: "METROS",
            und: 0,
            metros: Math.max(0, Number(next.metros || 0)),
            precioUnitario,
            total: Number((Math.max(0, Number(next.metros || 0)) * precioUnitario).toFixed(2)),
            status: "OK",
          });
        }
      }
    }

    if (!deltaItems.length) throw new Error("SIN_CAMBIOS");

    const movRef = db.collection("movimientos_inventario").doc();
    tx.set(movRef, {
      area: "MANTENIMIENTO",
      tipo: "CORRECCION_LIQUIDACION_MANTENIMIENTO",
      liquidacionId: ref.id,
      ticketNumero: normText(parsed.ticketNumero || curr?.ticketNumero),
      origen: { type: "CUADRILLA", id: cuadrilla.id },
      destino: { type: "TICKET", id: normText(parsed.ticketNumero || curr?.ticketNumero || ref.id) },
      itemsMateriales: deltaItems,
      observacion: normText(parsed.observacion || curr?.observacion),
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actorUid,
    });

    tx.set(
      ref,
      {
        ticketNumero: normText(parsed.ticketNumero),
        codigoCaja: normText(parsed.codigoCaja),
        fechaAtencionYmd: normText(parsed.fechaAtencionYmd),
        distrito: normText(parsed.distrito),
        latitud: normCoord(parsed.latitud, -90, 90),
        longitud: normCoord(parsed.longitud, -180, 180),
        cuadrillaId: cuadrilla.id,
        cuadrillaNombre: cuadrilla.nombre,
        coordinadorUid: cuadrilla.coordinadorUid,
        coordinadorNombre: cuadrilla.coordinadorNombre,
        horaInicio: normText(parsed.horaInicio),
        horaFin: normText(parsed.horaFin),
        causaRaiz: normText(parsed.causaRaiz),
        solucion: normText(parsed.solucion),
        observacion: normText(parsed.observacion),
        origen: parsed.origen,
        materialesConsumidos: nextMateriales,
        materialesSnapshot: snapshotItems,
        correccionPendiente: false,
        correccionAt: FieldValue.serverTimestamp(),
        correccionBy: actorUid,
        correccionMovimientoInventarioId: movRef.id,
        "audit.updatedAt": FieldValue.serverTimestamp(),
        "audit.updatedBy": actorUid,
      },
      { merge: true }
    );

    return { movimientoInventarioId: movRef.id };
  });
}
