"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";

import { requireServerPermission } from "@/core/auth/require";
import { adminDb } from "@/lib/firebase/admin";
import { normalizeUbicacion, toDatePartsLima } from "@/domain/equipos/repo";
import { metersToCm } from "@/domain/materiales/repo";
import { addGlobalNotification } from "@/domain/notificaciones/service";

const PERM = "ORDENES_LIQUIDAR";

const LiquidarOrdenSchema = z.object({
  ordenId: z.string().min(1),
  snsText: z.string().min(1),
  rotuloNapCto: z.string().min(1),
  planGamer: z.string().optional(),
  kitWifiPro: z.string().optional(),
  servicioCableadoMesh: z.string().optional(),
  cat5e: z.coerce.number().int().nonnegative().default(0),
  cat6: z.coerce.number().int().nonnegative().default(0),
  puntosUTP: z.coerce.number().int().nonnegative().default(0),
  observacion: z.string().optional(),
});

const CorregirOrdenSchema = z.object({
  ordenId: z.string().min(1),
  motivo: z.string().optional(),
});

type LiquidarResult =
  | {
      ok: true;
      resumen: { equipos: number; materiales: number };
      details: {
        codigoCliente: string;
        cliente: string;
        cuadrilla: string;
        fechaOrdenYmd: string;
        ont: { sn: string; proid: string } | null;
        mesh: number;
        box: number;
        gamer: boolean;
        kitWifiPro: boolean;
        cableadoMesh: boolean;
        cat5e: number;
        cat6: number;
        puntosUTP: number;
        liquidadoPor: string;
      };
    }
  | {
      ok: false;
      error: { formErrors: string[] };
    };

type CorregirResult =
  | {
      ok: true;
      codigoCliente: string;
      cliente: string;
    }
  | {
      ok: false;
      error: { formErrors: string[] };
    };

type LiquidarDetails = Extract<LiquidarResult, { ok: true }>["details"];

function uniqStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => String(v || "").trim()).filter(Boolean)));
}

function parseSns(text: string): string[] {
  const raw = String(text || "")
    .split(/\r?\n|,|;|\t/g)
    .map((v) => v.trim())
    .filter(Boolean);
  return uniqStrings(raw);
}

function formatYmdToDmy(ymd: string): string {
  const parts = String(ymd || "").split("-");
  if (parts.length !== 3) return ymd || "";
  const [y, m, d] = parts;
  if (!y || !m || !d) return ymd || "";
  return `${d}/${m}/${y}`;
}

function datePartsFromOrderYmdHm(
  ymd: string,
  hm: string | undefined,
  fallback: { at: any; ymd: string | null; hm: string | null }
) {
  const y = String(ymd || "").trim();
  const h = String(hm || "").trim();
  const mYmd = y.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const mHm = h.match(/^(\d{1,2}):(\d{2})$/);
  if (!mYmd) {
    return fallback;
  }
  const hh = mHm ? String(mHm[1]).padStart(2, "0") : "12";
  const mm = mHm ? String(mHm[2]).padStart(2, "0") : "00";
  const dt = new Date(`${mYmd[1]}-${mYmd[2]}-${mYmd[3]}T${hh}:${mm}:00-05:00`);
  if (Number.isNaN(dt.getTime())) {
    return fallback;
  }
  const parts = toDatePartsLima(dt);
  return {
    at: parts.at,
    ymd: parts.ymd || y,
    hm: parts.hm || (mHm ? `${hh}:${mm}` : fallback.hm),
  };
}

function parseExpectedCount(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

const KIT_BASE_POR_INSTALACION: Record<string, number> = {
  ACTA: 1,
  CINTILLO_30: 4,
  CINTILLO_BANDERA: 1,
  CONECTOR: 1,
  ACOPLADOR: 1,
  PACHCORD: 1,
  ROSETA: 1,
};

export async function liquidarOrdenAction(_: any, formData: FormData): Promise<LiquidarResult> {
  let session: any;
  try {
    session = await requireServerPermission(PERM);
  } catch (e: any) {
    const code = String(e?.message || "FORBIDDEN");
    return { ok: false, error: { formErrors: [code] } };
  }

  try {
    const parsed = LiquidarOrdenSchema.safeParse({
      ordenId: String(formData.get("ordenId") ?? ""),
      snsText: String(formData.get("snsText") ?? ""),
      rotuloNapCto: String(formData.get("rotuloNapCto") ?? ""),
      planGamer: String(formData.get("planGamer") ?? ""),
      kitWifiPro: String(formData.get("kitWifiPro") ?? ""),
      servicioCableadoMesh: String(formData.get("servicioCableadoMesh") ?? ""),
      cat5e: formData.get("cat5e"),
      cat6: formData.get("cat6"),
      puntosUTP: formData.get("puntosUTP"),
      observacion: String(formData.get("observacion") ?? ""),
    });
    if (!parsed.success) {
      return { ok: false, error: { formErrors: ["FORM_INVALIDO"] } };
    }

    const ordenId = parsed.data.ordenId.trim();
    const sns = parseSns(parsed.data.snsText);
    if (!sns.length) return { ok: false, error: { formErrors: ["SN_REQUERIDO"] } };

    const db = adminDb();
    const d = toDatePartsLima(new Date());

    const matAgg = new Map<string, { und: number; metros: number }>();
    for (const [materialId, und] of Object.entries(KIT_BASE_POR_INSTALACION)) {
      matAgg.set(materialId, { und, metros: 0 });
    }

    const ordenRef = db.collection("ordenes").doc(ordenId);
    const ordenSnap = await ordenRef.get();
    if (!ordenSnap.exists) return { ok: false, error: { formErrors: ["ORDEN_NOT_FOUND"] } };

    const orden = ordenSnap.data() as any;
    const cuadrillaId = String(orden?.cuadrillaId || "").trim();
    if (!cuadrillaId) return { ok: false, error: { formErrors: ["ORDEN_SIN_CUADRILLA"] } };

    let details: any = null;
    await db.runTransaction(async (tx) => {
      const ordSnap = await tx.get(ordenRef);
      if (!ordSnap.exists) throw new Error("ORDEN_NOT_FOUND");
      const ord = ordSnap.data() as any;
      const liqEstado = String(ord?.liquidacion?.estado || "").toUpperCase();
      const correccionPendiente = !!ord?.correccionPendiente;
      if (!correccionPendiente && (liqEstado === "LIQUIDADO" || !!ord?.liquidadoAt)) {
        throw new Error("ORDEN_YA_LIQUIDADA");
      }

      const cliente = String(ord?.cliente || "").trim();
      const codigoCliente = String(ord?.codiSeguiClien || "").trim();
      const ordenFechaYmd = String(ord?.fechaFinVisiYmd || ord?.fSoliYmd || d.ymd || "");
      const ordenFechaHm = String(ord?.fechaFinVisiHm || ord?.fSoliHm || d.hm || "");
      const fechaInstalacion = datePartsFromOrderYmdHm(ordenFechaYmd, ordenFechaHm, d);
      if (!codigoCliente) throw new Error("CODIGO_CLIENTE_REQUIRED");
      const cuadrillaRef = db.collection("cuadrillas").doc(cuadrillaId);
      const cuadrillaSnap = await tx.get(cuadrillaRef);
      if (!cuadrillaSnap.exists) throw new Error("INVALID_CUADRILLA");
      const c = cuadrillaSnap.data() as any;
      const expectedUb = normalizeUbicacion(c?.nombre || cuadrillaId).ubicacion;

      const equipoRefs = sns.map((sn) => db.collection("equipos").doc(sn));
      const seriesRefs = sns.map((sn) =>
        db.collection("cuadrillas").doc(cuadrillaId).collection("equipos_series").doc(sn)
      );
      const eqSnaps = sns.length ? await tx.getAll(...equipoRefs) : [];
      const srSnaps = sns.length ? await tx.getAll(...seriesRefs) : [];
      const eqMap = new Map<string, FirebaseFirestore.DocumentSnapshot>();
      const srMap = new Map<string, FirebaseFirestore.DocumentSnapshot>();
      eqSnaps.forEach((snap) => eqMap.set(snap.id, snap));
      srSnaps.forEach((snap) => srMap.set(snap.id, snap));

      const materialIds = Array.from(matAgg.keys());
      const matRefs = materialIds.map((mid) => db.collection("materiales").doc(mid));
      const stockRefs = materialIds.map((mid) =>
        db.collection("cuadrillas").doc(cuadrillaId).collection("stock").doc(mid)
      );
      const matSnaps = materialIds.length ? await tx.getAll(...matRefs) : [];
      const stockSnaps = materialIds.length ? await tx.getAll(...stockRefs) : [];
      const matMap = new Map<string, FirebaseFirestore.DocumentSnapshot>();
      const stockMap = new Map<string, FirebaseFirestore.DocumentSnapshot>();
      matSnaps.forEach((snap) => matMap.set(snap.id, snap));
      stockSnaps.forEach((snap) => stockMap.set(snap.id, snap));

      const equiposInstalados: Array<{
        sn: string;
        tipo: string;
        proid: string;
        descripcion: string;
      }> = [];
      const equiposItems: Array<{ sn: string; tipo: string; status: "OK" }> = [];
      const movedTypes = new Map<string, number>();

      for (const sn of sns) {
        const equipoRef = db.collection("equipos").doc(sn);
        const seriesRef = db.collection("cuadrillas").doc(cuadrillaId).collection("equipos_series").doc(sn);

        const eqSnap = eqMap.get(sn);
        const srSnap = srMap.get(sn);
        if (!eqSnap?.exists) throw new Error(`EQUIPO_NOT_FOUND ${sn}`);
        if (!srSnap?.exists) throw new Error(`SN_NO_EN_CUADRILLA ${sn}`);

        const eq = eqSnap.data() as any;
        if (String(eq?.ubicacion || "") !== expectedUb) throw new Error(`SN_UBICACION_INVALIDA ${sn}`);

        const tipo = String(eq?.equipo || "UNKNOWN").toUpperCase();
        const stockTipoRef = db.collection("cuadrillas").doc(cuadrillaId).collection("equipos_stock").doc(tipo);
        const proid = String(eq?.proId || eq?.proid || "");
        const descripcion = String(eq?.descripcion || "");

        tx.update(equipoRef, {
          estado: "INSTALADO",
          ubicacion: "INSTALADOS",
          cliente,
          codigoCliente,
          f_instaladoAt: fechaInstalacion.at,
          f_instaladoYmd: fechaInstalacion.ymd,
          f_instaladoHm: fechaInstalacion.hm,
          audit: {
            ...(eq?.audit || {}),
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: session.uid,
          },
        });
        tx.delete(seriesRef);
        tx.set(
          stockTipoRef,
          {
            tipo,
            cantidad: FieldValue.increment(-1),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        movedTypes.set(tipo, (movedTypes.get(tipo) || 0) + 1);
        equiposInstalados.push({ sn, tipo, proid, descripcion });
        equiposItems.push({ sn, tipo, status: "OK" });
      }

      const ontCount = Number(movedTypes.get("ONT") || 0);
      const meshCount = Number(movedTypes.get("MESH") || 0);
      const boxCount = Number(movedTypes.get("BOX") || 0);
      const fonoCount = Number(movedTypes.get("FONO") || 0);
      const expectedMeshMin = Math.min(4, parseExpectedCount(ord?.cantMESHwin));
      const expectedBoxMin = Math.min(4, parseExpectedCount(ord?.cantBOXwin));
      const expectedFonoMin = parseExpectedCount(ord?.cantFONOwin) > 0 ? 1 : 0;

      if (ontCount !== 1) throw new Error("ONT_INVALID_COUNT");
      if (meshCount < expectedMeshMin) throw new Error("MESH_INSUFICIENTE");
      if (boxCount < expectedBoxMin) throw new Error("BOX_INSUFICIENTE");
      if (fonoCount < expectedFonoMin) throw new Error("FONO_INSUFICIENTE");
      if (meshCount > 4) throw new Error("MESH_MAX_4");
      if (boxCount > 4) throw new Error("BOX_MAX_4");
      if (fonoCount > 1) throw new Error("FONO_MAX_1");

      const materialesItems: Array<{ materialId: string; und: number; metros: number; status: "OK" }> = [];
      for (const [materialId, qty] of matAgg.entries()) {
        const matRef = db.collection("materiales").doc(materialId);
        const stockRef = db.collection("cuadrillas").doc(cuadrillaId).collection("stock").doc(materialId);
        const matSnap = matMap.get(materialId);
        const stockSnap = stockMap.get(materialId);
        if (!matSnap?.exists) throw new Error(`MATERIAL_NOT_FOUND ${materialId}`);

        const mat = matSnap.data() as any;
        const stock = stockSnap?.exists ? (stockSnap.data() as any) : null;
        const unidadTipo = String(mat?.unidadTipo || "").toUpperCase() === "METROS" ? "METROS" : "UND";

        if (unidadTipo === "UND") {
          const und = Math.floor(qty.und || 0);
          if (und <= 0) throw new Error(`MATERIAL_CANTIDAD_INVALIDA ${materialId}`);
          const available = Number(stock?.stockUnd || 0);
          if (available - und < 0) throw new Error(`STOCK_INSUFICIENTE_CUADRILLA ${materialId}`);
          tx.update(stockRef, {
            stockUnd: FieldValue.increment(-und),
            updatedAt: FieldValue.serverTimestamp(),
          });
          materialesItems.push({ materialId, und, metros: 0, status: "OK" });
        } else {
          const metros = Number(qty.metros || 0);
          if (metros <= 0) throw new Error(`MATERIAL_METROS_INVALIDOS ${materialId}`);
          const needCm = metersToCm(metros);
          const available = Number(stock?.stockCm || 0);
          if (available - needCm < 0) throw new Error(`STOCK_INSUFICIENTE_CUADRILLA ${materialId}`);
          tx.update(stockRef, {
            stockCm: FieldValue.increment(-needCm),
            updatedAt: FieldValue.serverTimestamp(),
          });
          materialesItems.push({ materialId, und: 0, metros, status: "OK" });
        }
      }

      const instalacionesRef = db.collection("instalaciones").doc(codigoCliente);
      const equiposByTipo = Object.fromEntries(
        Array.from(movedTypes.entries()).map(([tipo, count]) => [tipo, count])
      );
      const firstOnt = equiposInstalados.find((e) => String(e.tipo || "").toUpperCase() === "ONT");
      const planGamer = String(parsed.data.planGamer || "").trim();
      const kitWifiPro = String(parsed.data.kitWifiPro || "").trim();
      const servicioCableadoMesh = String(parsed.data.servicioCableadoMesh || "").trim();
      const cat5e = Number(parsed.data.cat5e || 0);
      const cat6 = Number(parsed.data.cat6 || 0);
      const puntosUTP = Number(parsed.data.puntosUTP || 0);
        tx.set(
          instalacionesRef,
          {
            codigoCliente,
          cliente,
          ordenDocId: ordenId,
          ordenId: String(ord?.ordenId || ordenId),
          cuadrillaId,
          cuadrillaNombre: String(ord?.cuadrillaNombre || c?.nombre || cuadrillaId),
          tipoCuadrilla: String(c?.segmento || c?.categoria || c?.r_c || ""),
          fechaInstalacionAt: fechaInstalacion.at,
          fechaInstalacionYmd: fechaInstalacion.ymd,
          fechaInstalacionHm: fechaInstalacion.hm,
          fechaOrdenYmd: ordenFechaYmd,
          estado: String(ord?.estado || ""),
          tipo: String(ord?.tipo || ord?.tipoTraba || ""),
          plan: String(ord?.plan || ord?.idenServi || ""),
          direccion: String(ord?.direccion || ord?.direccion1 || ""),
          telefono: String(ord?.telefono || ""),
          documento: String(ord?.numeroDocumento || ""),
          llamadas: {
            estadoLlamada: String(ord?.estadoLlamada || ""),
            horaInicioLlamada: String(ord?.horaInicioLlamada || ""),
            horaFinLlamada: String(ord?.horaFinLlamada || ""),
            observacionLlamada: String(ord?.observacionLlamada || ""),
          },
          equiposInstalados,
          equiposByTipo,
          materialesConsumidos: materialesItems,
            liquidacion: {
              estado: "LIQUIDADO",
            at: d.at,
            ymd: d.ymd,
            hm: d.hm,
            by: session.uid,
            rotuloNapCto: String(parsed.data.rotuloNapCto || ""),
            observacion: String(parsed.data.observacion || ""),
              servicios: {
                planGamer,
                kitWifiPro,
                servicioCableadoMesh,
                cat5e,
                cat6,
                puntosUTP,
              },
            },
            correccionPendiente: false,
            orden: ord,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

      details = {
        codigoCliente,
        cliente,
        cuadrilla: String(ord?.cuadrillaNombre || c?.nombre || cuadrillaId),
        fechaOrdenYmd: ordenFechaYmd,
        ont: firstOnt ? { sn: firstOnt.sn, proid: firstOnt.proid || "" } : null,
        mesh: Number(movedTypes.get("MESH") || 0),
        box: Number(movedTypes.get("BOX") || 0),
        gamer: !!planGamer,
        kitWifiPro: !!kitWifiPro,
        cableadoMesh: !!servicioCableadoMesh,
        cat5e,
        cat6,
        puntosUTP,
        liquidadoPor: "",
      };

      const movimientoRef = db.collection("movimientos_inventario").doc(`LIQ-ORD-${ordenId}`);
      tx.set(
        movimientoRef,
        {
          area: "INSTALACIONES",
          tipo: "LIQUIDACION_ORDEN",
          ordenId,
          origen: { type: "CUADRILLA", id: cuadrillaId },
          destino: { type: "INSTALADO", id: codigoCliente || cliente || ordenId },
          itemsEquipos: equiposItems,
          itemsMateriales: materialesItems,
          observacion: String(parsed.data.observacion || ""),
          rotuloNapCto: String(parsed.data.rotuloNapCto || ""),
          servicios: {
            planGamer: String(parsed.data.planGamer || ""),
            kitWifiPro: String(parsed.data.kitWifiPro || ""),
            servicioCableadoMesh: String(parsed.data.servicioCableadoMesh || ""),
            cat5e: Number(parsed.data.cat5e || 0),
            cat6: Number(parsed.data.cat6 || 0),
            puntosUTP: Number(parsed.data.puntosUTP || 0),
          },
          createdAt: FieldValue.serverTimestamp(),
          createdBy: session.uid,
        },
        { merge: false }
      );

        tx.set(
          ordenRef,
          {
            liquidacion: {
              estado: "LIQUIDADO",
            at: FieldValue.serverTimestamp(),
            ymd: d.ymd,
            hm: d.hm,
            by: session.uid,
            cliente,
            codigoCliente,
            cuadrillaId,
            equiposCount: equiposItems.length,
            materialesCount: materialesItems.length,
            rotuloNapCto: String(parsed.data.rotuloNapCto || ""),
            observacion: String(parsed.data.observacion || ""),
              servicios: {
                planGamer: String(parsed.data.planGamer || ""),
                kitWifiPro: String(parsed.data.kitWifiPro || ""),
                servicioCableadoMesh: String(parsed.data.servicioCableadoMesh || ""),
                cat5e: Number(parsed.data.cat5e || 0),
                cat6: Number(parsed.data.cat6 || 0),
                puntosUTP: Number(parsed.data.puntosUTP || 0),
              },
            },
            correccionPendiente: false,
            liquidadoAt: FieldValue.serverTimestamp(),
          liquidadoYmd: d.ymd,
          liquidadoBy: session.uid,
          "audit.updatedAt": FieldValue.serverTimestamp(),
          "audit.updatedBy": session.uid,
        },
        { merge: true }
      );
    });

    try {
      const ord = ordenSnap.data() as any;
      const cliente = String(ord?.cliente || "").trim();
      const codiSeguiClien = String(ord?.codiSeguiClien || "").trim();
      let liquidadoPor = session.uid;
      try {
        const uSnap = await adminDb().collection("usuarios").doc(session.uid).get();
        if (uSnap.exists) {
          const u = uSnap.data() as any;
          const full = `${String(u?.nombres || "").trim()} ${String(u?.apellidos || "").trim()}`.trim();
          if (full) liquidadoPor = full;
        }
      } catch {}

      if (details) {
        details.liquidadoPor = liquidadoPor;
      }

      const fechaOrden = formatYmdToDmy(String(ord?.fechaFinVisiYmd || ord?.fSoliYmd || ""));
      const cuadrillaNombre = String(ord?.cuadrillaNombre || ord?.cuadrillaId || "");
      await addGlobalNotification({
        title: "Liquidacion",
        message: `\u2705 Cliente: ${cliente || codiSeguiClien || "cliente"} \u2022 Pedido: ${codiSeguiClien || ordenId} \u2022 Cuadrilla: ${cuadrillaNombre || "-"} \u2022 Liquidado por: ${liquidadoPor} \u2022 Fecha: ${fechaOrden || "-"}`,
        type: "success",
        scope: "ALL",
        createdBy: session.uid,
        entityType: "ORDENES",
        entityId: codiSeguiClien || ordenId,
        action: "UPDATE",
        estado: "ACTIVO",
      });
    } catch {}

    revalidatePath("/home/ordenes/liquidacion");
    return {
      ok: true,
      resumen: { equipos: sns.length, materiales: matAgg.size },
      details: details || {
        codigoCliente: ordenId,
        cliente: "",
        cuadrilla: "",
        fechaOrdenYmd: "",
        ont: null,
        mesh: 0,
        box: 0,
        gamer: false,
        kitWifiPro: false,
        cableadoMesh: false,
        cat5e: 0,
        cat6: 0,
        puntosUTP: 0,
        liquidadoPor: session.uid,
      },
    };
  } catch (e: any) {
    const msg = String(e?.message || "ERROR");
    return { ok: false, error: { formErrors: [msg] } };
  }
}

export async function corregirOrdenAction(_: any, formData: FormData): Promise<CorregirResult> {
  let session: any;
  try {
    session = await requireServerPermission(PERM);
  } catch (e: any) {
    const code = String(e?.message || "FORBIDDEN");
    return { ok: false, error: { formErrors: [code] } };
  }

  try {
    const parsed = CorregirOrdenSchema.safeParse({
      ordenId: String(formData.get("ordenId") ?? ""),
      motivo: String(formData.get("motivo") ?? ""),
    });
    if (!parsed.success) return { ok: false, error: { formErrors: ["FORM_INVALIDO"] } };

    const ordenId = parsed.data.ordenId.trim();
    const motivo = String(parsed.data.motivo || "").trim();

    const db = adminDb();
    const d = toDatePartsLima(new Date());

    const ordenRef = db.collection("ordenes").doc(ordenId);
    const ordenSnap = await ordenRef.get();
    if (!ordenSnap.exists) return { ok: false, error: { formErrors: ["ORDEN_NOT_FOUND"] } };

    const orden = ordenSnap.data() as any;
    const codigoCliente = String(orden?.codiSeguiClien || "").trim();
    if (!codigoCliente) return { ok: false, error: { formErrors: ["CODIGO_CLIENTE_REQUIRED"] } };

    const instalacionesRef = db.collection("instalaciones").doc(codigoCliente);
    const instalacionesSnap = await instalacionesRef.get();
    if (!instalacionesSnap.exists) return { ok: false, error: { formErrors: ["INSTALACION_NOT_FOUND"] } };

    await db.runTransaction(async (tx) => {
      const [ordSnap, instSnap] = await tx.getAll(ordenRef, instalacionesRef);
      if (!ordSnap.exists) throw new Error("ORDEN_NOT_FOUND");
      if (!instSnap.exists) throw new Error("INSTALACION_NOT_FOUND");

      const ord = ordSnap.data() as any;
      const inst = instSnap.data() as any;
      const liqEstado = String(ord?.liquidacion?.estado || "").toUpperCase();
      const instLiqEstado = String(inst?.liquidacion?.estado || "").toUpperCase();
      const liquidada =
        liqEstado === "LIQUIDADO" ||
        !!ord?.liquidadoAt ||
        (instLiqEstado === "LIQUIDADO" && !inst?.correccionPendiente);
      if (!liquidada) throw new Error("ORDEN_NO_LIQUIDADA");
      if (!!ord?.correccionPendiente) throw new Error("ORDEN_YA_CORREGIDA_PENDIENTE");

      const cuadrillaId = String(ord?.cuadrillaId || "").trim();
      if (!cuadrillaId) throw new Error("ORDEN_SIN_CUADRILLA");

      const cuadrillaRef = db.collection("cuadrillas").doc(cuadrillaId);
      const cuadrillaSnap = await tx.get(cuadrillaRef);
      if (!cuadrillaSnap.exists) throw new Error("INVALID_CUADRILLA");
      const c = cuadrillaSnap.data() as any;
      const expectedUb = normalizeUbicacion(c?.nombre || cuadrillaId).ubicacion;
      const expectedEstado = normalizeUbicacion(c?.nombre || cuadrillaId).estado;

      const equiposInstalados: Array<{ sn: string; tipo?: string; proid?: string; descripcion?: string }> =
        Array.isArray(inst?.equiposInstalados) ? inst.equiposInstalados : [];

      const sns = uniqStrings(equiposInstalados.map((e) => e.sn));
      const eqRefs = sns.map((sn) => db.collection("equipos").doc(sn));
      const srRefs = sns.map((sn) =>
        db.collection("cuadrillas").doc(cuadrillaId).collection("equipos_series").doc(sn)
      );
      const eqSnaps = sns.length ? await tx.getAll(...eqRefs) : [];
      const srSnaps = sns.length ? await tx.getAll(...srRefs) : [];
      const eqMap = new Map(eqSnaps.map((s) => [s.id, s]));
      const srMap = new Map(srSnaps.map((s) => [s.id, s]));

      const byTipo = new Map<string, number>();

      for (const sn of sns) {
        const eqSnap = eqMap.get(sn);
        if (!eqSnap?.exists) throw new Error(`EQUIPO_NOT_FOUND ${sn}`);
        const eq = eqSnap.data() as any;
        const tipo = String(eq?.equipo || "UNKNOWN").toUpperCase();

        const equipoRef = db.collection("equipos").doc(sn);
        const seriesRef = db.collection("cuadrillas").doc(cuadrillaId).collection("equipos_series").doc(sn);
        const stockTipoRef = db.collection("cuadrillas").doc(cuadrillaId).collection("equipos_stock").doc(tipo);

        tx.update(equipoRef, {
          ubicacion: expectedUb,
          estado: expectedEstado,
          audit: {
            ...(eq?.audit || {}),
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: session.uid,
          },
        });

        if (!srMap.get(sn)?.exists) {
          tx.set(seriesRef, {
            SN: sn,
            equipo: tipo,
            descripcion: String(eq?.descripcion || ""),
            ubicacion: expectedUb,
            estado: expectedEstado,
            guia_despacho: "",
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        tx.set(
          stockTipoRef,
          {
            tipo,
            cantidad: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        byTipo.set(tipo, (byTipo.get(tipo) || 0) + 1);
      }

        tx.set(
          instalacionesRef,
          {
            correccionPendiente: true,
            corregidaAt: FieldValue.serverTimestamp(),
            corregidaYmd: d.ymd,
            corregidaHm: d.hm,
            corregidaBy: session.uid,
            corregidaMotivo: motivo || "",
            equiposInstalados: [],
            equiposByTipo: {},
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        tx.set(
          ordenRef,
          {
            correccionPendiente: true,
            correccionAt: FieldValue.serverTimestamp(),
            correccionYmd: d.ymd,
            correccionHm: d.hm,
            correccionBy: session.uid,
            correccionMotivo: motivo || "",
            liquidadoAt: FieldValue.delete(),
            liquidadoBy: FieldValue.delete(),
            liquidadoYmd: FieldValue.delete(),
            "audit.updatedAt": FieldValue.serverTimestamp(),
            "audit.updatedBy": session.uid,
          },
          { merge: true }
        );
    });

      const cliente = String(orden?.cliente || "").trim();
      const codiSeguiClien = String(orden?.codiSeguiClien || "").trim();
      const cuadrillaNombre = String(orden?.cuadrillaNombre || orden?.cuadrillaId || "").trim();
      const fechaOrden = formatYmdToDmy(String(orden?.fechaFinVisiYmd || orden?.fSoliYmd || ""));
      let corregidoPor = session.uid;
      try {
        const uSnap = await adminDb().collection("usuarios").doc(session.uid).get();
        const u = uSnap.data() as any;
        const full = `${u?.nombres || ""} ${u?.apellidos || ""}`.trim();
        if (full) corregidoPor = full;
      } catch {}

      try {
        await addGlobalNotification({
          title: "Orden corregida",
          message: `\u2705 Cliente: ${cliente || codiSeguiClien || "cliente"} \u2022 Pedido: ${codiSeguiClien || ordenId} \u2022 Cuadrilla: ${cuadrillaNombre || "-"} \u2022 Corregido por: ${corregidoPor} \u2022 Fecha: ${fechaOrden || "-"}`,
          type: "warn",
          scope: "ALL",
          createdBy: session.uid,
          entityType: "ORDENES",
          entityId: codiSeguiClien || ordenId,
          action: "UPDATE",
          estado: "ACTIVO",
        });
      } catch {}

      revalidatePath("/home/ordenes/liquidacion");
      return { ok: true, codigoCliente, cliente };
  } catch (e: any) {
    const msg = String(e?.message || "ERROR");
    return { ok: false, error: { formErrors: [msg] } };
  }
}
