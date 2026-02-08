"use server";

import { requireServerPermission } from "@/core/auth/require";
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

function parseMaybeFormData(arg1: any, arg2?: any): any {
  if (typeof arg2 !== "undefined") return arg2;
  if (arg1 && typeof arg1.get === "function" && !arg2) {
    const fd = arg1 as FormData;
    const parseJson = (k: string) => {
      const v = fd.get(k);
      if (typeof v !== "string") return undefined;
      try { return JSON.parse(v); } catch { return undefined; }
    };
    return {
      transferId: (fd.get("transferId") as any) ?? undefined,
      cuadrillaId: String(fd.get("cuadrillaId") ?? ""),
      guia: (fd.get("guia") as any) ?? undefined,
      equipos: parseJson("equipos") ?? [],
      materiales: parseJson("materiales") ?? [],
      bobinasResidenciales: parseJson("bobinasResidenciales") ?? undefined,
      observacion: (fd.get("observacion") as any) ?? undefined,
    };
  }
  return arg1;
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

function uniqueStrings(list: string[]): string[] {
  return Array.from(new Set((list || []).map((s) => String(s || "").trim()).filter(Boolean)));
}

async function getMaterial(materialId: string): Promise<any | null> {
  const snap = await adminDb().collection("materiales").doc(materialId).get();
  return snap.exists ? snap.data() : null;
}

async function updateStockTx(
  tx: FirebaseFirestore.Transaction,
  opts: { from: { type: "ALMACEN" | "CUADRILLA"; id: string }; to: { type: "ALMACEN" | "CUADRILLA"; id: string }; materialId: string; unidadTipo: "UND" | "METROS"; und?: number; metros?: number }
) {
  const db = adminDb();
  const { from, to, materialId, unidadTipo } = opts;
  const und = Math.floor(opts.und || 0);
  const cm = unidadTipo === "METROS" ? metersToCm(opts.metros || 0) : 0;

  const fromRef = from.type === "ALMACEN" ? db.collection("almacen_stock").doc(materialId) : db.collection("cuadrillas").doc(from.id).collection("stock").doc(materialId);
  const toRef = to.type === "ALMACEN" ? db.collection("almacen_stock").doc(materialId) : db.collection("cuadrillas").doc(to.id).collection("stock").doc(materialId);

  const fromSnap = await tx.get(fromRef);
  const toSnap = await tx.get(toRef);
  if (!fromSnap.exists) tx.set(fromRef, { materialId, unidadTipo, stockUnd: 0, stockCm: 0 }, { merge: true });
  if (!toSnap.exists) tx.set(toRef, { materialId, unidadTipo, stockUnd: 0, stockCm: 0 }, { merge: true });
  const fromData = fromSnap.exists ? (fromSnap.data() as any) : { stockUnd: 0, stockCm: 0 };
  if (unidadTipo === "UND") {
    if (from.type === "ALMACEN" && (fromData.stockUnd || 0) - und < 0) throw new Error("STOCK_INSUFICIENTE_ALMACEN");
    tx.update(fromRef, { stockUnd: FieldValue.increment(-und) });
    tx.update(toRef, { stockUnd: FieldValue.increment(und) });
  } else {
    if (from.type === "ALMACEN" && (fromData.stockCm || 0) - cm < 0) throw new Error("STOCK_INSUFICIENTE_ALMACEN");
    tx.update(fromRef, { stockCm: FieldValue.increment(-cm) });
    tx.update(toRef, { stockCm: FieldValue.increment(cm) });
  }
}

export async function despacharInstalacionesAction(arg1: any, arg2?: any): Promise<TransferOk | { ok: false; error: { formErrors: string[] } }> {
  await requireServerPermission("EQUIPOS_DESPACHO");
  await requireServerPermission("MATERIALES_TRANSFER_SERVICIO");
  try {
    const raw = parseMaybeFormData(arg1, arg2);
    const input = DespachoInstalacionesInputSchema.parse(raw) as DespachoInstalacionesInput;

    const db = adminDb();
    const transferId = input.transferId || generateTransferId();
    const existing = await db.collection("movimientos_inventario").doc(transferId).get();
    if (existing.exists) {
      const guiaPrev = (existing.data() as any)?.guia || "";
      return { ok: true, transferId, guia: guiaPrev, resumen: { equipos: { ok: 0, fail: 0 }, materiales: { ok: 0, fail: 0 }, warnings: [] }, itemsEquipos: [], itemsMateriales: [] };
    }
    const guia = input.guia || (await nextGuia("DESP"));
    const d = toDatePartsLima(new Date());

    // Valida cuadrilla area INSTALACIONES
    const cSnap = await db.collection("cuadrillas").doc(input.cuadrillaId).get();
    if (!cSnap.exists) throw new Error("INVALID_CUADRILLA");
    const c = cSnap.data() as any;
    if ((c.area || "") !== "INSTALACIONES") throw new Error("INVALID_CUADRILLA");
    const segmento: "RESIDENCIAL" | "CONDOMINIO" = (c.segmento || "RESIDENCIAL").toUpperCase();
    const loc = normalizeUbicacion(c.nombre || input.cuadrillaId);
    if (!loc.isCuadrilla) throw new Error("CUADRILLA_INVALID");

    // Prevalidacion equipos (no registrar nada si hay errores)
    const sns = uniqueStrings(input.equipos || []);
    let countONT = 0;
    if (sns.length) {
      const refs = sns.map((sn) => db.collection("equipos").doc(sn));
      const snaps = await db.getAll(...refs);
      const byId = new Map(snaps.map((s) => [s.id, s] as const));
      const snErrors: string[] = [];
      for (const sn of sns) {
        const snap = byId.get(sn);
        if (!snap || !snap.exists) {
          snErrors.push(`SN ${sn} no existe`);
          continue;
        }
        const e = snap.data() as any;
        if ((e.ubicacion || "") !== "ALMACEN") {
          const ub = normalizeUbicacion(String(e.ubicacion || "")).ubicacion;
          snErrors.push(`SN ${sn} no esta en almacen (${ub})`);
          continue;
        }
        const tipoEq = String(e.equipo || "").toUpperCase();
        if (tipoEq === "ONT") countONT++;
      }
      if (snErrors.length) {
        return { ok: false, error: { formErrors: snErrors.slice(0, 5) } };
      }
    }

    // Materiales
    const matMap = new Map<string, { und: number; metros: number }>();
    for (const m of input.materiales || []) {
      const prev = matMap.get(m.materialId) || { und: 0, metros: 0 };
      matMap.set(m.materialId, { und: prev.und + Math.floor(m.und || 0), metros: prev.metros + (m.metros || 0) });
    }

    // Bobinas RESIDENCIAL: suman 1000m a material BOBINA y registran codigo
    const bobCodes = segmento === "RESIDENCIAL"
      ? (input.bobinasResidenciales || []).map((b) => normalizeBobinaCode(b.codigoRaw))
      : [];
    if (bobCodes.length) {
      const prev = matMap.get("BOBINA") || { und: 0, metros: 0 };
      matMap.set("BOBINA", { und: prev.und, metros: prev.metros + bobCodes.length * 1000 });
      const bRefs = bobCodes.map((code) =>
        db.collection("cuadrillas").doc(input.cuadrillaId).collection("bobinas").doc(code)
      );
      const bSnaps = await db.getAll(...bRefs);
      const dup = bSnaps.find((s) => s.exists && (s.data() as any)?.estado === "ACTIVA");
      if (dup) {
        return { ok: false, error: { formErrors: ["BOBINA_DUPLICADA_ACTIVA"] } };
      }
    }

    // Kit base por ONT (se suma a materiales antes de validar stock)
    if (countONT > 0) {
      for (const [matId, perOnt] of Object.entries(KIT_BASE_POR_ONT)) {
        const prev = matMap.get(matId) || { und: 0, metros: 0 };
        matMap.set(matId, { und: prev.und + perOnt * countONT, metros: prev.metros });
      }
    }

    // Validar materiales existen y stock suficiente en almacen
    const matIds = Array.from(matMap.keys());
    if (matIds.length) {
      const matRefs = matIds.map((id) => db.collection("materiales").doc(id));
      const matSnaps = await db.getAll(...matRefs);
      const matById = new Map(matSnaps.map((s) => [s.id, s] as const));
      const matErrors: string[] = [];
      for (const id of matIds) {
        const snap = matById.get(id);
        if (!snap || !snap.exists) {
          matErrors.push(`MATERIAL_NOT_FOUND ${id}`);
          continue;
        }
        const mat = snap.data() as any;
        const almRef = db.collection("almacen_stock").doc(id);
        let alm = await almRef.get();
        if (!alm.exists) {
          const base = { materialId: id, unidadTipo: mat.unidadTipo, area: "ALMACEN" };
          if (mat.unidadTipo === "UND") {
            await almRef.set({ ...base, stockUnd: 0, stockCm: 0 }, { merge: true });
          } else {
            await almRef.set({ ...base, stockCm: 0, stockUnd: 0 }, { merge: true });
          }
          alm = await almRef.get();
        }
        if (!alm.exists) {
          matErrors.push(`STOCK_NOT_FOUND ${id}`);
          continue;
        }
        const a = alm.data() as any;
        if (mat.unidadTipo === "UND") {
          const need = matMap.get(id)?.und || 0;
          if ((a.stockUnd || 0) - need < 0) matErrors.push(`STOCK_INSUFICIENTE_ALMACEN ${id}`);
        } else {
          const need = metersToCm(matMap.get(id)?.metros || 0);
          if ((a.stockCm || 0) - need < 0) matErrors.push(`STOCK_INSUFICIENTE_ALMACEN ${id}`);
        }
      }
      if (matErrors.length) {
        return { ok: false, error: { formErrors: matErrors.slice(0, 5) } };
      }
    }

    // Equipos (aplicar movimientos)
    const itemsEquipos: { sn: string; status: "OK" | "ERROR"; reason?: string }[] = [];
    const movedTypes: Record<string, number> = {};
    for (let i = 0; i < sns.length; i += 20) {
      const part = sns.slice(i, i + 20);
      await db.runTransaction(async (tx) => {
        const refs = part.map((sn) => ({
          sn,
          ref: db.collection("equipos").doc(sn),
          markRef: db.collection("transfer_marks").doc(`equipo:${transferId}:${sn}`),
        }));
        const markSnaps = await Promise.all(refs.map((r) => tx.get(r.markRef)));
        const eqSnaps = await Promise.all(refs.map((r) => tx.get(r.ref)));

        // no writes before this point
        for (let idx = 0; idx < refs.length; idx++) {
          const { sn, ref, markRef } = refs[idx];
          const markSnap = markSnaps[idx];
          if (markSnap.exists) { itemsEquipos.push({ sn, status: "OK" }); continue; }
          const snap = eqSnaps[idx];
          if (!snap.exists) { itemsEquipos.push({ sn, status: "ERROR", reason: "EQUIPO_NOT_FOUND" }); continue; }
          const e = snap.data() as any;
          if ((e.ubicacion || "") !== "ALMACEN") { itemsEquipos.push({ sn, status: "ERROR", reason: "EQUIPO_NOT_IN_ALMACEN" }); continue; }
          const loc = normalizeUbicacion(c.nombre || input.cuadrillaId);
          if (!loc.isCuadrilla) { itemsEquipos.push({ sn, status: "ERROR", reason: "CUADRILLA_INVALID" }); continue; }
          tx.update(ref, { ubicacion: loc.ubicacion, estado: loc.estado, f_despachoAt: d.at, f_despachoYmd: d.ymd, f_despachoHm: d.hm, guia_despacho: guia, audit: { ...(e.audit || {}), updatedAt: FieldValue.serverTimestamp() } });
          const tipo = String(e.equipo || "").toUpperCase();
          movedTypes[tipo] = (movedTypes[tipo] || 0) + 1;
          tx.set(markRef, { transferId, type: "EQUIPO", id: sn, appliedAt: FieldValue.serverTimestamp() });
          itemsEquipos.push({ sn, status: "OK" });
        }
      });
    }

    // Crear bobinas residenciales (si aplica)
    if (bobCodes.length) {
      await db.runTransaction(async (tx) => {
        for (const code of bobCodes) {
          const bRef = db.collection("cuadrillas").doc(input.cuadrillaId).collection("bobinas").doc(code);
          tx.set(bRef, { codigo: code, materialId: "BOBINA", metrosIniciales: 1000, metrosRestantes: 1000, estado: "ACTIVA", guia_despacho: guia, f_despachoAt: d.at, f_despachoYmd: d.ymd, f_despachoHm: d.hm, createdAt: FieldValue.serverTimestamp() });
        }
      });
    }

    const itemsMateriales: { materialId: string; status: "OK" | "ERROR"; reason?: string }[] = [];
    for (const [materialId, qty] of matMap.entries()) {
      try {
        const mat = await getMaterial(materialId);
        if (!mat) throw new Error("MATERIAL_NOT_FOUND");
        await db.runTransaction(async (tx) => {
          const markRef = db.collection("transfer_marks").doc(`material:${transferId}:${materialId}`);
          const markSnap = await tx.get(markRef);
          if (!markSnap.exists) {
            await updateStockTx(tx, { from: { type: "ALMACEN", id: "ALMACEN" }, to: { type: "CUADRILLA", id: input.cuadrillaId }, materialId, unidadTipo: mat.unidadTipo, und: mat.unidadTipo === "UND" ? qty.und : undefined, metros: mat.unidadTipo === "METROS" ? qty.metros : undefined });
            tx.set(markRef, { transferId, type: "MATERIAL", id: materialId, appliedAt: FieldValue.serverTimestamp() });
          }
        });
        itemsMateriales.push({ materialId, status: "OK" });
      } catch (e: any) {
        itemsMateriales.push({ materialId, status: "ERROR", reason: String(e?.message || "ERROR") });
      }
    }

    // Ledger
    await db.collection("movimientos_inventario").doc(transferId).set({ area: "INSTALACIONES", tipo: "DESPACHO", guia, origen: { type: "ALMACEN", id: "ALMACEN" }, destino: { type: "CUADRILLA", id: input.cuadrillaId }, itemsEquipos, itemsMateriales, observacion: input.observacion || "", createdAt: FieldValue.serverTimestamp() });

    // KPIs por tipo
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

    // KPIs diarios
    try {
      const ymd = d.ymd || new Date().toISOString().slice(0, 10);
      await db.collection("kpi_daily_instalaciones").doc(ymd).set({ equipos_despachos_count: FieldValue.increment(itemsEquipos.filter(x=>x.status==='OK').length), materiales_despachos_count: FieldValue.increment(itemsMateriales.filter(x=>x.status==='OK').length), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    } catch {}

    // Warnings minimos
    const warnings: string[] = [];
    try {
      for (const [materialId] of matMap.entries()) {
        const almSnap = await db.collection("almacen_stock").doc(materialId).get();
        if (!almSnap.exists) continue;
        const alm: any = almSnap.data();
        if (alm?.unidadTipo === "UND") {
          if (typeof alm.minStockUnd === "number" && (alm.stockUnd || 0) < alm.minStockUnd) warnings.push(`Material ${materialId} por debajo del minimo (UND)`);
        } else if (alm?.unidadTipo === "METROS") {
          if (typeof alm.minStockCm === "number" && (alm.stockCm || 0) < alm.minStockCm) warnings.push(`Material ${materialId} por debajo del minimo (METROS)`);
        }
      }
    } catch {}

    const resumen = { equipos: { ok: itemsEquipos.filter(x=>x.status==='OK').length, fail: itemsEquipos.filter(x=>x.status==='ERROR').length }, materiales: { ok: itemsMateriales.filter(x=>x.status==='OK').length, fail: itemsMateriales.filter(x=>x.status==='ERROR').length }, warnings };
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

    const cSnap = await db.collection("cuadrillas").doc(input.cuadrillaId).get();
    if (!cSnap.exists) throw new Error("INVALID_CUADRILLA");
    const c = cSnap.data() as any;
    if ((c.area || "") !== "INSTALACIONES") throw new Error("INVALID_CUADRILLA");
    const segmento: "RESIDENCIAL" | "CONDOMINIO" = (c.segmento || "RESIDENCIAL").toUpperCase();

    const sns = uniqueStrings(input.equipos || []);
    const itemsEquipos: { sn: string; status: "OK" | "ERROR"; reason?: string }[] = [];
    const movedTypes: Record<string, number> = {};
    for (let i = 0; i < sns.length; i += 20) {
      const part = sns.slice(i, i + 20);
      await db.runTransaction(async (tx) => {
        const refs = part.map((sn) => ({
          sn,
          ref: db.collection("equipos").doc(sn),
        }));
        const eqSnaps = await Promise.all(refs.map((r) => tx.get(r.ref)));
        const expectedUb = normalizeUbicacion(c.nombre || input.cuadrillaId).ubicacion;

        for (let idx = 0; idx < refs.length; idx++) {
          const { sn, ref } = refs[idx];
          const snap = eqSnaps[idx];
          if (!snap.exists) { itemsEquipos.push({ sn, status: "ERROR", reason: "EQUIPO_NOT_FOUND" }); continue; }
          const e = snap.data() as any;
          if ((e.ubicacion || "") !== expectedUb) { itemsEquipos.push({ sn, status: "ERROR", reason: "EQUIPO_NOT_IN_CUADRILLA" }); continue; }
          tx.update(ref, { ubicacion: "ALMACEN", estado: "ALMACEN", f_devolucionAt: d.at, f_devolucionYmd: d.ymd, f_devolucionHm: d.hm, guia_devolucion: guia, audit: { ...(e.audit || {}), updatedAt: FieldValue.serverTimestamp() } });
          const tipo = String(e.equipo || "").toUpperCase();
          movedTypes[tipo] = (movedTypes[tipo] || 0) + 1;
          itemsEquipos.push({ sn, status: "OK" });
        }
      });
    }

    const matMap = new Map<string, { und: number; metros: number }>();
    for (const m of input.materiales || []) {
      const prev = matMap.get(m.materialId) || { und: 0, metros: 0 };
      matMap.set(m.materialId, { und: prev.und + Math.floor(m.und || 0), metros: prev.metros + (m.metros || 0) });
    }
    if (segmento === "RESIDENCIAL") {
      const bobCodes = (input.bobinasResidenciales || []).map((b) => String(b.codigo || "").toUpperCase());
      if (bobCodes.length) {
        const prev = matMap.get("BOBINA") || { und: 0, metros: 0 };
        matMap.set("BOBINA", { und: prev.und, metros: prev.metros + bobCodes.length * 1000 });
        await db.runTransaction(async (tx) => {
          for (const code of bobCodes) {
            const bRef = db.collection("cuadrillas").doc(input.cuadrillaId).collection("bobinas").doc(code);
            const snap = await tx.get(bRef);
            if (!snap.exists || (snap.data() as any)?.estado !== "ACTIVA") throw new Error("BOBINA_NO_ENCONTRADA_O_NO_ACTIVA");
            tx.update(bRef, { estado: "DEVUELTA", guia_devolucion: guia, f_devolucionAt: d.at, f_devolucionYmd: d.ymd, f_devolucionHm: d.hm, updatedAt: FieldValue.serverTimestamp() });
          }
        });
      }
    }

    const itemsMateriales: { materialId: string; status: "OK" | "ERROR"; reason?: string }[] = [];
    for (const [materialId, qty] of matMap.entries()) {
      try {
        const mat = await getMaterial(materialId);
        if (!mat) throw new Error("MATERIAL_NOT_FOUND");
        await db.runTransaction(async (tx) => {
          await updateStockTx(tx, { from: { type: "CUADRILLA", id: input.cuadrillaId }, to: { type: "ALMACEN", id: "ALMACEN" }, materialId, unidadTipo: mat.unidadTipo, und: mat.unidadTipo === "UND" ? qty.und : undefined, metros: mat.unidadTipo === "METROS" ? qty.metros : undefined });
        });
        itemsMateriales.push({ materialId, status: "OK" });
      } catch (e: any) {
        itemsMateriales.push({ materialId, status: "ERROR", reason: String(e?.message || "ERROR") });
      }
    }

    await db.collection("movimientos_inventario").doc(transferId).set({ area: "INSTALACIONES", tipo: "DEVOLUCION", guia, origen: { type: "CUADRILLA", id: input.cuadrillaId }, destino: { type: "ALMACEN", id: "ALMACEN" }, itemsEquipos, itemsMateriales, observacion: input.observacion || "", createdAt: FieldValue.serverTimestamp() });

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

    try {
      const ymd = d.ymd || new Date().toISOString().slice(0, 10);
      await db.collection("kpi_daily_instalaciones").doc(ymd).set({ equipos_devoluciones_count: FieldValue.increment(itemsEquipos.filter(x=>x.status==='OK').length), materiales_devoluciones_count: FieldValue.increment(itemsMateriales.filter(x=>x.status==='OK').length), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    } catch {}

    const resumen = { equipos: { ok: itemsEquipos.filter(x=>x.status==='OK').length, fail: itemsEquipos.filter(x=>x.status==='ERROR').length }, materiales: { ok: itemsMateriales.filter(x=>x.status==='OK').length, fail: itemsMateriales.filter(x=>x.status==='ERROR').length }, warnings: [] as string[] };
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
