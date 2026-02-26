"use server";

import { requireServerPermission } from "@/core/auth/require";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { metersToCm } from "@/domain/materiales/repo";
import { addGlobalNotification } from "@/domain/notificaciones/service";

type DespachoItemInput = {
  materialId: string;
  und?: number;
  metros?: number;
};

function parseJson(value: FormDataEntryValue | null) {
  if (!value || typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function nextGuia(prefix: string): Promise<string> {
  const db = adminDb();
  const year = new Date().getFullYear();
  const seqRef = db.collection("sequences").doc(`${prefix}_${year}`);
  const n = await db.runTransaction(async (tx) => {
    const snap = await tx.get(seqRef);
    const curr = snap.exists ? (snap.data() as any)?.counter || 0 : 0;
    const next = curr + 1;
    tx.set(seqRef, { counter: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return next as number;
  });
  return `${prefix}-${year}-${String(n).padStart(6, "0")}`;
}

function shortName(name: string) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  const first = parts[0];
  const firstLast = parts.length >= 4 ? parts[2] || "" : parts[1] || "";
  return `${first} ${firstLast}`.trim() || first;
}

async function getUsuarioDisplayName(uid: string) {
  const snap = await adminDb().collection("usuarios").doc(uid).get();
  if (!snap.exists) return uid;
  const data = snap.data() as any;
  const nombres = String(data?.nombres || "").trim();
  const apellidos = String(data?.apellidos || "").trim();
  return shortName(`${nombres} ${apellidos}`.trim() || uid);
}

async function getUsuariosDisplayNames(uids: string[] | undefined | null) {
  const list = (uids || []).map((u) => String(u || "").trim()).filter(Boolean);
  if (!list.length) return [];
  const db = adminDb();
  const refs = list.map((uid) => db.collection("usuarios").doc(uid));
  const snaps = await db.getAll(...refs);
  return snaps.map((snap, i) => {
    if (!snap.exists) return list[i];
    const data = snap.data() as any;
    const nombres = String(data?.nombres || "").trim();
    const apellidos = String(data?.apellidos || "").trim();
    return shortName(`${nombres} ${apellidos}`.trim() || list[i]);
  });
}

function updateStockTx(
  tx: FirebaseFirestore.Transaction,
  opts: { cuadrillaId: string; materialId: string; unidadTipo: "UND" | "METROS"; und?: number; metros?: number },
  snaps: { almSnap?: FirebaseFirestore.DocumentSnapshot; cuadSnap?: FirebaseFirestore.DocumentSnapshot }
) {
  const und = Math.floor(opts.und || 0);
  const cm = opts.unidadTipo === "METROS" ? metersToCm(opts.metros || 0) : 0;

  const db = adminDb();
  const almRef = db.collection("almacen_stock").doc(opts.materialId);
  const cuadRef = db.collection("cuadrillas").doc(opts.cuadrillaId).collection("stock").doc(opts.materialId);

  const almSnap = snaps.almSnap;
  const cuadSnap = snaps.cuadSnap;

  if (!almSnap?.exists) {
    tx.set(almRef, { materialId: opts.materialId, unidadTipo: opts.unidadTipo, stockUnd: 0, stockCm: 0 }, { merge: true });
  }
  if (!cuadSnap?.exists) {
    tx.set(cuadRef, { materialId: opts.materialId, unidadTipo: opts.unidadTipo, stockUnd: 0, stockCm: 0 }, { merge: true });
  }
  const alm = almSnap?.exists ? (almSnap.data() as any) : { stockUnd: 0, stockCm: 0 };
  if (opts.unidadTipo === "UND") {
    if ((alm.stockUnd || 0) - und < 0) throw new Error("STOCK_INSUFICIENTE_ALMACEN");
    tx.update(almRef, { stockUnd: FieldValue.increment(-und) });
    tx.update(cuadRef, { stockUnd: FieldValue.increment(und) });
  } else {
    if ((alm.stockCm || 0) - cm < 0) throw new Error("STOCK_INSUFICIENTE_ALMACEN");
    tx.update(almRef, { stockCm: FieldValue.increment(-cm) });
    tx.update(cuadRef, { stockCm: FieldValue.increment(cm) });
  }
}

export async function despacharMantenimientoAction(arg1: any, arg2?: any) {
  const session = await requireServerPermission("MATERIALES_TRANSFER_SERVICIO");
  if (!session.isAdmin && !(session.access.areas || []).includes("MANTENIMIENTO")) {
    return { ok: false as const, error: { formErrors: ["FORBIDDEN"] } };
  }

  const formData = (arg2 && typeof arg2.get === "function") ? arg2 as FormData : arg1 as FormData;
  const cuadrillaId = String(formData.get("cuadrillaId") || "").trim();
  const observacion = String(formData.get("observacion") || "").trim();
  const itemsRaw = parseJson(formData.get("items"));
  const items = Array.isArray(itemsRaw) ? (itemsRaw as DespachoItemInput[]) : [];

  if (!cuadrillaId) return { ok: false as const, error: { formErrors: ["CUADRILLA_REQUIRED"] } };
  if (!items.length) return { ok: false as const, error: { formErrors: ["ITEMS_REQUIRED"] } };

  const db = adminDb();
  const cuadSnap = await db.collection("cuadrillas").doc(cuadrillaId).get();
  if (!cuadSnap.exists) return { ok: false as const, error: { formErrors: ["INVALID_CUADRILLA"] } };
  const cuad = cuadSnap.data() as any;
  if (String(cuad.area || "") !== "MANTENIMIENTO") {
    return { ok: false as const, error: { formErrors: ["INVALID_CUADRILLA"] } };
  }

  const matIds = Array.from(new Set(items.map((i) => String(i.materialId || "").trim()).filter(Boolean)));
  if (!matIds.length) return { ok: false as const, error: { formErrors: ["ITEMS_REQUIRED"] } };

  const matRefs = matIds.map((id) => db.collection("materiales").doc(id));
  const matSnaps = await db.getAll(...matRefs);
  const matById = new Map(matSnaps.map((s) => [s.id, s] as const));

  const parsed = items.map((it) => {
    const materialId = String(it.materialId || "").trim();
    const snap = matById.get(materialId);
    if (!snap || !snap.exists) throw new Error(`MATERIAL_NOT_FOUND ${materialId}`);
    const mat = snap.data() as any;
    const unidadTipo = String(mat.unidadTipo || "").toUpperCase() === "METROS" ? "METROS" : "UND";
    const und = unidadTipo === "UND" ? Math.floor(Number(it.und || 0)) : 0;
    const metros = unidadTipo === "METROS" ? Number(it.metros || 0) : 0;
    if (unidadTipo === "UND" && und <= 0) throw new Error(`UND_INVALIDA ${materialId}`);
    if (unidadTipo === "METROS" && metros <= 0) throw new Error(`METROS_INVALIDOS ${materialId}`);
    return { materialId, unidadTipo: unidadTipo as "UND" | "METROS", und, metros, nombre: String(mat?.nombre || materialId) };
  });

  const guia = await nextGuia("DESPM");
  const createdAt = FieldValue.serverTimestamp();
  const tecnicosUids: string[] = Array.isArray(cuad.tecnicosUids) ? cuad.tecnicosUids : Array.isArray(cuad.tecnicos) ? cuad.tecnicos : [];
  const tecnicosNombres = await getUsuariosDisplayNames(tecnicosUids);
  const coordinadorNombre = cuad.coordinadorUid ? await getUsuarioDisplayName(String(cuad.coordinadorUid)) : "";
  const usuarioNombre = await getUsuarioDisplayName(session.uid);

  await db.runTransaction(async (tx) => {
    const almRefs = parsed.map((it) => db.collection("almacen_stock").doc(it.materialId));
    const cuadRefs = parsed.map((it) =>
      db.collection("cuadrillas").doc(cuadrillaId).collection("stock").doc(it.materialId)
    );
    const allRefs = [...almRefs, ...cuadRefs];
    const allSnaps = await tx.getAll(...allRefs);
    const almSnaps = allSnaps.slice(0, almRefs.length);
    const cuadSnaps = allSnaps.slice(almRefs.length);

    for (let i = 0; i < parsed.length; i++) {
      const it = parsed[i];
      updateStockTx(
        tx,
        {
          cuadrillaId,
          materialId: it.materialId,
          unidadTipo: it.unidadTipo,
          und: it.und,
          metros: it.metros,
        },
        { almSnap: almSnaps[i], cuadSnap: cuadSnaps[i] }
      );
    }

    const movRef = db.collection("movimientos_inventario").doc();
    tx.set(movRef, {
      area: "MANTENIMIENTO",
      tipo: "DESPACHO",
      guia,
      origen: { type: "ALMACEN", id: "ALMACEN" },
      destino: { type: "CUADRILLA", id: cuadrillaId },
      cuadrillaId,
      cuadrillaNombre: String(cuad.nombre || cuadrillaId),
      coordinadorUid: String(cuad.coordinadorUid || ""),
      coordinadorNombre,
      tecnicosUids,
      tecnicosNombres,
      itemsMateriales: parsed.map((it) => ({
        materialId: it.materialId,
        nombre: it.nombre,
        unidadTipo: it.unidadTipo,
        und: it.und,
        metros: it.metros,
      })),
      observacion,
      createdAt,
      createdBy: session.uid,
    });
  });

  try {
    const usuario = usuarioNombre;
    const cuadName =
      String(cuad.nombre || cuadrillaId).replace(/^MANTENIMIENTO\s+/i, "").trim() ||
      String(cuad.nombre || cuadrillaId);
    const materialesOk = parsed.length;
    await addGlobalNotification({
      title: "Despacho (Mantenimiento)",
      message: `${usuario} realizo un despacho para "${cuadName}". Materiales: ${materialesOk}.`,
      type: "success",
      scope: "ALL",
      createdBy: session.uid,
      entityType: "DESPACHO_MANT",
      entityId: guia,
      action: "CREATE",
      estado: "ACTIVO",
    });
  } catch {}

  return {
    ok: true as const,
    guia,
    cuadrillaNombre: String(cuad.nombre || cuadrillaId),
    coordinadorNombre,
    tecnicosNombres,
    usuarioNombre,
  };
}
