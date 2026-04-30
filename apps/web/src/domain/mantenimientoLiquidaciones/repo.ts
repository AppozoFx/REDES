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

function normalizeTicketNumero(ticketNumero: string) {
  return normText(ticketNumero).replace(/\s+/g, " ").toUpperCase();
}

function buildLiquidacionId(ticketNumero: string) {
  const normalized = normalizeTicketNumero(ticketNumero).replace(/[\/\\#?\[\]]+/g, "_").replace(/[^A-Z0-9_-]+/g, "_");
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${normalized || "TICKET"}__${stamp}${rand}`;
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
    ticketNumeroNorm: normText(data?.ticketNumeroNorm || normalizeTicketNumero(data?.ticketNumero)),
    ticketVisita: Math.max(1, Math.floor(Number(data?.ticketVisita || 1))),
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

function getMetrosPorUnd(material: any) {
  const cm = Number(material?.metrosPorUndCm || 0);
  if (!Number.isFinite(cm) || cm <= 0) return 0;
  return cm / 100;
}

function normalizeLineaForCatalog(
  item: { materialId?: string; descripcion?: string; unidadTipo?: "UND" | "METROS" | string; und?: number; metros?: number },
  material: any
) {
  const catalogUnidad = String(material?.unidadTipo || "").toUpperCase() === "METROS" ? "METROS" : "UND";
  const und = Math.max(0, Math.floor(Number(item?.und || 0)));
  const metros = Math.max(0, Number(item?.metros || 0));
  if (catalogUnidad === "UND") {
    return { unidadTipo: "UND" as const, und, metros: 0 };
  }

  const metrosPorUnd = getMetrosPorUnd(material);
  const convertedMetros = metros > 0 ? metros : und > 0 && metrosPorUnd > 0 ? Number((und * metrosPorUnd).toFixed(2)) : 0;
  return { unidadTipo: "METROS" as const, und: 0, metros: convertedMetros };
}

function resolveStockCmForMetros(stock: any, material: any) {
  const directCm = Number(stock?.stockCm || 0);
  if (Number.isFinite(directCm) && directCm > 0) return directCm;
  const legacyUnd = Number(stock?.stockUnd || 0);
  const metrosPorUnd = getMetrosPorUnd(material);
  if (!Number.isFinite(legacyUnd) || legacyUnd <= 0 || metrosPorUnd <= 0) return 0;
  return metersToCm(legacyUnd * metrosPorUnd);
}

async function findLiquidacionesByTicket(ticketNumero: string) {
  const exact = normText(ticketNumero);
  const norm = normalizeTicketNumero(ticketNumero);
  const [byNormSnap, byExactSnap] = await Promise.all([
    col().where("ticketNumeroNorm", "==", norm).get(),
    col().where("ticketNumero", "==", exact).get(),
  ]);
  const seen = new Map<string, any>();
  for (const snap of [byNormSnap, byExactSnap]) {
    for (const doc of snap.docs) {
      if (!seen.has(doc.id)) seen.set(doc.id, doc);
    }
  }
  return Array.from(seen.values());
}

export async function getTicketVisitaPreview(ticketNumero: string, currentId?: string) {
  const docs = await findLiquidacionesByTicket(ticketNumero);
  const current = normText(currentId);
  const related = current ? docs.filter((doc) => doc.id !== current) : docs;
  const items = related
    .map((doc) => mapLiquidacionOut(doc.id, doc.data()))
    .sort((a: any, b: any) => {
      const ay = String(a?.fechaAtencionYmd || "");
      const by = String(b?.fechaAtencionYmd || "");
      if (by !== ay) return by.localeCompare(ay);
      return String(b?.id || "").localeCompare(String(a?.id || ""));
    });

  return {
    ticketNumero: normText(ticketNumero),
    ticketNumeroNorm: normalizeTicketNumero(ticketNumero),
    previousCount: items.length,
    nextVisita: Math.max(1, items.length + 1),
    items: items.slice(0, 5).map((item: any) => ({
      id: item.id,
      ticketVisita: Math.max(1, Number(item.ticketVisita || 1)),
      fechaAtencionYmd: String(item.fechaAtencionYmd || ""),
      cuadrillaNombre: String(item.cuadrillaNombre || ""),
      estado: String(item.estado || ""),
    })),
  };
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
  const ticketNumero = normText(parsed.ticketNumero);
  const ticketNumeroNorm = normalizeTicketNumero(parsed.ticketNumero);
  if (!ticketNumeroNorm) throw new Error("TICKET_REQUIRED");
  const prevDocs = await findLiquidacionesByTicket(parsed.ticketNumero);
  const ticketVisita = Math.max(1, prevDocs.length + 1);
  const ref = col().doc(buildLiquidacionId(ticketNumero));
  const materialesConsumidos = parsed.sinMateriales ? [] : normalizeMateriales(parsed.materialesConsumidos);

  await ref.set({
    ticketNumero,
    ticketNumeroNorm,
    ticketVisita,
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
    sinMateriales: Boolean(parsed.sinMateriales),
    motivoSinMateriales: normText(parsed.motivoSinMateriales),
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

  const cuadrilla = await loadCuadrillaMant(parsed.cuadrillaId);
  const materialesConsumidos = parsed.sinMateriales ? [] : normalizeMateriales(parsed.materialesConsumidos);
  const ticketNumero = normText(parsed.ticketNumero);
  const ticketNumeroNorm = normalizeTicketNumero(parsed.ticketNumero);
  if (!ticketNumeroNorm) throw new Error("TICKET_REQUIRED");

  await ref.set(
    {
      ticketNumero,
      ticketNumeroNorm,
      ticketVisita: Math.max(1, Math.floor(Number(curr?.ticketVisita || 1))),
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
      sinMateriales: Boolean(parsed.sinMateriales),
      motivoSinMateriales: normText(parsed.motivoSinMateriales),
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

export async function liquidarMantenimientoLiquidacion(
  id: string,
  actorUid: string,
  options?: { sinMateriales?: boolean; motivoSinMateriales?: string }
) {
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

    const sinMateriales = Boolean(options?.sinMateriales);
    const motivoSinMateriales = normText(options?.motivoSinMateriales);
    if (sinMateriales && !motivoSinMateriales) throw new Error("MOTIVO_SIN_MATERIALES_REQUIRED");

    const cuadrillaRef = db.collection("cuadrillas").doc(cuadrillaId);
    const cuadrillaSnap = await tx.get(cuadrillaRef);
    if (!cuadrillaSnap.exists) throw new Error("CUADRILLA_NOT_FOUND");
    const cuadrilla = cuadrillaSnap.data() as any;
    if (String(cuadrilla?.area || "") !== "MANTENIMIENTO") throw new Error("INVALID_CUADRILLA");

    const materialesBase = sinMateriales ? [] : Array.isArray(curr?.materialesConsumidos) ? curr.materialesConsumidos : [];
    const materiales = normalizeMateriales(materialesBase);
    if (!sinMateriales && !materiales.length) throw new Error("MATERIALES_REQUIRED");

    if (sinMateriales) {
      tx.set(
        ref,
        {
          estado: "LIQUIDADO",
          sinMateriales: true,
          motivoSinMateriales,
          materialesConsumidos: [],
          materialesSnapshot: [],
          movimientoInventarioId: "",
          liquidadoAt: FieldValue.serverTimestamp(),
          liquidadoBy: actorUid,
          "audit.updatedAt": FieldValue.serverTimestamp(),
          "audit.updatedBy": actorUid,
        },
        { merge: true }
      );

      return { movimientoInventarioId: "" };
    }

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
      const normalized = normalizeLineaForCatalog(it, m);
      const unidadTipo = normalized.unidadTipo;
      const descripcion = normText(m?.nombre || m?.descripcion || it.descripcion || it.materialId);
      const stock = stockMap.get(it.materialId)?.data() as any;

      if (unidadTipo === "UND") {
        const available = Number(stock?.stockUnd || 0);
        if (available - normalized.und < 0) throw new Error(`STOCK_INSUFICIENTE_CUADRILLA ${it.materialId}`);
        tx.set(
          cuadrillaRef.collection("stock").doc(it.materialId),
          { materialId: it.materialId, unidadTipo: "UND", stockUnd: FieldValue.increment(-normalized.und), updatedAt: FieldValue.serverTimestamp() },
          { merge: true }
        );
      } else {
        const availableCm = resolveStockCmForMetros(stock, m);
        const needCm = metersToCm(normalized.metros);
        if (availableCm - needCm < 0) throw new Error(`STOCK_INSUFICIENTE_CUADRILLA ${it.materialId}`);
        tx.set(
          cuadrillaRef.collection("stock").doc(it.materialId),
          {
            materialId: it.materialId,
            unidadTipo: "METROS",
            stockCm: availableCm - needCm,
            stockUnd: 0,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      const precioUnitario =
        unidadTipo === "METROS"
          ? Number(m?.precioPorMetroCents || 0) / 100
          : Number(m?.precioUndCents || 0) / 100;
      const total =
        unidadTipo === "METROS"
          ? Number((normalized.metros * precioUnitario).toFixed(2))
          : Number((normalized.und * precioUnitario).toFixed(2));

      return {
        materialId: it.materialId,
        descripcion,
        unidadTipo,
        und: unidadTipo === "UND" ? normalized.und : 0,
        metros: unidadTipo === "METROS" ? normalized.metros : 0,
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
      ticketNumeroNorm: normText(curr?.ticketNumeroNorm || normalizeTicketNumero(curr?.ticketNumero)),
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
        sinMateriales: false,
        motivoSinMateriales: "",
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
    const nextSinMateriales = Boolean(parsed.sinMateriales);
    const motivoSinMateriales = normText(parsed.motivoSinMateriales);
    if (nextSinMateriales && !motivoSinMateriales) throw new Error("MOTIVO_SIN_MATERIALES_REQUIRED");
    const nextMateriales = nextSinMateriales ? [] : normalizeMateriales(parsed.materialesConsumidos);
    if (!nextSinMateriales && !nextMateriales.length) throw new Error("MATERIALES_REQUIRED");

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

      const prevRaw = prevMap.get(materialId) || { unidadTipo, und: 0, metros: 0 };
      const nextRaw = nextMap.get(materialId) || { unidadTipo, und: 0, metros: 0 };
      const prev = normalizeLineaForCatalog(prevRaw, m);
      const next = normalizeLineaForCatalog(nextRaw, m);

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
          const availableCm = resolveStockCmForMetros(stock, m);
          if (delta > 0 && availableCm - deltaCm < 0) throw new Error(`STOCK_INSUFICIENTE_CUADRILLA ${materialId}`);
          tx.set(
            cuadrillaRef.collection("stock").doc(materialId),
            {
              materialId,
              unidadTipo: "METROS",
              stockCm: delta > 0 ? availableCm - deltaCm : availableCm + deltaCm,
              stockUnd: 0,
              updatedAt: FieldValue.serverTimestamp(),
            },
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

    const nextTicketNumero = normText(parsed.ticketNumero);
    const nextTicketNumeroNorm = normalizeTicketNumero(parsed.ticketNumero);
    const nextCodigoCaja = normText(parsed.codigoCaja);
    const nextFechaAtencionYmd = normText(parsed.fechaAtencionYmd);
    const nextDistrito = normText(parsed.distrito);
    const nextLatitud = normCoord(parsed.latitud, -90, 90);
    const nextLongitud = normCoord(parsed.longitud, -180, 180);
    const nextHoraInicio = normText(parsed.horaInicio);
    const nextHoraFin = normText(parsed.horaFin);
    const nextCausaRaiz = normText(parsed.causaRaiz);
    const nextSolucion = normText(parsed.solucion);
    const nextObservacion = normText(parsed.observacion);
    const nextOrigen = parsed.origen;

    const metaChanged =
      nextTicketNumero !== normText(curr?.ticketNumero) ||
      nextTicketNumeroNorm !== normText(curr?.ticketNumeroNorm || normalizeTicketNumero(curr?.ticketNumero)) ||
      nextCodigoCaja !== normText(curr?.codigoCaja) ||
      nextFechaAtencionYmd !== normText(curr?.fechaAtencionYmd) ||
      nextDistrito !== normText(curr?.distrito) ||
      nextLatitud !== normCoord(curr?.latitud, -90, 90) ||
      nextLongitud !== normCoord(curr?.longitud, -180, 180) ||
      cuadrilla.id !== normText(curr?.cuadrillaId) ||
      cuadrilla.nombre !== normText(curr?.cuadrillaNombre) ||
      nextHoraInicio !== normText(curr?.horaInicio) ||
      nextHoraFin !== normText(curr?.horaFin) ||
      nextCausaRaiz !== normText(curr?.causaRaiz) ||
      nextSolucion !== normText(curr?.solucion) ||
      nextObservacion !== normText(curr?.observacion) ||
      nextOrigen !== curr?.origen ||
      nextSinMateriales !== Boolean(curr?.sinMateriales) ||
      motivoSinMateriales !== normText(curr?.motivoSinMateriales);

    if (!deltaItems.length && !metaChanged) throw new Error("SIN_CAMBIOS");

    const movRef = deltaItems.length ? db.collection("movimientos_inventario").doc() : null;
    if (movRef) {
      tx.set(movRef, {
        area: "MANTENIMIENTO",
        tipo: "CORRECCION_LIQUIDACION_MANTENIMIENTO",
        liquidacionId: ref.id,
        ticketNumero: nextTicketNumero || normText(curr?.ticketNumero),
        ticketNumeroNorm: nextTicketNumeroNorm || normText(curr?.ticketNumeroNorm || normalizeTicketNumero(curr?.ticketNumero)),
        origen: { type: "CUADRILLA", id: cuadrilla.id },
        destino: { type: "TICKET", id: nextTicketNumero || normText(curr?.ticketNumero || ref.id) },
        itemsMateriales: deltaItems,
        observacion: nextObservacion || normText(curr?.observacion),
        createdAt: FieldValue.serverTimestamp(),
        createdBy: actorUid,
      });
    }

    tx.set(
      ref,
      {
        ticketNumero: nextTicketNumero,
        ticketNumeroNorm: nextTicketNumeroNorm,
        ticketVisita: Math.max(1, Math.floor(Number(curr?.ticketVisita || 1))),
        codigoCaja: nextCodigoCaja,
        fechaAtencionYmd: nextFechaAtencionYmd,
        distrito: nextDistrito,
        latitud: nextLatitud,
        longitud: nextLongitud,
        cuadrillaId: cuadrilla.id,
        cuadrillaNombre: cuadrilla.nombre,
        coordinadorUid: cuadrilla.coordinadorUid,
        coordinadorNombre: cuadrilla.coordinadorNombre,
        horaInicio: nextHoraInicio,
        horaFin: nextHoraFin,
        causaRaiz: nextCausaRaiz,
        solucion: nextSolucion,
        observacion: nextObservacion,
        sinMateriales: nextSinMateriales,
        motivoSinMateriales,
        origen: nextOrigen,
        materialesConsumidos: nextMateriales,
        materialesSnapshot: snapshotItems,
        correccionPendiente: false,
        correccionAt: FieldValue.serverTimestamp(),
        correccionBy: actorUid,
        correccionMovimientoInventarioId: movRef?.id || "",
        "audit.updatedAt": FieldValue.serverTimestamp(),
        "audit.updatedBy": actorUid,
      },
      { merge: true }
    );

    return { movimientoInventarioId: movRef?.id || "" };
  });
}
