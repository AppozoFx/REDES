"use server";

import { requireServerPermission } from "@/core/auth/require";
import { z } from "zod";
import {
  DespachoInstalacionesInputSchema,
  DevolucionInstalacionesInputSchema,
  type DespachoInstalacionesInput,
  type DevolucionInstalacionesInput,
  type TransferOk,
} from "@/domain/transferencias/instalaciones/schemas";
import { generateTransferId, normalizeBobinaCode, KIT_BASE_POR_ONT } from "@/domain/transferencias/instalaciones/service";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { normalizeUbicacion, toDatePartsLima } from "@/domain/equipos/repo";
import { metersToCm } from "@/domain/materiales/repo";

// Helpers
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
  const s = String(n).padStart(6, "0");
  return `${prefix}-${year}-${s}`;
}

function uniqueStrings(list: string[]): string[] {
  return Array.from(new Set((list || []).map((s) => String(s || "").trim()).filter(Boolean)));
}

async function getMaterialDoc(materialId: string): Promise<any | null> {
  const snap = await adminDb().collection("materiales").doc(materialId).get();
  return snap.exists ? snap.data() : null;
}

async function updateStockTx(
  tx: FirebaseFirestore.Transaction,
  opts: { from: { type: "ALMACEN" | "CUADRILLA"; id: string }; to: { type: "ALMACEN" | "CUADRILLA"; id: string }; material: any; und?: number; metros?: number }
) {
  const db = adminDb();
  const materialId = opts.material.id || opts.material.materialId || opts.materialId;
  const unidadTipo = opts.material.unidadTipo;
  const deltaUnd = Math.floor(opts.und || 0);
  const deltaCm = metersToCm(opts.metros || 0);

  function stockRef(loc: { type: "ALMACEN" | "CUADRILLA"; id: string }) {
    if (loc.type === "ALMACEN") return db.collection("almacen_stock").doc(materialId);
    return db.collection("cuadrillas").doc(loc.id).collection("stock").doc(materialId);
  }

  const fromRef = stockRef(opts.from);
  const toRef = stockRef(opts.to);
  const fromSnap = await tx.get(fromRef);
  const toSnap = await tx.get(toRef);

  // Initialize docs with unidadTipo if missing
  if (!fromSnap.exists) tx.set(fromRef, { materialId, unidadTipo, stockUnd: 0, stockCm: 0, area: opts.from.type === "ALMACEN" ? "ALMACEN" : "INSTALACIONES" }, { merge: true });
  if (!toSnap.exists) tx.set(toRef, { materialId, unidadTipo, stockUnd: 0, stockCm: 0, area: opts.to.type === "ALMACEN" ? "ALMACEN" : "INSTALACIONES" }, { merge: true });

  const fromData = fromSnap.exists ? (fromSnap.data() as any) : { stockUnd: 0, stockCm: 0 };
  const toData = toSnap.exists ? (toSnap.data() as any) : { stockUnd: 0, stockCm: 0 };

  if (unidadTipo === "UND") {
    const newFrom = (fromData.stockUnd || 0) - deltaUnd;
    if (opts.from.type === "ALMACEN" && newFrom < 0) throw new Error("STOCK_INSUFICIENTE_ALMACEN");
    tx.update(fromRef, { stockUnd: FieldValue.increment(-deltaUnd) });
    tx.update(toRef, { stockUnd: FieldValue.increment(deltaUnd) });
  } else {
    const newFrom = (fromData.stockCm || 0) - deltaCm;
    if (opts.from.type === "ALMACEN" && newFrom < 0) throw new Error("STOCK_INSUFICIENTE_ALMACEN");
    tx.update(fromRef, { stockCm: FieldValue.increment(-deltaCm) });
    tx.update(toRef, { stockCm: FieldValue.increment(deltaCm) });
  }
}

function parseMaybeFormData(arg1: any, arg2?: any): any {
  // Acepta FormData o JSON plano
  if (arg1 && typeof arg1.get === "function" && !arg2) {
    const fd = arg1 as FormData;
    const jsonParse = (k: string) => {
      const v = fd.get(k);
      if (typeof v !== "string") return undefined;
      try { return JSON.parse(v); } catch { return undefined; }
    };
    return {
      transferId: (fd.get("transferId") as any) ?? undefined,
      cuadrillaId: String(fd.get("cuadrillaId") ?? ""),
      guia: (fd.get("guia") as any) ?? undefined,
      equipos: jsonParse("equipos") ?? [],
      materiales: jsonParse("materiales") ?? [],
      bobinasResidenciales: jsonParse("bobinasResidenciales") ?? undefined,
      observacion: (fd.get("observacion") as any) ?? undefined,
    };
  }
  return arg1;
}

export async function despacharInstalacionesAction(arg1: any, arg2?: any): Promise<TransferOk | { ok: false; error: { formErrors: string[] } }> {
  await requireServerPermission("EQUIPOS_DESPACHO");
  await requireServerPermission("MATERIALES_TRANSFER_SERVICIO");
  try {
    const raw = parseMaybeFormData(arg1, arg2);
    const input = DespachoInstalacionesInputSchema.parse(raw) as DespachoInstalacionesInput;

    const db = adminDb();
    const transferId = input.transferId || generateTransferId();
    const guia = input.guia || (await nextGuia("DESP"));
    const d = toDatePartsLima(new Date());

    // Validar cuadrilla real
    const cuadSnap = await db.collection("cuadrillas").doc(input.cuadrillaId).get();
    if (!cuadSnap.exists) throw new Error("INVALID_CUADRILLA");
    const cuad = cuadSnap.data() as any;
    if ((cuad.area || "") !== "INSTALACIONES") throw new Error("INVALID_CUADRILLA");
    const segmento: "RESIDENCIAL" | "CONDOMINIO" = (cuad.segmento || "RESIDENCIAL").toUpperCase();

    // Handle equipos in chunks
    const eqSet = uniqueStrings(input.equipos || []);
    const itemsEquipos: { sn: string; status: "OK" | "ERROR"; reason?: string }[] = [];
    const movedTypes: Record<string, number> = {};
    let countONT = 0;
    const movedTypes: Record<string, number> = {};
    const chunkSize = 20;
    for (let i = 0; i < eqSet.length; i += chunkSize) {
      const part = eqSet.slice(i, i + chunkSize);
      await db.runTransaction(async (tx) => {
        for (const sn of part) {
          try {
            const ref = db.collection("equipos").doc(sn);
            const snap = await tx.get(ref);
            if (!snap.exists) {
              itemsEquipos.push({ sn, status: "ERROR", reason: "EQUIPO_NOT_FOUND" });
              continue;
            }
            const e = snap.data() as any;
            if ((e.ubicacion || "") !== "ALMACEN") {
              itemsEquipos.push({ sn, status: "ERROR", reason: "EQUIPO_NOT_IN_ALMACEN" });
              continue;
            }
            const loc = normalizeUbicacion(input.cuadrillaId);
            if (!loc.isCuadrilla) {
              itemsEquipos.push({ sn, status: "ERROR", reason: "CUADRILLA_INVALID" });
              continue;
            }
            tx.update(ref, {
              ubicacion: loc.ubicacion,
              estado: loc.estado,
              f_despachoAt: d.at,
              f_despachoYmd: d.ymd,
              f_despachoHm: d.hm,
              guia_despacho: guia,
              audit: { ...(e.audit || {}), updatedAt: FieldValue.serverTimestamp() },
            });
            const tipoEq = String(e.equipo || "").toUpperCase();
            if (tipoEq === "ONT") countONT++;
            movedTypes[tipoEq] = (movedTypes[tipoEq] || 0) + 1;
            itemsEquipos.push({ sn, status: "OK" });
          } catch (err: any) {
            itemsEquipos.push({ sn: sn, status: "ERROR", reason: String(err?.message || "ERROR") });
          }
        }
      });
    }

    // Materiales consolidation + bobinas residenciales
    const materialesMap = new Map<string, { und: number; metros: number }>();
    for (const m of input.materiales || []) {
      const key = m.materialId;
      const prev = materialesMap.get(key) || { und: 0, metros: 0 };
      materialesMap.set(key, { und: prev.und + Math.floor(m.und || 0), metros: prev.metros + (m.metros || 0) });
    }
    // Agregar kit base por ONT (UND)
    if (countONT > 0) {
      for (const [matId, perOnt] of Object.entries(KIT_BASE_POR_ONT)) {
        const prev = materialesMap.get(matId) || { und: 0, metros: 0 };
        materialesMap.set(matId, { und: prev.und + perOnt * countONT, metros: prev.metros });
      }
    }

    // Bobinas (RESIDENCIAL): cada código suma 1000 m al material BOBINA y crea doc en cuadrilla
    const bobinas = segmento === "RESIDENCIAL" ? (input.bobinasResidenciales || []).map((b) => normalizeBobinaCode(b.codigoRaw)) : [];
    if (bobinas.length) {
      const prev = materialesMap.get("BOBINA") || { und: 0, metros: 0 };
      materialesMap.set("BOBINA", { und: prev.und, metros: prev.metros + bobinas.length * 1000 });
      // Crear docs de bobina
      await db.runTransaction(async (tx) => {
        for (const code of bobinas) {
          const bRef = db.collection("cuadrillas").doc(input.cuadrillaId).collection("bobinas").doc(code);
          const snap = await tx.get(bRef);
          if (snap.exists && (snap.data() as any)?.estado === "ACTIVA") throw new Error("BOBINA_DUPLICADA_ACTIVA");
          tx.set(bRef, {
            codigo: code,
            materialId: "BOBINA",
            metrosIniciales: 1000,
            metrosRestantes: 1000,
            estado: "ACTIVA",
            guia_despacho: guia,
            f_despachoAt: d.at,
            f_despachoYmd: d.ymd,
            f_despachoHm: d.hm,
            createdAt: FieldValue.serverTimestamp(),
          });
        }
      });
    }

    // Apply materials stock movements per material
  const itemsMateriales: { materialId: string; status: "OK" | "ERROR"; reason?: string }[] = [];
  for (const [materialId, qty] of materialesMap.entries()) {
    try {
      const matDoc = await getMaterialDoc(materialId);
      if (!matDoc) throw new Error("MATERIAL_NOT_FOUND");
      await db.runTransaction(async (tx) => {
        await updateStockTx(tx, {
          from: { type: "ALMACEN", id: "ALMACEN" },
          to: { type: "CUADRILLA", id: input.cuadrillaId },
          material: { id: materialId, unidadTipo: matDoc.unidadTipo },
          und: matDoc.unidadTipo === "UND" ? qty.und : undefined,
          metros: matDoc.unidadTipo === "METROS" ? qty.metros : undefined,
        });
      });
      // Verificar mínimos post-despacho en almacén
      const almSnap = await db.collection("almacen_stock").doc(materialId).get();
      const alm = almSnap.exists ? (almSnap.data() as any) : null;
      if (alm && alm.unidadTipo === "UND") {
        if (typeof alm.minStockUnd === "number" && (alm.stockUnd || 0) < alm.minStockUnd) {
          // add warning (se acumula luego)
        }
      } else if (alm && alm.unidadTipo === "METROS") {
        if (typeof alm.minStockCm === "number" && (alm.stockCm || 0) < alm.minStockCm) {
          // add warning (se acumula luego)
        }
      }
      itemsMateriales.push({ materialId, status: "OK" });
    } catch (err: any) {
      itemsMateriales.push({ materialId, status: "ERROR", reason: String(err?.message || "ERROR") });
    }
  }

    // Ledger
    await adminDb().collection("movimientos_inventario").doc(transferId).set({
      area: "INSTALACIONES",
      tipo: "DESPACHO",
      guia,
      origen: { type: "ALMACEN", id: "ALMACEN" },
      destino: { type: "CUADRILLA", id: input.cuadrillaId },
      itemsEquipos,
      itemsMateriales,
      observacion: input.observacion || "",
      createdAt: FieldValue.serverTimestamp(),
    // KPIs por tipo se calculan v�a movedTypes
    }
    // KPIs básicos: equipos por tipo en almacén/cuadrilla
    try {
      if (Object.keys(movedTypes).length) {
        const almKpiRef = db.collection("kpi_instalaciones").doc("almacen");
        const cuKpiRef = db.collection("kpi_instalaciones").doc(`cuadrilla_${input.cuadrillaId}`);
        const dec: any = {}, inc: any = {};
        for (const [tipoEq, n] of Object.entries(movedTypes)) {
          dec[`equipos_en_almacen_by_tipo.${tipoEq}`] = FieldValue.increment(-Number(n));
          inc[`equipos_en_cuadrilla_by_tipo.${tipoEq}`] = FieldValue.increment(Number(n));
        }
        await almKpiRef.set({ ...dec, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        await cuKpiRef.set({ ...inc, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    } catch {}

    // Daily counts
    const ymd = d.ymd || new Date().toISOString().slice(0, 10);
    await db.collection("kpi_daily_instalaciones").doc(ymd).set({ equipos_despachos_count: FieldValue.increment(itemsEquipos.filter(x=>x.status==='OK').length), materiales_despachos_count: FieldValue.increment(itemsMateriales.filter(x=>x.status==='OK').length), updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    // Recomputa warnings mínimos (post-despacho) de forma consolidada
    const warnings: string[] = [];
    try {
      for (const [materialId] of materialesMap.entries()) {
        const almSnap2 = await db.collection("almacen_stock").doc(materialId).get();
        if (!almSnap2.exists) continue;
        const alm2: any = almSnap2.data();
        if (alm2?.unidadTipo === "UND") {
          if (typeof alm2.minStockUnd === "number" && (alm2.stockUnd || 0) < alm2.minStockUnd) {
            warnings.push(`Material ${materialId} por debajo del mínimo (UND)`);
          }
        } else if (alm2?.unidadTipo === "METROS") {
          if (typeof alm2.minStockCm === "number" && (alm2.stockCm || 0) < alm2.minStockCm) {
            warnings.push(`Material ${materialId} por debajo del mínimo (METROS)`);
          }
        }
      }
    } catch {}

    const resumen = {
      equipos: { ok: itemsEquipos.filter((x) => x.status === "OK").length, fail: itemsEquipos.filter((x) => x.status === "ERROR").length },
      materiales: { ok: itemsMateriales.filter((x) => x.status === "OK").length, fail: itemsMateriales.filter((x) => x.status === "ERROR").length },
      warnings,
    };
    return { ok: true, transferId, guia, resumen, itemsEquipos, itemsMateriales };
  } catch (e: any) {
    const code = String(e?.message ?? "ERROR");
    if (e?.issues) {
      const msgs = (e.issues as any[]).map((i) => String(i?.message ?? "INVALID")).slice(0, 5);
      return { ok: false, error: { formErrors: msgs } };
    }
    return { ok: false, error: { formErrors: [code] } };
  }
}

export async function devolverInstalacionesAction(arg1: any, arg2?: any): Promise<TransferOk | { ok: false; error: { formErrors: string[] } }> {
  await requireServerPermission("EQUIPOS_DEVOLUCION");
  await requireServerPermission("MATERIALES_DEVOLUCION");
  try {
    const raw = parseMaybeFormData(arg1, arg2);
    const input = DevolucionInstalacionesInputSchema.parse(raw) as DevolucionInstalacionesInput;

    const db = adminDb();
    const transferId = input.transferId || generateTransferId();
    const guia = input.guia || (await nextGuia("DEV"));
    const d = toDatePartsLima(new Date());

    // Validar cuadrilla real
    const cuadSnap = await db.collection("cuadrillas").doc(input.cuadrillaId).get();
    if (!cuadSnap.exists) throw new Error("INVALID_CUADRILLA");
    const cuad = cuadSnap.data() as any;
    if ((cuad.area || "") !== "INSTALACIONES") throw new Error("INVALID_CUADRILLA");
    const segmento: "RESIDENCIAL" | "CONDOMINIO" = (cuad.segmento || "RESIDENCIAL").toUpperCase();

    const eqSet = uniqueStrings(input.equipos || []);
    const itemsEquipos: { sn: string; status: "OK" | "ERROR"; reason?: string }[] = [];
    const chunkSize = 20;
    for (let i = 0; i < eqSet.length; i += chunkSize) {
      const part = eqSet.slice(i, i + chunkSize);
      await db.runTransaction(async (tx) => {
        for (const sn of part) {
          try {
            const ref = db.collection("equipos").doc(sn);
            const snap = await tx.get(ref);
            if (!snap.exists) {
              itemsEquipos.push({ sn, status: "ERROR", reason: "EQUIPO_NOT_FOUND" });
              continue;
            }
            const e = snap.data() as any;
            if ((e.ubicacion || "") !== normalizeUbicacion(input.cuadrillaId).ubicacion) {
              itemsEquipos.push({ sn, status: "ERROR", reason: "EQUIPO_NOT_IN_CUADRILLA" });
              continue;
            }
            tx.update(ref, {
              ubicacion: "ALMACEN",
              estado: "ALMACEN",
              f_devolucionAt: d.at,
              f_devolucionYmd: d.ymd,
              f_devolucionHm: d.hm,
              guia_devolucion: guia,
              audit: { ...(e.audit || {}), updatedAt: FieldValue.serverTimestamp() },
            });
            const tipoEq = String(e.equipo || "").toUpperCase();
            movedTypes[tipoEq] = (movedTypes[tipoEq] || 0) + 1;
            itemsEquipos.push({ sn, status: "OK" });
          } catch (err: any) {
            itemsEquipos.push({ sn: sn, status: "ERROR", reason: String(err?.message || "ERROR") });
          }
        }
      });
    }

    // Materiales consolidation
    const materialesMap = new Map<string, { und: number; metros: number }>();
    for (const m of input.materiales || []) {
      const key = m.materialId;
      const prev = materialesMap.get(key) || { und: 0, metros: 0 };
      materialesMap.set(key, { und: prev.und + Math.floor(m.und || 0), metros: prev.metros + (m.metros || 0) });
    }
    // Bobinas residenciales: marcar DEVUELTA y ajustar -1000 m en cuadrilla y +1000 m en almacén
    const bobinas = segmento === "RESIDENCIAL" ? (input.bobinasResidenciales || []).map((b) => String(b.codigo || "").toUpperCase()) : [];
    if (bobinas.length) {
      const prev = materialesMap.get("BOBINA") || { und: 0, metros: 0 };
      materialesMap.set("BOBINA", { und: prev.und, metros: prev.metros + bobinas.length * 1000 });
      await db.runTransaction(async (tx) => {
        for (const code of bobinas) {
          const bRef = db.collection("cuadrillas").doc(input.cuadrillaId).collection("bobinas").doc(code);
          const snap = await tx.get(bRef);
          if (!snap.exists || (snap.data() as any)?.estado !== "ACTIVA") throw new Error("BOBINA_NO_ENCONTRADA_O_NO_ACTIVA");
          tx.update(bRef, {
            estado: "DEVUELTA",
            guia_devolucion: guia,
            f_devolucionAt: d.at,
            f_devolucionYmd: d.ymd,
            f_devolucionHm: d.hm,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      });
    }

  const itemsMateriales: { materialId: string; status: "OK" | "ERROR"; reason?: string }[] = [];
  for (const [materialId, qty] of materialesMap.entries()) {
    try {
      const matDoc = await getMaterialDoc(materialId);
      if (!matDoc) throw new Error("MATERIAL_NOT_FOUND");
      await db.runTransaction(async (tx) => {
        await updateStockTx(tx, {
          from: { type: "CUADRILLA", id: input.cuadrillaId },
          to: { type: "ALMACEN", id: "ALMACEN" },
          material: { id: materialId, unidadTipo: matDoc.unidadTipo },
          und: matDoc.unidadTipo === "UND" ? qty.und : undefined,
          metros: matDoc.unidadTipo === "METROS" ? qty.metros : undefined,
        });
      });
      itemsMateriales.push({ materialId, status: "OK" });
    } catch (err: any) {
      itemsMateriales.push({ materialId, status: "ERROR", reason: String(err?.message || "ERROR") });
    }
  }

    await adminDb().collection("movimientos_inventario").doc(transferId).set({
      area: "INSTALACIONES",
      tipo: "DEVOLUCION",
      guia,
      origen: { type: "CUADRILLA", id: input.cuadrillaId },
      destino: { type: "ALMACEN", id: "ALMACEN" },
      itemsEquipos,
      itemsMateriales,
      observacion: input.observacion || "",
      createdAt: FieldValue.serverTimestamp(),
    });

    // KPIs básicos: revertir por tipo en almacén/cuadrilla
    try {
      if (Object.keys(movedTypes).length) {
        const almKpiRef = db.collection("kpi_instalaciones").doc("almacen");
        const cuKpiRef = db.collection("kpi_instalaciones").doc(`cuadrilla_${input.cuadrillaId}`);
        const inc: any = {}, dec: any = {};
        for (const [tipoEq, n] of Object.entries(movedTypes)) {
          inc[`equipos_en_almacen_by_tipo.${tipoEq}`] = FieldValue.increment(Number(n));
          dec[`equipos_en_cuadrilla_by_tipo.${tipoEq}`] = FieldValue.increment(-Number(n));
        }
        await almKpiRef.set({ ...inc, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        await cuKpiRef.set({ ...dec, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    } catch {}

    const ymd = d.ymd || new Date().toISOString().slice(0, 10);
    await db.collection("kpi_daily_instalaciones").doc(ymd).set({ equipos_devoluciones_count: FieldValue.increment(itemsEquipos.filter(x=>x.status==='OK').length), materiales_devoluciones_count: FieldValue.increment(itemsMateriales.filter(x=>x.status==='OK').length), updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    const resumen = {
      equipos: { ok: itemsEquipos.filter((x) => x.status === "OK").length, fail: itemsEquipos.filter((x) => x.status === "ERROR").length },
      materiales: { ok: itemsMateriales.filter((x) => x.status === "OK").length, fail: itemsMateriales.filter((x) => x.status === "ERROR").length },
      warnings: [] as string[],
    };
    return { ok: true, transferId, guia, resumen, itemsEquipos, itemsMateriales };
  } catch (e: any) {
    const code = String(e?.message ?? "ERROR");
    if (e?.issues) {
      const msgs = (e.issues as any[]).map((i) => String(i?.message ?? "INVALID")).slice(0, 5);
      return { ok: false, error: { formErrors: msgs } };
    }
    return { ok: false, error: { formErrors: [code] } };
  }
}


