"use server";

import { requireServerPermission } from "@/core/auth/require";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { metersToCm } from "@/domain/materiales/repo";
import {
  VentaCreateInputSchema,
  VentaCuotasUpdateSchema,
  VentaPagoInputSchema,
  VentaAnularInputSchema,
  type VentaCreateInput,
} from "@/domain/ventas/schemas";
import { nextVentaId, centsToMoney } from "@/domain/ventas/service";
import { addGlobalNotification } from "@/domain/notificaciones/service";

type VentaItemDoc = {
  materialId: string;
  nombre?: string;
  unidadTipo: "UND" | "METROS";
  und?: number;
  metros?: number;
  precioUnitCents: number;
  subtotalCents: number;
};

function uniqStrings(list: string[]): string[] {
  return Array.from(new Set((list || []).map((s) => String(s || "").trim()).filter(Boolean)));
}

async function getUsuarioDisplayName(uid: string) {
  const snap = await adminDb().collection("usuarios").doc(uid).get();
  if (!snap.exists) return uid;
  const data = snap.data() as any;
  const nombres = String(data?.nombres || "").trim();
  const apellidos = String(data?.apellidos || "").trim();
  const full = `${nombres} ${apellidos}`.trim();
  return shortName(full || uid);
}

async function assertCoordinadorRole(uid: string) {
  const snap = await adminDb().collection("usuarios_access").doc(uid).get();
  if (!snap.exists) throw new Error("COORDINADOR_NOT_FOUND");
  const data = snap.data() as any;
  const roles = Array.isArray(data?.roles) ? data.roles : [];
  if (!roles.includes("COORDINADOR")) throw new Error("COORDINADOR_ROL_INVALIDO");
}

function shortName(name: string) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  const first = parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  return last ? `${first} ${last}` : first;
}

async function updateStockVentasTx(
  tx: FirebaseFirestore.Transaction,
  opts: {
    from: { type: "ALMACEN" | "CUADRILLA" | "COORDINADOR"; id: string };
    to: { type: "ALMACEN" | "CUADRILLA" | "COORDINADOR"; id: string };
    materialId: string;
    unidadTipo: "UND" | "METROS";
    und?: number;
    metros?: number;
  }
) {
  const db = adminDb();
  const { from, to, materialId, unidadTipo } = opts;
  const und = Math.floor(opts.und || 0);
  const cm = unidadTipo === "METROS" ? metersToCm(opts.metros || 0) : 0;

  function stockRef(loc: { type: "ALMACEN" | "CUADRILLA" | "COORDINADOR"; id: string }) {
    if (loc.type === "ALMACEN") return db.collection("almacen_stock").doc(materialId);
    if (loc.type === "COORDINADOR") return db.collection("usuarios").doc(loc.id).collection("stock_ventas").doc(materialId);
    return db.collection("cuadrillas").doc(loc.id).collection("stock_ventas").doc(materialId);
  }

  const fromRef = stockRef(from);
  const toRef = stockRef(to);

  const fromSnap = await tx.get(fromRef);
  const toSnap = await tx.get(toRef);

  if (!fromSnap.exists) {
    tx.set(fromRef, { materialId, unidadTipo, stockUnd: 0, stockCm: 0 }, { merge: true });
  }
  if (!toSnap.exists) {
    tx.set(toRef, { materialId, unidadTipo, stockUnd: 0, stockCm: 0 }, { merge: true });
  }

  const fromData = fromSnap.exists ? (fromSnap.data() as any) : { stockUnd: 0, stockCm: 0 };

  if (unidadTipo === "UND") {
    if (from.type === "ALMACEN" && (fromData.stockUnd || 0) - und < 0) throw new Error("STOCK_INSUFICIENTE_ALMACEN");
    if (from.type === "CUADRILLA" && (fromData.stockUnd || 0) - und < 0) throw new Error("STOCK_INSUFICIENTE_CUADRILLA");
    if (from.type === "COORDINADOR" && (fromData.stockUnd || 0) - und < 0) throw new Error("STOCK_INSUFICIENTE_COORDINADOR");
    tx.update(fromRef, { stockUnd: FieldValue.increment(-und) });
    tx.update(toRef, { stockUnd: FieldValue.increment(und) });
  } else {
    if (from.type === "ALMACEN" && (fromData.stockCm || 0) - cm < 0) throw new Error("STOCK_INSUFICIENTE_ALMACEN");
    if (from.type === "CUADRILLA" && (fromData.stockCm || 0) - cm < 0) throw new Error("STOCK_INSUFICIENTE_CUADRILLA");
    if (from.type === "COORDINADOR" && (fromData.stockCm || 0) - cm < 0) throw new Error("STOCK_INSUFICIENTE_COORDINADOR");
    tx.update(fromRef, { stockCm: FieldValue.increment(-cm) });
    tx.update(toRef, { stockCm: FieldValue.increment(cm) });
  }
}

export async function crearVentaAction(raw: any) {
  const input = VentaCreateInputSchema.parse(raw) as VentaCreateInput;

  const perm = input.area === "INSTALACIONES" ? "VENTAS_DESPACHO_INST" : "VENTAS_DESPACHO_AVER";
  const session = await requireServerPermission(perm);

  const canEditPrecio = session.permissions.includes("VENTAS_EDIT") || session.isAdmin;
  const canEditCoordinador = session.permissions.includes("VENTAS_EDIT") || session.isAdmin;

  const db = adminDb();
  let cuad: any = null;
  if (input.cuadrillaId) {
    const cuadSnap = await db.collection("cuadrillas").doc(input.cuadrillaId).get();
    if (!cuadSnap.exists) return { ok: false, error: { formErrors: ["INVALID_CUADRILLA"] } } as const;
    cuad = cuadSnap.data() as any;
    const cuadArea = String(cuad.area || "").toUpperCase();
    if (cuadArea !== input.area) {
      return { ok: false, error: { formErrors: ["CUADRILLA_AREA_INVALIDA"] } } as const;
    }
  }

  const cuadCoordinador = String(cuad?.coordinadorUid || cuad?.coordinador || "");
  if (!canEditCoordinador && cuadCoordinador && input.coordinadorUid !== cuadCoordinador) {
    return { ok: false, error: { formErrors: ["COORDINADOR_NO_PERMITIDO"] } } as const;
  }

  await assertCoordinadorRole(input.coordinadorUid);

  const materialIds = uniqStrings(input.items.map((i) => i.materialId));
  const matRefs = materialIds.map((id) => db.collection("materiales").doc(id));
  const matSnaps = materialIds.length ? await db.getAll(...matRefs) : [];
  const matById = new Map(matSnaps.map((s) => [s.id, s] as const));

  const items: VentaItemDoc[] = [];
  const qtyMap = new Map<string, { und: number; metros: number }>();
  let totalCents = 0;

  for (const it of input.items) {
    const snap = matById.get(it.materialId);
    if (!snap || !snap.exists) {
      return { ok: false, error: { formErrors: [`MATERIAL_NOT_FOUND ${it.materialId}`] } } as const;
    }
    const m = snap.data() as any;
    if (!m.vendible) {
      return { ok: false, error: { formErrors: [`MATERIAL_NO_VENDIBLE ${it.materialId}`] } } as const;
    }
    if (String(m.estado || "").toUpperCase() !== "ACTIVO") {
      return { ok: false, error: { formErrors: [`MATERIAL_INACTIVO ${it.materialId}`] } } as const;
    }

    const unidadTipo = String(m.unidadTipo || "").toUpperCase() === "METROS" ? "METROS" : "UND";
    const und = unidadTipo === "UND" ? Math.floor(it.und || 0) : 0;
    const metros = unidadTipo === "METROS" ? Math.max(0, Number(it.metros || 0)) : 0;
    if (unidadTipo === "UND" && und <= 0) {
      return { ok: false, error: { formErrors: [`CANTIDAD_INVALIDA ${it.materialId}`] } } as const;
    }
    if (unidadTipo === "METROS" && metros <= 0) {
      return { ok: false, error: { formErrors: [`METROS_INVALIDOS ${it.materialId}`] } } as const;
    }

    let precioUnitCents = 0;
    if (canEditPrecio && typeof it.precioUnitCents === "number") {
      precioUnitCents = Math.max(0, Math.floor(it.precioUnitCents));
    } else if (unidadTipo === "UND") {
      precioUnitCents = Math.max(0, Math.floor(m.precioUndCents || 0));
    } else {
      precioUnitCents = Math.max(0, Math.floor(m.precioPorCmCents || 0));
    }
    if (precioUnitCents <= 0) {
      return { ok: false, error: { formErrors: [`PRECIO_INVALIDO ${it.materialId}`] } } as const;
    }

    const subtotalCents =
      unidadTipo === "UND" ? precioUnitCents * und : precioUnitCents * metersToCm(metros);
    totalCents += subtotalCents;

    items.push({
      materialId: it.materialId,
      nombre: String(m.nombre || "").trim() || it.materialId,
      unidadTipo,
      und: unidadTipo === "UND" ? und : 0,
      metros: unidadTipo === "METROS" ? metros : 0,
      precioUnitCents,
      subtotalCents,
    });

    const prev = qtyMap.get(it.materialId) || { und: 0, metros: 0 };
    qtyMap.set(it.materialId, { und: prev.und + und, metros: prev.metros + metros });
  }

  if (totalCents <= 0) {
    return { ok: false, error: { formErrors: ["TOTAL_INVALIDO"] } } as const;
  }

  // Prevalidar stock en almacen
  if (qtyMap.size) {
    const refs = Array.from(qtyMap.keys()).map((id) => db.collection("almacen_stock").doc(id));
    const snaps = await db.getAll(...refs);
    const byId = new Map(snaps.map((s) => [s.id, s] as const));
    for (const [id, qty] of qtyMap.entries()) {
      const snap = byId.get(id);
      if (!snap || !snap.exists) {
        return { ok: false, error: { formErrors: [`STOCK_NOT_FOUND ${id}`] } } as const;
      }
      const a = snap.data() as any;
      const unidadTipo = String(a.unidadTipo || "").toUpperCase();
      if (unidadTipo === "UND") {
        if ((a.stockUnd || 0) - qty.und < 0) return { ok: false, error: { formErrors: [`STOCK_INSUFICIENTE_ALMACEN ${id}`] } } as const;
      } else {
        if ((a.stockCm || 0) - metersToCm(qty.metros) < 0) return { ok: false, error: { formErrors: [`STOCK_INSUFICIENTE_ALMACEN ${id}`] } } as const;
      }
    }
  }

  const ventaId = await nextVentaId(input.area === "INSTALACIONES" ? "VTAI" : "VTAA");
  const ventaRef = db.collection("ventas").doc(ventaId);
  const cuotasRef = ventaRef.collection("cuotas").doc("1");

  const coordinadorNombre = await getUsuarioDisplayName(input.coordinadorUid);
  const cuadNombre = String(cuad?.nombre || "").trim() || input.cuadrillaId || "";
  const destinoType = input.cuadrillaId ? "CUADRILLA" : "COORDINADOR";

  await db.runTransaction(async (tx) => {
    for (const [materialId, qty] of qtyMap.entries()) {
      const matSnap = matById.get(materialId);
      const mat = matSnap?.data() as any;
      const unidadTipo = String(mat?.unidadTipo || "").toUpperCase() === "METROS" ? "METROS" : "UND";
      await updateStockVentasTx(tx, {
        from: { type: "ALMACEN", id: "ALMACEN" },
        to: destinoType === "CUADRILLA" ? { type: "CUADRILLA", id: input.cuadrillaId as string } : { type: "COORDINADOR", id: input.coordinadorUid },
        materialId,
        unidadTipo,
        und: unidadTipo === "UND" ? qty.und : undefined,
        metros: unidadTipo === "METROS" ? qty.metros : undefined,
      });
    }

    tx.set(ventaRef, {
      area: input.area,
      cuadrillaId: input.cuadrillaId || "",
      cuadrillaNombre: cuadNombre,
      coordinadorUid: input.coordinadorUid,
      coordinadorNombre,
      destinoType,
      items,
      totalCents,
      saldoPendienteCents: totalCents,
      cuotasTotal: 1,
      cuotasPagadas: 0,
      estado: "PENDIENTE",
      observacion: String(input.observacion || ""),
      createdAt: FieldValue.serverTimestamp(),
      createdBy: session.uid,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: session.uid,
    });

    tx.set(cuotasRef, {
      n: 1,
      montoCents: totalCents,
      pagadoMontoCents: 0,
      estado: "PENDIENTE",
      createdAt: FieldValue.serverTimestamp(),
      createdBy: session.uid,
    });
  });

  // Ledger simple
  await db.collection("movimientos_inventario").doc(ventaId).set({
    area: input.area,
    tipo: input.area === "INSTALACIONES" ? "VENTA_INST" : "VENTA_AVER",
    origen: { type: "ALMACEN", id: "ALMACEN" },
    destino: destinoType === "CUADRILLA" ? { type: "CUADRILLA", id: input.cuadrillaId } : { type: "COORDINADOR", id: input.coordinadorUid },
    itemsMateriales: items.map((i) => ({
      materialId: i.materialId,
      und: i.und ?? 0,
      metros: i.metros ?? 0,
      status: "OK",
    })),
    observacion: String(input.observacion || ""),
    createdAt: FieldValue.serverTimestamp(),
    createdBy: session.uid,
  });

  try {
    const usuario = await getUsuarioDisplayName(session.uid);
    const destinoLabel = destinoType === "CUADRILLA" ? `Cuadrilla: ${cuadNombre}` : "Destino: Coordinador";
    const totalStr = `S/ ${centsToMoney(totalCents).toFixed(2)}`;
    const msg = `${usuario} realizo una venta (${input.area}). ${destinoLabel}. Coordinador: ${coordinadorNombre}. Materiales: ${items.length}. Total: ${totalStr}`;
    await addGlobalNotification({
      title: "VENTA",
      message: msg,
      type: "success",
      scope: "ALL",
      createdBy: session.uid,
      entityType: "VENTA",
      entityId: ventaId,
      action: "CREATE",
      estado: "ACTIVO",
    });
  } catch {}

  return { ok: true, ventaId } as const;
}

export async function actualizarCuotasVentaAction(raw: any) {
  const session = await requireServerPermission("VENTAS_EDIT");
  const input = VentaCuotasUpdateSchema.parse(raw);
  const db = adminDb();
  const ventaRef = db.collection("ventas").doc(input.ventaId);
  const ventaSnap = await ventaRef.get();
  if (!ventaSnap.exists) return { ok: false, error: { formErrors: ["VENTA_NOT_FOUND"] } } as const;
  const venta = ventaSnap.data() as any;
  if (venta.estado === "ANULADA") return { ok: false, error: { formErrors: ["VENTA_ANULADA"] } } as const;

  const totalCents = Number(venta.totalCents || 0);
  const saldoPendiente = Number(venta.saldoPendienteCents || 0);

  const sum = input.cuotas.reduce((acc, c) => acc + Number(c.montoCents || 0), 0);
  if (sum !== totalCents) {
    return { ok: false, error: { formErrors: ["CUOTAS_SUMA_INVALIDA"] } } as const;
  }

  const cuotasCol = ventaRef.collection("cuotas");
  const cuotasSnap = await cuotasCol.get();
  const cuotasPrev = cuotasSnap.docs.map((d) => d.data() as any);
  const pagadoTotal = cuotasPrev.reduce((acc, c) => acc + Number(c.pagadoMontoCents || 0), 0);
  if (pagadoTotal > totalCents) {
    return { ok: false, error: { formErrors: ["PAGOS_INVALIDOS"] } } as const;
  }

  // Reasigna el total pagado a las nuevas cuotas, sin cambiar el monto pagado global
  let restantePagado = pagadoTotal;
  const batch = db.batch();
  cuotasSnap.docs.forEach((d) => batch.delete(d.ref));
  input.cuotas.forEach((c) => {
    const montoCents = Math.floor(c.montoCents);
    const pagadoMontoCents = Math.min(restantePagado, montoCents);
    restantePagado = Math.max(0, restantePagado - pagadoMontoCents);
    const estado = pagadoMontoCents >= montoCents ? "PAGADO" : pagadoMontoCents > 0 ? "PARCIAL" : "PENDIENTE";
    const ref = cuotasCol.doc(String(c.n));
    batch.set(ref, {
      n: c.n,
      montoCents,
      pagadoMontoCents,
      estado,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: session.uid,
    });
  });
  let remainingPaidForCount = pagadoTotal;
  let cuotasPagadas = 0;
  for (const c of input.cuotas) {
    const monto = Math.floor(c.montoCents);
    const pagado = Math.min(remainingPaidForCount, monto);
    if (pagado >= monto) cuotasPagadas += 1;
    remainingPaidForCount = Math.max(0, remainingPaidForCount - pagado);
  }
  const nuevoSaldo = Math.max(0, totalCents - pagadoTotal);
  const nuevoEstado = nuevoSaldo <= 0 ? "PAGADO" : pagadoTotal > 0 ? "PARCIAL" : "PENDIENTE";
  batch.update(ventaRef, {
    cuotasTotal: input.cuotas.length,
    cuotasPagadas,
    saldoPendienteCents: nuevoSaldo,
    estado: nuevoEstado,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: session.uid,
  });
  await batch.commit();

  return { ok: true } as const;
}

export async function registrarPagoVentaAction(raw: any) {
  const session = await requireServerPermission("VENTAS_PAGOS");
  const input = VentaPagoInputSchema.parse(raw);
  const db = adminDb();
  const ventaRef = db.collection("ventas").doc(input.ventaId);
  const cuotaRef = ventaRef.collection("cuotas").doc(String(input.cuotaN));
  const pagosCol = cuotaRef.collection("pagos");

  await db.runTransaction(async (tx) => {
    const ventaSnap = await tx.get(ventaRef);
    if (!ventaSnap.exists) throw new Error("VENTA_NOT_FOUND");
    const venta = ventaSnap.data() as any;
    if (venta.estado === "ANULADA") throw new Error("VENTA_ANULADA");

    const cuotaSnap = await tx.get(cuotaRef);
    if (!cuotaSnap.exists) throw new Error("CUOTA_NOT_FOUND");
    const cuota = cuotaSnap.data() as any;

    const monto = Math.floor(input.montoCents || 0);
    const pendienteCuota = Math.max(0, Number(cuota.montoCents || 0) - Number(cuota.pagadoMontoCents || 0));
    if (monto <= 0) throw new Error("MONTO_INVALIDO");
    if (monto > pendienteCuota) throw new Error("MONTO_EXCEDE_CUOTA");

    const nuevoPagado = Number(cuota.pagadoMontoCents || 0) + monto;
    const cuotaEstado = nuevoPagado >= Number(cuota.montoCents || 0) ? "PAGADO" : "PARCIAL";

    const pagoRef = pagosCol.doc();
    tx.set(pagoRef, {
      montoCents: monto,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: session.uid,
    });

    const cuotaWasPaid = cuota.estado === "PAGADO";
    tx.update(cuotaRef, {
      pagadoMontoCents: nuevoPagado,
      estado: cuotaEstado,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: session.uid,
    });

    const saldoPendiente = Math.max(0, Number(venta.saldoPendienteCents || 0) - monto);
    const ventaEstado = saldoPendiente <= 0 ? "PAGADO" : "PARCIAL";

    const updateVenta: any = {
      saldoPendienteCents: saldoPendiente,
      estado: ventaEstado,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: session.uid,
    };
    if (!cuotaWasPaid && cuotaEstado === "PAGADO") {
      updateVenta.cuotasPagadas = FieldValue.increment(1);
    }
    tx.update(ventaRef, updateVenta);
  });

  return { ok: true } as const;
}

export async function anularVentaAction(raw: any) {
  const session = await requireServerPermission("VENTAS_ANULAR");
  const input = VentaAnularInputSchema.parse(raw);
  const db = adminDb();
  const ventaRef = db.collection("ventas").doc(input.ventaId);
  const ventaSnap = await ventaRef.get();
  if (!ventaSnap.exists) return { ok: false, error: { formErrors: ["VENTA_NOT_FOUND"] } } as const;
  const venta = ventaSnap.data() as any;
  if (venta.estado === "ANULADA") return { ok: false, error: { formErrors: ["VENTA_ANULADA"] } } as const;

  const saldoPendiente = Number(venta.saldoPendienteCents || 0);
  const totalCents = Number(venta.totalCents || 0);
  if (saldoPendiente !== totalCents) {
    return { ok: false, error: { formErrors: ["VENTA_CON_PAGOS"] } } as const;
  }

  const items: VentaItemDoc[] = Array.isArray(venta.items) ? venta.items : [];
  const cuadrillaId = String(venta.cuadrillaId || "");
  const coordinadorUid = String(venta.coordinadorUid || "");
  const destinoType = String(venta.destinoType || "CUADRILLA");
  if (destinoType === "CUADRILLA" && !cuadrillaId) return { ok: false, error: { formErrors: ["INVALID_CUADRILLA"] } } as const;
  if (destinoType === "COORDINADOR" && !coordinadorUid) return { ok: false, error: { formErrors: ["INVALID_COORDINADOR"] } } as const;

  await db.runTransaction(async (tx) => {
    for (const it of items) {
      await updateStockVentasTx(tx, {
        from: destinoType === "CUADRILLA" ? { type: "CUADRILLA", id: cuadrillaId } : { type: "COORDINADOR", id: coordinadorUid },
        to: { type: "ALMACEN", id: "ALMACEN" },
        materialId: it.materialId,
        unidadTipo: it.unidadTipo,
        und: it.unidadTipo === "UND" ? Math.floor(it.und || 0) : 0,
        metros: it.unidadTipo === "METROS" ? Number(it.metros || 0) : 0,
      });
    }
    tx.update(ventaRef, {
      estado: "ANULADA",
      saldoPendienteCents: 0,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: session.uid,
      anuladoAt: FieldValue.serverTimestamp(),
      anuladoBy: session.uid,
    });
  });

  await db.collection("movimientos_inventario").doc(`${input.ventaId}_ANULACION`).set({
    area: venta.area || "",
    tipo: "VENTA_ANULADA",
    origen: destinoType === "CUADRILLA" ? { type: "CUADRILLA", id: cuadrillaId } : { type: "COORDINADOR", id: coordinadorUid },
    destino: { type: "ALMACEN", id: "ALMACEN" },
    itemsMateriales: items.map((i) => ({
      materialId: i.materialId,
      und: i.und ?? 0,
      metros: i.metros ?? 0,
      status: "OK",
    })),
    createdAt: FieldValue.serverTimestamp(),
    createdBy: session.uid,
  });

  try {
    const usuario = await getUsuarioDisplayName(session.uid);
    const msg = `${usuario} anulo la venta ${input.ventaId} y devolvio stock al almacen.`;
    await addGlobalNotification({
      title: "Venta anulada",
      message: msg,
      type: "warn",
      scope: "ALL",
      createdBy: session.uid,
      entityType: "VENTA",
      entityId: input.ventaId,
      action: "UPDATE",
      estado: "ACTIVO",
    });
  } catch {}

  return { ok: true } as const;
}


