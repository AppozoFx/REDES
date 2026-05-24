"use server";

import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireServerPermission } from "@/core/auth/require";
import { getCuadrillaPreconStock, moveEquipoBetweenCuadrillas } from "@/domain/transferencias/instalaciones/moveEquipo";

const BULK_PAGE_SIZE = 400;

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
  return moveEquipoBetweenCuadrillas({ ...input, actorUid: session.uid });
}

export async function getCuadrillaPreconStockAction(input: { cuadrillaId: string }) {
  await requireServerPermission("EQUIPOS_EDIT");
  return { ok: true, stock: await getCuadrillaPreconStock(input.cuadrillaId) };
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
