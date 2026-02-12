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

type LiquidarResult =
  | {
      ok: true;
      resumen: { equipos: number; materiales: number };
    }
  | {
      ok: false;
      error: { formErrors: string[] };
    };

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

    await db.runTransaction(async (tx) => {
      const ordSnap = await tx.get(ordenRef);
      if (!ordSnap.exists) throw new Error("ORDEN_NOT_FOUND");
      const ord = ordSnap.data() as any;
      const liqEstado = String(ord?.liquidacion?.estado || "").toUpperCase();
      if (liqEstado === "LIQUIDADO" || !!ord?.liquidadoAt) throw new Error("ORDEN_YA_LIQUIDADA");

      const cliente = String(ord?.cliente || "").trim();
      const codigoCliente = String(ord?.codiSeguiClien || "").trim();
      const cuadrillaRef = db.collection("cuadrillas").doc(cuadrillaId);
      const cuadrillaSnap = await tx.get(cuadrillaRef);
      if (!cuadrillaSnap.exists) throw new Error("INVALID_CUADRILLA");
      const c = cuadrillaSnap.data() as any;
      const expectedUb = normalizeUbicacion(c?.nombre || cuadrillaId).ubicacion;

      const equiposItems: Array<{ sn: string; tipo: string; status: "OK" }> = [];
      const movedTypes = new Map<string, number>();

      for (const sn of sns) {
        const equipoRef = db.collection("equipos").doc(sn);
        const seriesRef = db.collection("cuadrillas").doc(cuadrillaId).collection("equipos_series").doc(sn);

        const [eqSnap, srSnap] = await Promise.all([tx.get(equipoRef), tx.get(seriesRef)]);
        if (!eqSnap.exists) throw new Error(`EQUIPO_NOT_FOUND ${sn}`);
        if (!srSnap.exists) throw new Error(`SN_NO_EN_CUADRILLA ${sn}`);

        const eq = eqSnap.data() as any;
        if (String(eq?.ubicacion || "") !== expectedUb) throw new Error(`SN_UBICACION_INVALIDA ${sn}`);

        const tipo = String(eq?.equipo || "UNKNOWN").toUpperCase();
        const stockTipoRef = db.collection("cuadrillas").doc(cuadrillaId).collection("equipos_stock").doc(tipo);

        tx.update(equipoRef, {
          estado: "INSTALADO",
          ubicacion: "INSTALADOS",
          cliente,
          codigoCliente,
          f_instaladoAt: d.at,
          f_instaladoYmd: d.ymd,
          f_instaladoHm: d.hm,
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
        equiposItems.push({ sn, tipo, status: "OK" });
      }

      const materialesItems: Array<{ materialId: string; und: number; metros: number; status: "OK" }> = [];
      for (const [materialId, qty] of matAgg.entries()) {
        const matRef = db.collection("materiales").doc(materialId);
        const stockRef = db.collection("cuadrillas").doc(cuadrillaId).collection("stock").doc(materialId);
        const [matSnap, stockSnap] = await Promise.all([tx.get(matRef), tx.get(stockRef)]);
        if (!matSnap.exists) throw new Error(`MATERIAL_NOT_FOUND ${materialId}`);
        if (!stockSnap.exists) throw new Error(`STOCK_CUADRILLA_NOT_FOUND ${materialId}`);

        const mat = matSnap.data() as any;
        const stock = stockSnap.data() as any;
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
      await addGlobalNotification({
        title: "Liquidacion de orden",
        message: `Orden ${ordenId} liquidada para ${cliente || codiSeguiClien || "cliente"}.`,
        type: "success",
        scope: "ALL",
        createdBy: session.uid,
        entityType: "ORDENES",
        entityId: ordenId,
        action: "UPDATE",
        estado: "ACTIVO",
      });
    } catch {}

    revalidatePath("/home/ordenes/liquidacion");
    return { ok: true, resumen: { equipos: sns.length, materiales: matAgg.size } };
  } catch (e: any) {
    const msg = String(e?.message || "ERROR");
    return { ok: false, error: { formErrors: [msg] } };
  }
}
