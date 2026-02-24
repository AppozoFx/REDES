"use server";

import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireServerPermission } from "@/core/auth/require";
import { normalizeUbicacion } from "@/domain/equipos/repo";
import { addGlobalNotification } from "@/domain/notificaciones/service";
import { KIT_BASE_POR_ONT } from "@/domain/transferencias/instalaciones/service";

const PRECON_IDS = ["PRECON_50", "PRECON_100", "PRECON_150", "PRECON_200"] as const;
const BULK_PAGE_SIZE = 400;

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

export async function moverEquipoManualAction(input: {
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
}) {
  const session = await requireServerPermission("EQUIPOS_EDIT");
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
        if (!PRECON_IDS.includes(preconMaterialId as any)) {
          throw new Error("PRECON_INVALIDO");
        }
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
      audit: { ...(e.audit || {}), updatedAt: FieldValue.serverTimestamp() },
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
    const usuario = await getUsuarioDisplayName(session.uid);
    if (prevUb !== nextUb) {
      const msg = `${usuario} movió ${tipoEq} (SN: ${sn}) de "${prevUb}" a "${nextUb}"`;
      await addGlobalNotification({
        title: "Movimiento de Equipo",
        message: msg,
        type: "info",
        scope: "ALL",
        createdBy: session.uid,
        entityType: "EQUIPO_MOVE",
        entityId: sn,
        action: "UPDATE",
        estado: "ACTIVO",
      });
    }
  } catch {}

  return { ok: true, sn, ubicacion: nextUb, estado: nextEstado };
}

export async function getCuadrillaPreconStockAction(input: { cuadrillaId: string }) {
  await requireServerPermission("EQUIPOS_EDIT");
  const cuadrillaId = String(input.cuadrillaId || "").trim();
  if (!cuadrillaId) throw new Error("CUADRILLA_REQUIRED");
  const db = adminDb();
  const stock: Record<string, number> = {
    PRECON_50: 0,
    PRECON_100: 0,
    PRECON_150: 0,
    PRECON_200: 0,
  };
  for (const id of PRECON_IDS) {
    const snap = await db.collection("cuadrillas").doc(cuadrillaId).collection("stock").doc(id).get();
    stock[id] = Number((snap.data() as any)?.stockUnd || 0);
  }
  return { ok: true, stock };
}

type EquiposBulkField = "pri_tec" | "tec_liq" | "inv";

type EquiposBulkFilters = {
  sn?: string;
  exact?: boolean;
  estados?: string[];
  ubicacion?: string;
  equipo?: string;
  pri_tec?: string;
  tec_liq?: string;
  inv?: string;
  descripcionList?: string[];
};

function normalizeUpper(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

function normalizeList(values: unknown, max = 10): string[] {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((v) => normalizeUpper(v))
        .filter(Boolean)
    )
  ).slice(0, max);
}

function buildEquiposBulkQuery(filters: EquiposBulkFilters) {
  const db = adminDb();
  const sn = normalizeUpper(filters.sn);
  const exact = !!filters.exact;
  const estados = normalizeList(filters.estados, 10);
  const ubicacion = normalizeUpper(filters.ubicacion);
  const equipo = normalizeUpper(filters.equipo);
  const priTec = normalizeUpper(filters.pri_tec);
  const tecLiq = normalizeUpper(filters.tec_liq);
  const inv = normalizeUpper(filters.inv);
  const descripcionList = Array.from(
    new Set(
      (Array.isArray(filters.descripcionList) ? filters.descripcionList : [])
        .map((d) => String(d || "").trim())
        .filter(Boolean)
    )
  ).slice(0, 10);

  let q: FirebaseFirestore.Query = db.collection("equipos");
  if (sn && exact) return { q: null as FirebaseFirestore.Query | null, exactSn: sn };

  if (sn && sn.length === 6) {
    q = q.where("sn_tail", "==", sn).orderBy(FieldPath.documentId());
  } else if (sn) {
    q = q.orderBy(FieldPath.documentId()).startAt(sn).endAt(sn + "\uf8ff");
  } else {
    q = q.orderBy(FieldPath.documentId());
    if (estados.length === 1) q = q.where("estado", "==", estados[0]);
    else if (estados.length > 1) q = q.where("estado", "in", estados);
    else if (!ubicacion) q = q.where("estado", "in", ["ALMACEN", "CAMPO"]);
  }

  if (ubicacion) q = q.where("ubicacion", "==", ubicacion);
  if (equipo) q = q.where("equipo", "==", equipo);
  if (priTec) q = q.where("pri_tec", "==", priTec);
  if (tecLiq) q = q.where("tec_liq", "==", tecLiq);
  if (inv) q = q.where("inv", "==", inv);
  if (descripcionList.length > 0) q = q.where("descripcion", "in", descripcionList);

  return { q, exactSn: "" };
}

export async function bulkSetEquiposCampoByFiltrosAction(input: {
  field: EquiposBulkField;
  value: "SI" | "NO";
  filters: EquiposBulkFilters;
}) {
  await requireServerPermission("EQUIPOS_EDIT");
  const field = String(input.field || "").trim() as EquiposBulkField;
  if (!["pri_tec", "tec_liq", "inv"].includes(field)) throw new Error("FIELD_INVALID");
  const value = normalizeUpper(input.value) as "SI" | "NO";
  if (value !== "SI" && value !== "NO") throw new Error("VALUE_INVALID");

  const db = adminDb();
  const { q, exactSn } = buildEquiposBulkQuery(input.filters || {});
  let scanned = 0;
  let matched = 0;
  let updated = 0;

  if (exactSn) {
    const ref = db.collection("equipos").doc(exactSn);
    const snap = await ref.get();
    scanned = 1;
    if (!snap.exists) return { ok: true, scanned, matched, updated };
    matched = 1;
    if (normalizeUpper((snap.data() as any)?.[field]) === value) {
      return { ok: true, scanned, matched, updated };
    }
    await ref.update({ [field]: value, "audit.updatedAt": FieldValue.serverTimestamp() });
    updated = 1;
    return { ok: true, scanned, matched, updated };
  }

  if (!q) return { ok: true, scanned, matched, updated };

  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  while (true) {
    let page = q.limit(BULK_PAGE_SIZE);
    if (cursor) page = page.startAfter(cursor);
    const snap = await page.get();
    if (snap.empty) break;
    scanned += snap.docs.length;

    const batch = db.batch();
    let writes = 0;
    for (const doc of snap.docs) {
      matched += 1;
      const current = normalizeUpper((doc.data() as any)?.[field]);
      if (current === value) continue;
      batch.update(doc.ref, {
        [field]: value,
        "audit.updatedAt": FieldValue.serverTimestamp(),
      });
      writes += 1;
      updated += 1;
    }
    if (writes > 0) await batch.commit();
    cursor = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < BULK_PAGE_SIZE) break;
  }

  return { ok: true, scanned, matched, updated };
}

export async function marcarAuditoriaAction(input: { sn: string }) {
  const session = await requireServerPermission("EQUIPOS_EDIT");
  const sn = String(input.sn || "").trim().toUpperCase();
  if (!sn) throw new Error("SN_REQUIRED");

  const ref = adminDb().collection("equipos").doc(sn);
  const fotoPath = `auditoria/${sn}.jpg`;
  await ref.set(
    {
      auditoria: {
        requiere: true,
        estado: "pendiente",
        fotoPath,
        fotoURL: "",
        marcadoPor: session.uid,
        actualizadoEn: FieldValue.serverTimestamp(),
      },
    },
    { merge: true }
  );

  return {
    ok: true,
    sn,
    auditoria: {
      requiere: true,
      estado: "pendiente",
      fotoPath,
      fotoURL: "",
      marcadoPor: session.uid,
    },
  };
}

export async function quitarAuditoriaAction(input: { sn: string }) {
  await requireServerPermission("EQUIPOS_EDIT");
  const sn = String(input.sn || "").trim().toUpperCase();
  if (!sn) throw new Error("SN_REQUIRED");

  const ref = adminDb().collection("equipos").doc(sn);
  await ref.update({ auditoria: FieldValue.delete() });

  return { ok: true, sn };
}

