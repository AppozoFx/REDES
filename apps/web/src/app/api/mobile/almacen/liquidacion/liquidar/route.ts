import { NextResponse } from "next/server";
import { getMobileAuthContext } from "@/core/auth/mobile";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { normalizeUbicacion, toDatePartsLima } from "@/domain/equipos/repo";
import { metersToCm } from "@/domain/materiales/repo";
import { addGlobalNotification } from "@/domain/notificaciones/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KIT_BASE: Record<string, number> = {
  ACTA: 1,
  CINTILLO_30: 4,
  CINTILLO_BANDERA: 1,
  CONECTOR: 1,
  ACOPLADOR: 1,
  PACHCORD: 1,
  ROSETA: 1,
};

function uniqStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => String(v || "").trim()).filter(Boolean)));
}

function parseSns(list: string[]): string[] {
  return uniqStrings(list.flatMap((v) => String(v || "").split(/\r?\n|,|;|\t/g)));
}

function formatYmd(ymd: string): string {
  const parts = String(ymd || "").split("-");
  if (parts.length !== 3) return ymd || "";
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function parseExpectedCount(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function preliqDocId(pedido: string, ymd: string): string {
  return `${String(pedido || "").trim().replace(/[\/\\\s]+/g, "_")}_${ymd}`;
}

function cleanValue(v: unknown): string { return String(v || "").trim(); }

function datePartsFromYmdHm(ymd: string, hm: string | undefined, fallback: any) {
  const mYmd = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const mHm = String(hm || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!mYmd) return fallback;
  const hh = mHm ? String(mHm[1]).padStart(2, "0") : "12";
  const mm = mHm ? String(mHm[2]).padStart(2, "0") : "00";
  const dt = new Date(`${mYmd[1]}-${mYmd[2]}-${mYmd[3]}T${hh}:${mm}:00-05:00`);
  if (Number.isNaN(dt.getTime())) return fallback;
  const parts = toDatePartsLima(dt);
  return { at: parts.at, ymd: parts.ymd || ymd, hm: parts.hm || (mHm ? `${hh}:${mm}` : fallback.hm) };
}

export async function POST(req: Request) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

    const roles = (mobile.access.roles || []).map((r) => String(r || "").trim().toUpperCase());
    const areas = (mobile.access.areas || []).map((a) => String(a || "").trim().toUpperCase());
    const allowed =
      roles.includes("ALMACEN") || roles.includes("ADMIN") || areas.includes("ALMACEN");
    if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ ok: false, error: "BODY_REQUIRED" }, { status: 400 });

    const ordenId = String(body.ordenId || "").trim();
    if (!ordenId) return NextResponse.json({ ok: false, error: "ORDEN_ID_REQUIRED" }, { status: 400 });

    const rotuloNapCto = String(body.rotuloNapCto || "").trim();
    if (!rotuloNapCto) return NextResponse.json({ ok: false, error: "ROTULO_REQUIRED" }, { status: 400 });

    const snOnt = String(body.snOnt || "").trim().toUpperCase();
    const snMeshes: string[] = (Array.isArray(body.snMeshes) ? body.snMeshes : []).map((s: any) => String(s || "").trim().toUpperCase()).filter(Boolean);
    const snBoxes: string[] = (Array.isArray(body.snBoxes) ? body.snBoxes : []).map((s: any) => String(s || "").trim().toUpperCase()).filter(Boolean);
    const snFono = String(body.snFono || "").trim().toUpperCase();
    const sns = parseSns([snOnt, ...snMeshes, ...snBoxes, snFono].filter(Boolean));
    if (!sns.length) return NextResponse.json({ ok: false, error: "SN_REQUERIDO" }, { status: 400 });

    const planGamer = String(body.planGamer ? "true" : "");
    const kitWifiPro = String(body.kitWifiPro ? "true" : "");
    const servicioCableadoMesh = String(body.servicioCableadoMesh ? "true" : "");
    const cat5e = Math.max(0, Math.floor(Number(body.cat5e || 0)));
    const cat6 = Math.max(0, Math.floor(Number(body.cat6 || 0)));
    const puntosUTP = cat5e + cat6;
    const observacion = String(body.observacion || "").trim();

    const db = adminDb();
    const d = toDatePartsLima(new Date());

    const matAgg = new Map<string, { und: number; metros: number }>();
    for (const [materialId, und] of Object.entries(KIT_BASE)) {
      matAgg.set(materialId, { und, metros: 0 });
    }

    const ordenRef = db.collection("ordenes").doc(ordenId);
    const ordenSnap = await ordenRef.get();
    if (!ordenSnap.exists) return NextResponse.json({ ok: false, error: "ORDEN_NOT_FOUND" }, { status: 404 });

    const orden = ordenSnap.data() as any;
    const cuadrillaId = String(orden?.cuadrillaId || "").trim();
    if (!cuadrillaId) return NextResponse.json({ ok: false, error: "ORDEN_SIN_CUADRILLA" }, { status: 422 });

    let liquidarDetails: any = null;

    await db.runTransaction(async (tx) => {
      const ordSnap = await tx.get(ordenRef);
      if (!ordSnap.exists) throw new Error("ORDEN_NOT_FOUND");
      const ord = ordSnap.data() as any;

      const liqEstado = String(ord?.liquidacion?.estado || "").toUpperCase();
      if (!ord?.correccionPendiente && (liqEstado === "LIQUIDADO" || !!ord?.liquidadoAt)) {
        throw new Error("ORDEN_YA_LIQUIDADA");
      }

      const cliente = String(ord?.cliente || "").trim();
      const codigoCliente = String(ord?.codiSeguiClien || "").trim();
      if (!codigoCliente) throw new Error("CODIGO_CLIENTE_REQUIRED");

      const ordenFechaYmd = String(ord?.fechaFinVisiYmd || ord?.fSoliYmd || d.ymd || "");
      const ordenFechaHm = String(ord?.fechaFinVisiHm || ord?.fSoliHm || d.hm || "");
      const fechaInstalacion = datePartsFromYmdHm(ordenFechaYmd, ordenFechaHm, d);

      const preliqRef = db.collection("telegram_preliquidaciones").doc(preliqDocId(codigoCliente, ordenFechaYmd));
      const preliqSnap = codigoCliente && ordenFechaYmd ? await tx.get(preliqRef) : null;
      const preliqRow = preliqSnap?.exists ? (preliqSnap.data() as any) : null;
      const preliq = (preliqRow?.preliquidacion as Record<string, unknown> | undefined) || {};
      const contactoReceptor = {
        documento: cleanValue(preliq.receptorDocumento),
        nombres: cleanValue(preliq.receptorNombres),
        telefono: cleanValue(preliq.receptorTelefono),
      };

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
      const eqMap = new Map(eqSnaps.map((s) => [s.id, s]));
      const srMap = new Map(srSnaps.map((s) => [s.id, s]));

      const materialIds = Array.from(matAgg.keys());
      const matRefs = materialIds.map((mid) => db.collection("materiales").doc(mid));
      const stockRefs = materialIds.map((mid) =>
        db.collection("cuadrillas").doc(cuadrillaId).collection("stock").doc(mid)
      );
      const matSnaps = materialIds.length ? await tx.getAll(...matRefs) : [];
      const stockSnaps = materialIds.length ? await tx.getAll(...stockRefs) : [];
      const matMap = new Map(matSnaps.map((s) => [s.id, s]));
      const stockMap = new Map(stockSnaps.map((s) => [s.id, s]));

      const equiposInstalados: Array<{ sn: string; tipo: string; proid: string; descripcion: string }> = [];
      const equiposItems: Array<{ sn: string; tipo: string; status: "OK" }> = [];
      const movedTypes = new Map<string, number>();

      for (const sn of sns) {
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

        tx.update(db.collection("equipos").doc(sn), {
          estado: "INSTALADO",
          ubicacion: "INSTALADOS",
          cliente,
          codigoCliente,
          f_instaladoAt: fechaInstalacion.at,
          f_instaladoYmd: fechaInstalacion.ymd,
          f_instaladoHm: fechaInstalacion.hm,
          audit: { ...(eq?.audit || {}), updatedAt: FieldValue.serverTimestamp(), updatedBy: mobile.uid },
        });
        tx.delete(db.collection("cuadrillas").doc(cuadrillaId).collection("equipos_series").doc(sn));
        tx.set(stockTipoRef, { tipo, cantidad: FieldValue.increment(-1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });

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
        const matSnap = matMap.get(materialId);
        const stockSnap = stockMap.get(materialId);
        if (!matSnap?.exists) throw new Error(`MATERIAL_NOT_FOUND ${materialId}`);

        const mat = matSnap.data() as any;
        const stock = stockSnap?.exists ? (stockSnap.data() as any) : null;
        const stockRef = db.collection("cuadrillas").doc(cuadrillaId).collection("stock").doc(materialId);
        const unidadTipo = String(mat?.unidadTipo || "").toUpperCase() === "METROS" ? "METROS" : "UND";

        if (unidadTipo === "UND") {
          const und = Math.floor(qty.und || 0);
          if (und <= 0) throw new Error(`MATERIAL_CANTIDAD_INVALIDA ${materialId}`);
          const available = Number(stock?.stockUnd || 0);
          if (available - und < 0) throw new Error(`STOCK_INSUFICIENTE_CUADRILLA ${materialId}`);
          tx.update(stockRef, { stockUnd: FieldValue.increment(-und), updatedAt: FieldValue.serverTimestamp() });
          materialesItems.push({ materialId, und, metros: 0, status: "OK" });
        } else {
          const metros = Number(qty.metros || 0);
          if (metros <= 0) throw new Error(`MATERIAL_METROS_INVALIDOS ${materialId}`);
          const needCm = metersToCm(metros);
          const available = Number(stock?.stockCm || 0);
          if (available - needCm < 0) throw new Error(`STOCK_INSUFICIENTE_CUADRILLA ${materialId}`);
          tx.update(stockRef, { stockCm: FieldValue.increment(-needCm), updatedAt: FieldValue.serverTimestamp() });
          materialesItems.push({ materialId, und: 0, metros, status: "OK" });
        }
      }

      const servicios = { planGamer, kitWifiPro, servicioCableadoMesh, cat5e, cat6, puntosUTP };
      const firstOnt = equiposInstalados.find((e) => e.tipo === "ONT");
      const instalacionesRef = db.collection("instalaciones").doc(codigoCliente);

      tx.set(instalacionesRef, {
        codigoCliente, cliente,
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
        equiposInstalados,
        equiposByTipo: Object.fromEntries(movedTypes),
        materialesConsumidos: materialesItems,
        liquidacion: {
          estado: "LIQUIDADO",
          at: d.at, ymd: d.ymd, hm: d.hm,
          by: mobile.uid,
          rotuloNapCto,
          observacion,
          contactoReceptor,
          servicios,
        },
        correccionPendiente: false,
        corregido: false,
        corregidaAt: FieldValue.delete(),
        corregidaYmd: FieldValue.delete(),
        corregidaHm: FieldValue.delete(),
        corregidaBy: FieldValue.delete(),
        corregidaMotivo: FieldValue.delete(),
        correccionAt: FieldValue.delete(),
        correccionYmd: FieldValue.delete(),
        correccionHm: FieldValue.delete(),
        correccionBy: FieldValue.delete(),
        correccionMotivo: FieldValue.delete(),
        orden: ord,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      tx.set(db.collection("movimientos_inventario").doc(`LIQ-ORD-${ordenId}`), {
        area: "INSTALACIONES",
        tipo: "LIQUIDACION_ORDEN",
        ordenId,
        origen: { type: "CUADRILLA", id: cuadrillaId },
        destino: { type: "INSTALADO", id: codigoCliente || cliente || ordenId },
        itemsEquipos: equiposItems,
        itemsMateriales: materialesItems,
        observacion, rotuloNapCto, contactoReceptor, servicios,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: mobile.uid,
      }, { merge: false });

      tx.set(ordenRef, {
        liquidacion: {
          estado: "LIQUIDADO",
          at: FieldValue.serverTimestamp(), ymd: d.ymd, hm: d.hm,
          by: mobile.uid, cliente, codigoCliente, cuadrillaId,
          equiposCount: equiposItems.length,
          materialesCount: materialesItems.length,
          rotuloNapCto, observacion, contactoReceptor, servicios,
        },
        correccionPendiente: false,
        correccionAt: FieldValue.delete(),
        correccionYmd: FieldValue.delete(),
        correccionHm: FieldValue.delete(),
        correccionBy: FieldValue.delete(),
        correccionMotivo: FieldValue.delete(),
        liquidadoAt: FieldValue.serverTimestamp(),
        liquidadoYmd: d.ymd,
        liquidadoBy: mobile.uid,
        "audit.updatedAt": FieldValue.serverTimestamp(),
        "audit.updatedBy": mobile.uid,
      }, { merge: true });

      liquidarDetails = {
        codigoCliente, cliente,
        cuadrilla: String(ord?.cuadrillaNombre || c?.nombre || cuadrillaId),
        fechaOrdenYmd: ordenFechaYmd,
        ont: firstOnt ? { sn: firstOnt.sn, proid: firstOnt.proid || "" } : null,
        mesh: Number(movedTypes.get("MESH") || 0),
        box: Number(movedTypes.get("BOX") || 0),
      };
    });

    try {
      const ord = orden;
      const cuadrillaNombre = String(ord?.cuadrillaNombre || ord?.cuadrillaId || "");
      const fechaOrden = formatYmd(String(ord?.fechaFinVisiYmd || ord?.fSoliYmd || ""));
      const codiSeguiClien = String(ord?.codiSeguiClien || "").trim();
      const cliente = String(ord?.cliente || "").trim();
      let liquidadoPor = mobile.uid;
      try {
        const uSnap = await adminDb().collection("usuarios").doc(mobile.uid).get();
        if (uSnap.exists) {
          const u = uSnap.data() as any;
          const full = `${String(u?.nombres || "").trim()} ${String(u?.apellidos || "").trim()}`.trim();
          if (full) liquidadoPor = full;
        }
      } catch {}
      await addGlobalNotification({
        title: "Liquidacion",
        message: `✅ Cliente: ${cliente || codiSeguiClien || "cliente"} • Pedido: ${codiSeguiClien || ordenId} • Cuadrilla: ${cuadrillaNombre || "-"} • Liquidado por: ${liquidadoPor} • Fecha: ${fechaOrden || "-"}`,
        type: "success",
        scope: "ALL",
        createdBy: mobile.uid,
        entityType: "ORDENES",
        entityId: codiSeguiClien || ordenId,
        action: "UPDATE",
        estado: "ACTIVO",
      });
    } catch {}

    return NextResponse.json({ ok: true, details: liquidarDetails });
  } catch (e: any) {
    const msg = String(e?.message || "ERROR");
    return NextResponse.json({ ok: false, error: msg }, { status: msg === "ORDEN_YA_LIQUIDADA" ? 409 : 422 });
  }
}
