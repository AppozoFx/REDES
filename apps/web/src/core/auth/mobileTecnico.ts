import { randomUUID } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, adminStorageBucket } from "@/lib/firebase/admin";
import { buildShortPersonName, getMobileProfile } from "./mobile";
import type { MobileAuthContext } from "./mobile";

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function previousYmd(ymd: string) {
  const [year, month, day] = String(ymd || "").split("-").map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  date.setUTCDate(date.getUTCDate() - 1);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function monthRangeLimaYmd(ymd: string) {
  const [year, month] = String(ymd || "").split("-").map(Number);
  const start = new Date(Date.UTC(year || 1970, ((month || 1) - 1), 1));
  const next = new Date(Date.UTC(year || 1970, (month || 1), 1));
  next.setUTCDate(next.getUTCDate() - 1);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return {
    start: fmt.format(start),
    end: fmt.format(next),
  };
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function toInt(v: unknown) {
  const num = toNum(v);
  return num === null ? 0 : Math.trunc(num);
}

function cleanValue(v: unknown) {
  return String(v || "").trim();
}

function truthyText(v: unknown) {
  return cleanValue(v).length > 0;
}

function preliqDocId(pedido: string, ymd: string) {
  const cleanPedido = String(pedido || "").trim().replace(/[\/\\\s]+/g, "_");
  return `${cleanPedido}_${ymd}`;
}

async function hasPreliquidacionRecord(keys: string[], ymd: string) {
  const cleanKeys = Array.from(new Set(keys.map((value) => cleanValue(value)).filter(Boolean)));
  if (!cleanKeys.length || !ymd) return false;

  const collectionNames = [
    "telegram_preliquidaciones",
    "telegram_preliquidacion_retries",
  ];

  for (const collectionName of collectionNames) {
    const docRefs = cleanKeys.map((key) => adminDb().collection(collectionName).doc(preliqDocId(key, ymd)));
    const docSnaps = docRefs.length ? await adminDb().getAll(...docRefs) : [];
    if (docSnaps.some((snap) => snap.exists)) return true;

    const queryResults = await Promise.all(
      cleanKeys.map((key) =>
        adminDb()
          .collection(collectionName)
          .where("pedido", "==", key)
          .where("ymd", "==", ymd)
          .limit(1)
          .get()
          .catch(() => null)
      )
    );
    if (queryResults.some((snap) => snap && !snap.empty)) return true;
  }

  return false;
}

function isGarantia(x: any) {
  const txt = `${String(x?.tipo || "")} ${String(x?.tipoTraba || "")} ${String(x?.idenServi || "")} ${String(x?.tipoServicio || "")} ${String(x?.estado || "")}`.toUpperCase();
  return txt.includes("GARANTIA");
}

function isLiquidatedOrder(x: any) {
  return String(x?.liquidacion?.estado || "").toUpperCase() === "LIQUIDADO" || !!x?.liquidadoAt;
}

function isFinalizada(estado: string) {
  return String(estado || "").trim().toUpperCase() === "FINALIZADA";
}

function normalizedEstado(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function resolveDateFields(data: any) {
  return {
    fechaProgramadaYmd: String(data?.fSoliYmd || data?.fechaFinVisiYmd || "").trim(),
    fechaProgramadaHm: String(data?.fSoliHm || data?.fechaFinVisiHm || "").trim(),
    fechaFinVisiYmd: String(data?.fechaFinVisiYmd || data?.fSoliYmd || "").trim(),
    fechaFinVisiHm: String(data?.fechaFinVisiHm || data?.fSoliHm || "").trim(),
  };
}

async function getUserShortName(uid: string) {
  if (!uid) return "";
  const snap = await adminDb().collection("usuarios").doc(uid).get();
  const data = snap.exists ? (snap.data() as any) : {};
  const full = `${String(data?.nombres || "").trim()} ${String(data?.apellidos || "").trim()}`.trim();
  return buildShortPersonName(data?.nombres, data?.apellidos, full || uid);
}

async function getOptionalUserShortName(uid: string) {
  return uid ? getUserShortName(uid) : "";
}

async function getGestorPhone(uid: string): Promise<string> {
  if (!uid) return "";
  const snap = await adminDb().collection("usuarios").doc(uid).get();
  const data = snap.exists ? (snap.data() as any) : {};
  return String(data?.celular || data?.telefono || data?.phone || "").trim().replace(/\s+/g, "");
}

export async function getTecnicoContext(mobile: MobileAuthContext) {
  const roles = (mobile.access.roles || []).map((role) => String(role || "").trim().toUpperCase());
  if (!roles.includes("TECNICO") && !roles.includes("ADMIN")) {
    throw new Error("ROLE_TECNICO_REQUIRED");
  }

  const cuadrillasSnap = await adminDb()
    .collection("cuadrillas")
    .where("tecnicosUids", "array-contains", mobile.uid)
    .limit(2)
    .get();

  if (cuadrillasSnap.empty) {
    throw new Error("TECNICO_WITHOUT_CUADRILLA");
  }

  const cuadrillaDoc = cuadrillasSnap.docs[0];
  const cuadrilla = cuadrillaDoc.data() as any;
  const tecnicoNombre = await getUserShortName(mobile.uid);
  const coordinadorUid = String(cuadrilla?.coordinadorUid || "").trim();
  const gestorUid = String(cuadrilla?.gestorUid || "").trim();

  const tecnicoUids = Array.isArray(cuadrilla?.tecnicosUids)
    ? cuadrilla.tecnicosUids.map((uid: any) => String(uid || "").trim()).filter(Boolean)
    : [];
  const tecnicoRefs = tecnicoUids.map((uid: string) => adminDb().collection("usuarios").doc(uid));
  const tecnicoSnaps = tecnicoRefs.length ? await adminDb().getAll(...tecnicoRefs) : [];

  const integrantes = tecnicoSnaps.map((snap: any) => {
    const data = snap.exists ? (snap.data() as any) : {};
    const full = `${String(data?.nombres || "").trim()} ${String(data?.apellidos || "").trim()}`.trim() || snap.id;
    const nombre = buildShortPersonName(data?.nombres, data?.apellidos, full);
    return {
      uid: snap.id,
      nombre,
    };
  });

  const [coordinadorNombreResolved, gestorNombreResolved, gestorWhatsappResolved] = await Promise.all([
    getOptionalUserShortName(coordinadorUid),
    getOptionalUserShortName(gestorUid),
    getGestorPhone(gestorUid),
  ]);

  return {
    uid: mobile.uid,
    tecnicoNombre,
    cuadrilla: {
      id: cuadrillaDoc.id,
      nombre: String(cuadrilla?.nombre || cuadrillaDoc.id).trim(),
      categoria: String(cuadrilla?.categoria || "").trim(),
      area: String(cuadrilla?.area || "").trim(),
      coordinadorUid,
      coordinadorNombre: coordinadorNombreResolved || String(cuadrilla?.coordinadorNombre || "").trim(),
      gestorUid,
      gestorNombre: gestorNombreResolved || String(cuadrilla?.gestorNombre || "").trim(),
      gestorWhatsapp: gestorWhatsappResolved,
      integrantes,
    },
  };
}

export async function listTecnicoOrders(cuadrillaId: string, ymd: string) {
  const docsById = new Map<string, any>();

  const collect = async (field: "fSoliYmd" | "fechaFinVisiYmd", value: string) => {
    const snap = await adminDb()
      .collection("ordenes")
      .where("cuadrillaId", "==", cuadrillaId)
      .where(field, "==", value)
      .limit(1500)
      .get();
    for (const doc of snap.docs) docsById.set(doc.id, doc.data());
  };

  await collect("fSoliYmd", ymd);
  await collect("fechaFinVisiYmd", ymd);

  // Usar fSoliYmd como fecha canónica; si un documento tiene fSoliYmd distinto
  // al ymd solicitado (fue traído por el query de fechaFinVisiYmd), descartarlo.
  const matchingEntries = Array.from(docsById.entries()).filter(([, data]) => {
    const primaryYmd = String(data?.fSoliYmd || "").trim();
    const fallbackYmd = String(data?.fechaFinVisiYmd || "").trim();
    return (primaryYmd || fallbackYmd) === ymd;
  });

  const baseItems = matchingEntries.map(([id, data]) => {
    const dates = resolveDateFields(data);
    return {
      id,
      pedido: cleanValue(data?.ordenId || id),
      codigoCliente: cleanValue(data?.codiSeguiClien),
      ordenId: String(data?.ordenId || id),
      cliente: String(data?.cliente || "").trim(),
      direccion: String(data?.direccion || data?.direccion1 || "").trim(),
      estado: String(data?.estado || "").trim(),
      tipoTrabajo: String(data?.tipoTraba || data?.tipo || "").trim(),
      tipoServicio: String(data?.idenServi || "").trim(),
      cuadrillaId: String(data?.cuadrillaId || "").trim(),
      cuadrillaNombre: String(data?.cuadrillaNombre || "").trim(),
      fechaProgramadaYmd: dates.fechaProgramadaYmd,
      fechaProgramadaHm: dates.fechaProgramadaHm,
      fechaFinVisiYmd: dates.fechaFinVisiYmd,
      fechaFinVisiHm: dates.fechaFinVisiHm,
      isGarantia: isGarantia(data),
      isFinalizada: isFinalizada(String(data?.estado || "")),
      isLiquidated: isLiquidatedOrder(data),
      cantMesh: toInt(data?.cantMESHwin),
      cantFono: toInt(data?.cantFONOwin),
      cantBox: toInt(data?.cantBOXwin),
      motivoCancelacion: String(data?.motivoCancelacion || "").trim(),
      lat: toNum(data?.lat),
      lng: toNum(data?.lng),
    };
  });

  const plantillaByOrderId = new Map<string, string>();
  await Promise.all(
    baseItems
      .filter((item) => item.isFinalizada && !item.isGarantia && (item.fechaProgramadaYmd || item.fechaFinVisiYmd))
      .map(async (item) => {
        const hasPlantilla = await hasPreliquidacionRecord(
          [item.codigoCliente, item.pedido, item.ordenId],
          item.fechaProgramadaYmd || item.fechaFinVisiYmd
        );
        plantillaByOrderId.set(item.id, hasPlantilla ? "OK" : "PENDIENTE");
      })
  );

  return baseItems.map((item) => ({
    ...item,
    plantillaStatus: plantillaByOrderId.get(item.id) || "PENDIENTE",
  })).sort((a, b) => {
    return String(a.fechaProgramadaHm || "").localeCompare(String(b.fechaProgramadaHm || "")) ||
      a.ordenId.localeCompare(b.ordenId);
  });
}

export async function getTecnicoOrderDetail(cuadrillaId: string, orderId: string) {
  const snap = await adminDb().collection("ordenes").doc(orderId).get();
  if (!snap.exists) return null;

  const data = snap.data() as any;
  if (String(data?.cuadrillaId || "").trim() !== cuadrillaId) {
    throw new Error("ORDER_NOT_IN_CUADRILLA");
  }

  const codigoCliente = String(data?.codiSeguiClien || "").trim();
  const instalacionSnap = codigoCliente
    ? await adminDb().collection("instalaciones").doc(codigoCliente).get()
    : null;
  const instalacion = instalacionSnap?.exists ? (instalacionSnap.data() as any) : null;
  const liquidacion = instalacion?.liquidacion || data?.liquidacion || {};
  const servicios = {
    ...(liquidacion?.servicios && typeof liquidacion.servicios === "object" ? liquidacion.servicios : {}),
    ...(instalacion?.servicios && typeof instalacion.servicios === "object" ? instalacion.servicios : {}),
  } as any;
  const materiales = Array.isArray(instalacion?.materialesConsumidos)
    ? instalacion.materialesConsumidos
    : Array.isArray(liquidacion?.materialesConsumidos)
      ? liquidacion.materialesConsumidos
      : [];
  const equipos = Array.isArray(instalacion?.equiposInstalados)
    ? instalacion.equiposInstalados
    : Array.isArray(liquidacion?.equiposInstalados)
      ? liquidacion.equiposInstalados
      : [];
  const dates = resolveDateFields(data);
  const plantillaYmd = dates.fechaProgramadaYmd || dates.fechaFinVisiYmd || todayLimaYmd();
  const pedido = cleanValue(data?.ordenId || snap.id);
  const plantillaStatus = await hasPreliquidacionRecord(
    [codigoCliente, pedido, orderId],
    plantillaYmd
  )
    ? "OK"
    : "PENDIENTE";
  const acta = cleanValue(
    instalacion?.materialesLiquidacion?.acta ||
    liquidacion?.acta ||
    instalacion?.ACTA ||
    instalacion?.acta
  );
  const cat6 = toInt(servicios?.cat6 ?? data?.cat6);
  const cat5e = toInt(servicios?.cat5e ?? data?.cat5e);
  const serviciosEtiquetas = [
    cat6 > 0 ? `CAT6${cat6 > 1 ? ` x${cat6}` : ""}` : "",
    cat6 <= 0 && cat5e > 0 ? `CAT5e${cat5e > 1 ? ` x${cat5e}` : ""}` : "",
    truthyText(servicios?.planGamer || data?.planGamer) ? "Plan Gamer" : "",
    truthyText(servicios?.servicioCableadoMesh || data?.servicioCableadoMesh) ? "Cableado Mesh" : "",
    truthyText(servicios?.kitWifiPro || data?.kitWifiPro) ? "Kit Wifi Pro" : "",
  ].filter(Boolean);

  return {
    id: snap.id,
    ordenId: String(data?.ordenId || snap.id),
    cliente: String(data?.cliente || "").trim(),
    codigoCliente,
    documento: cleanValue(data?.numeroDocumento || instalacion?.documento || instalacion?.orden?.numeroDocumento),
    telefono: cleanValue(data?.telefono || instalacion?.telefono || instalacion?.orden?.telefono),
    direccion: String(data?.direccion || data?.direccion1 || "").trim(),
    estado: String(data?.estado || "").trim(),
    tipoTrabajo: String(data?.tipoTraba || data?.tipo || "").trim(),
    tipoServicio: String(data?.idenServi || "").trim(),
    plan: String(data?.plan || data?.idenServi || "").trim(),
    fechaProgramadaYmd: dates.fechaProgramadaYmd,
    fechaProgramadaHm: dates.fechaProgramadaHm,
    fechaFinVisiYmd: dates.fechaFinVisiYmd,
    fechaFinVisiHm: dates.fechaFinVisiHm,
    isGarantia: isGarantia(data),
    isFinalizada: isFinalizada(String(data?.estado || "")),
    isLiquidated: isLiquidatedOrder(data) || String(liquidacion?.estado || "").toUpperCase() === "LIQUIDADO",
    plantillaStatus,
    liquidacionEstado: String(liquidacion?.estado || "").trim(),
    liquidadoAt: liquidacion?.at?.toDate?.()?.toISOString?.() || null,
    observacion: String(liquidacion?.observacion || instalacion?.observacion || "").trim(),
    cantMesh: toInt(data?.cantMESHwin),
    cantFono: toInt(data?.cantFONOwin),
    cantBox: toInt(data?.cantBOXwin),
    lat: toNum(data?.lat),
    lng: toNum(data?.lng),
    acta,
    servicios: serviciosEtiquetas,
    materiales: materiales.map((item: any) => ({
      materialId: String(item?.materialId || item?.id || "").trim(),
      nombre: String(item?.nombre || item?.materialId || item?.id || "").trim(),
      cantidad: Number(item?.und ?? item?.cantidad ?? 0),
      metros: Number(item?.metros ?? 0),
      status: String(item?.status || "").trim(),
    })),
    equipos: equipos.map((item: any) => ({
      sn: String(item?.sn || item?.SN || "").trim(),
      tipo: String(item?.tipo || item?.kind || "").trim(),
      proid: String(item?.proid || item?.PROID || "").trim(),
      descripcion: String(item?.descripcion || "").trim(),
    })),
  };
}

export async function getTecnicoHomeData(cuadrillaId: string) {
  const today = todayLimaYmd();
  const monthRange = monthRangeLimaYmd(today);
  const docsById = new Map<string, any>();
  const monthSnap = await adminDb()
    .collection("ordenes")
    .where("cuadrillaId", "==", cuadrillaId)
    .limit(2500)
    .get();
  for (const doc of monthSnap.docs) {
    docsById.set(doc.id, doc.data());
  }

  const allMonthEntries = Array.from(docsById.entries()).filter(([, data]) => {
    const fSoliYmd = String(data?.fSoliYmd || "").trim();
    const fechaFinVisiYmd = String(data?.fechaFinVisiYmd || "").trim();
    return (
      (fSoliYmd >= monthRange.start && fSoliYmd <= monthRange.end) ||
      (fechaFinVisiYmd >= monthRange.start && fechaFinVisiYmd <= monthRange.end)
    );
  });

  const monthOrders = allMonthEntries.map(([, data]) => ({
    isGarantia: isGarantia(data),
    estado: normalizedEstado(data?.estado),
  }));

  const instalacionesMes = monthOrders.filter((item) => !item.isGarantia && item.estado === "FINALIZADA").length;
  const canceladasMes = monthOrders.filter((item) => !item.isGarantia && item.estado === "CANCELADA").length;
  const anuladasMes = monthOrders.filter((item) => !item.isGarantia && item.estado === "ANULADA").length;
  const regestionMes = monthOrders.filter((item) => !item.isGarantia && item.estado === "REGESTION").length;
  const garantiasMes = monthOrders.filter((item) => item.isGarantia && item.estado === "FINALIZADA").length;
  const porcentajeGarantias = instalacionesMes > 0
    ? Number(((garantiasMes / instalacionesMes) * 100).toFixed(1))
    : 0;

  // Finalized non-garantia orders for cat5e/cat6 totals and plantillas check
  const finalizedEntries = allMonthEntries.filter(([, data]) =>
    !isGarantia(data) && normalizedEstado(data?.estado) === "FINALIZADA"
  );

  // Batch-fetch instalaciones to sum cat5e/cat6 points
  const uniqueCodigos = [
    ...new Set(
      finalizedEntries
        .map(([, data]) => cleanValue(data?.codiSeguiClien))
        .filter(Boolean)
    ),
  ];
  const instalacionRefs = uniqueCodigos.map((codigo) =>
    adminDb().collection("instalaciones").doc(codigo)
  );
  const [instalacionSnaps, equiposSnap] = await Promise.all([
    instalacionRefs.length ? adminDb().getAll(...instalacionRefs) : Promise.resolve([]),
    adminDb()
      .collection("cuadrillas")
      .doc(cuadrillaId)
      .collection("equipos_series")
      .limit(1500)
      .get(),
  ]);

  let puntosCat5e = 0;
  let puntosCat6 = 0;
  for (const snap of instalacionSnaps) {
    if (!snap.exists) continue;
    const inst = snap.data() as any;
    const servicios =
      inst?.servicios && typeof inst.servicios === "object" ? inst.servicios : {};
    puntosCat5e += toInt(servicios?.cat5e ?? inst?.cat5e);
    puntosCat6 += toInt(servicios?.cat6 ?? inst?.cat6);
  }

  // Check plantilla status for finalized orders → collect pending ones
  const pendingPlantillas: Array<{
    ordenId: string;
    pedido: string;
    codigoCliente: string;
    cliente: string;
    ymd: string;
  }> = [];

  await Promise.all(
    finalizedEntries.map(async ([id, data]) => {
      const codigoCliente = cleanValue(data?.codiSeguiClien);
      const pedido = cleanValue(data?.ordenId || id);
      const ymd = String(data?.fSoliYmd || data?.fechaFinVisiYmd || "").trim();
      if (!ymd) return;
      const hasPlantilla = await hasPreliquidacionRecord(
        [codigoCliente, pedido, id],
        ymd
      );
      if (!hasPlantilla) {
        pendingPlantillas.push({
          ordenId: id,
          pedido,
          codigoCliente,
          cliente: String(data?.cliente || "").trim(),
          ymd,
        });
      }
    })
  );

  pendingPlantillas.sort((a, b) => b.ymd.localeCompare(a.ymd));

  const equipmentCounts = new Map<string, number>();
  for (const doc of equiposSnap.docs) {
    const data = doc.data() as any;
    const type = String(data?.equipo || "OTRO").trim().toUpperCase() || "OTRO";
    equipmentCounts.set(type, (equipmentCounts.get(type) || 0) + 1);
  }
  const preferred = ["ONT", "MESH", "FONO", "BOX"];
  for (const type of preferred) {
    if (!equipmentCounts.has(type)) {
      equipmentCounts.set(type, 0);
    }
  }
  const equipmentSummary = Array.from(equipmentCounts.entries())
    .sort((a, b) => {
      const ai = preferred.indexOf(a[0]);
      const bi = preferred.indexOf(b[0]);
      const aRank = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
      const bRank = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
      return aRank - bRank || a[0].localeCompare(b[0]);
    })
    .map(([tipo, count]) => ({ tipo, cantidad: count }));

  return {
    fecha: today,
    kpis: {
      instalacionesMes,
      canceladasMes,
      anuladasMes,
      regestionMes,
      garantiasMes,
      porcentajeGarantias,
    },
    equipmentSummary,
    cableado: {
      puntosCat5e,
      puntosCat6,
    },
    plantillasPendientes: pendingPlantillas,
  };
}

export async function getTecnicoStock(cuadrillaId: string) {
  const cuadrillaRef = adminDb().collection("cuadrillas").doc(cuadrillaId);
  const [equiposSnap, materialesSnap, bobinasSnap] = await Promise.all([
    cuadrillaRef.collection("equipos_series").limit(1500).get(),
    cuadrillaRef.collection("stock").limit(1500).get(),
    cuadrillaRef.collection("bobinas").where("estado", "==", "ACTIVA").limit(300).get(),
  ]);

  const equipmentIds = equiposSnap.docs.map((doc) => String(doc.id || "").trim()).filter(Boolean);
  const equipmentRefs = equipmentIds.map((id) => adminDb().collection("equipos").doc(id));
  const equipmentDocs = equipmentRefs.length ? await adminDb().getAll(...equipmentRefs) : [];
  const equipmentMeta = new Map(
    equipmentDocs.map((doc) => [doc.id, doc.exists ? (doc.data() as any) : {}])
  );

  const materialesIds = materialesSnap.docs.map((doc) => doc.id);
  const materialRefs = materialesIds.map((id) => adminDb().collection("materiales").doc(id));
  const materialDocs = materialRefs.length ? await adminDb().getAll(...materialRefs) : [];
  const materialMeta = new Map(
    materialDocs.map((doc) => [doc.id, doc.exists ? (doc.data() as any) : {}])
  );

  const equipos = equiposSnap.docs.map((doc) => {
    const data = doc.data() as any;
    const equipo = equipmentMeta.get(String(doc.id || "").trim()) || {};
    return {
      id: doc.id,
      sn: String(data?.SN || doc.id || "").trim(),
      tipo: String(equipo?.equipo || data?.equipo || "").trim(),
      proid: String(equipo?.proId || equipo?.proid || data?.proId || data?.proid || "").trim(),
      fDespachoYmd: String(equipo?.f_despachoYmd || equipo?.fDespachoYmd || data?.f_despachoYmd || data?.fDespachoYmd || "").trim(),
      guiaDespacho: String(equipo?.guia_despacho || equipo?.guiaDespacho || data?.guia_despacho || data?.guiaDespacho || "").trim(),
      observacion: String(equipo?.observacion || "").trim(),
      auditoria: readAuditoria(equipo?.auditoria),
    };
  }).sort((a, b) => {
    const da = antiquityDays(a.fDespachoYmd);
    const db = antiquityDays(b.fDespachoYmd);
    if (da !== db) return db - da;
    return a.tipo.localeCompare(b.tipo) || a.sn.localeCompare(b.sn);
  });

  const materiales = materialesSnap.docs.map((doc) => {
    const data = doc.data() as any;
    const meta = materialMeta.get(doc.id) || {};
    return {
      id: doc.id,
      nombre: String(meta?.nombre || doc.id).trim(),
      unidadTipo: String(meta?.unidadTipo || data?.unidadTipo || "").trim(),
      stockUnd: Number(data?.stockUnd || 0),
      stockCm: Number(data?.stockCm || 0),
    };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre));

  const bobinas = bobinasSnap.docs.map((doc) => {
    const data = doc.data() as any;
    return {
      id: doc.id,
      codigo: String(data?.codigo || doc.id || "").trim(),
      metrosRestantes: Number(data?.metrosRestantes ?? data?.metrosIniciales ?? 0),
      metrosIniciales: Number(data?.metrosIniciales ?? 0),
      fDespachoYmd: String(data?.f_despachoYmd || data?.fDespachoYmd || "").trim(),
    };
  }).sort((a, b) => {
    const da = antiquityDays(a.fDespachoYmd);
    const db = antiquityDays(b.fDespachoYmd);
    if (da !== db) return db - da;
    return a.codigo.localeCompare(b.codigo);
  });

  return {
    equipos,
    materiales,
    bobinas,
  };
}

function readAuditoria(value: any) {
  const map = value as Record<string, any> | null | undefined;
  if (!map || typeof map !== "object") return null;
  return {
    requiere: readBoolean(map, "requiere"),
    estado: readString(map, "estado"),
    fotoPath: readString(map, "fotoPath"),
    fotoURL: readString(map, "fotoURL"),
    actualizadoEn: readTimestampMillis(map["actualizadoEn"]),
    actualizadoPor: readString(map, "actualizadoPor"),
    marcadoPor: readString(map, "marcadoPor"),
    marcadoPorNombre: readString(map, "marcadoPorNombre"),
  };
}

function readString(map: Record<string, any>, key: string) {
  const value = map[key];
  return String(value || "").trim();
}

function readBoolean(map: Record<string, any>, key: string) {
  const value = map[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return false;
}

function readTimestampMillis(value: any) {
  if (!value) return null;
  if (typeof value?.toDate === "function") {
    try {
      return value.toDate().getTime();
    } catch {
      return null;
    }
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function sustainTecnicoStockEquipment(
  mobile: MobileAuthContext,
  sn: string,
  file: File,
) {
  const cleanSn = String(sn || "").trim().toUpperCase();
  if (!cleanSn) throw new Error("SN_REQUIRED");
  if (!(file instanceof File)) throw new Error("FILE_REQUIRED");

  const tecnico = await getTecnicoContext(mobile);
  const cuadrillaId = String(tecnico.cuadrilla.id || "").trim();
  if (!cuadrillaId) throw new Error("CUADRILLA_REQUIRED");

  const db = adminDb();
  const equipmentRef = db.collection("equipos").doc(cleanSn);
  const equipmentSnap = await equipmentRef.get();
  if (!equipmentSnap.exists) throw new Error("NOT_FOUND");

  const mimeType = String(file.type || "").trim().toLowerCase();
  const ext = mimeType.includes("png")
    ? "png"
    : mimeType.includes("webp")
      ? "webp"
      : "jpg";
  const path = `auditoria/${cleanSn}.${ext}`;
  const bucket = adminStorageBucket();
  const token = randomUUID();
  const buffer = Buffer.from(await file.arrayBuffer());

  await bucket.file(path).save(buffer, {
    contentType: ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg",
    metadata: {
      metadata: {
        firebaseStorageDownloadTokens: token,
        uploadedBy: mobile.uid,
        uploadedForCuadrilla: cuadrillaId,
      },
    },
  });

  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  const profile = await getMobileProfile(mobile.uid);
  const prev = (equipmentSnap.data() || {}) as any;
  const auditPayload = {
    ...(prev?.auditoria || {}),
    requiere: true,
    estado: "sustentada",
    fotoPath: path,
    fotoURL: url,
    actualizadoEn: FieldValue.serverTimestamp(),
    actualizadoPor: mobile.uid,
    marcadoPor: mobile.uid,
    marcadoPorNombre: profile.nombreCorto || profile.nombre || mobile.uid,
  };

  await equipmentRef.set(
    { auditoria: auditPayload },
    { merge: true }
  );

  const updatedSnap = await equipmentRef.get();
  const updatedEquipo = updatedSnap.data() || {};
  const seriesSnap = await db.collection("cuadrillas").doc(cuadrillaId).collection("equipos_series").doc(cleanSn).get();
  const series = seriesSnap.data() || {};

  return {
    id: cleanSn,
    sn: cleanSn,
    tipo: String(updatedEquipo?.equipo || series?.equipo || prev?.equipo || "").trim(),
    proid: String(updatedEquipo?.proId || updatedEquipo?.proid || prev?.proId || prev?.proid || "").trim(),
    fDespachoYmd: String(updatedEquipo?.f_despachoYmd || updatedEquipo?.fDespachoYmd || prev?.f_despachoYmd || series?.f_despachoYmd || series?.fDespachoYmd || "").trim(),
    guiaDespacho: String(updatedEquipo?.guia_despacho || updatedEquipo?.guiaDespacho || prev?.guia_despacho || series?.guia_despacho || series?.guiaDespacho || "").trim(),
    observacion: String(updatedEquipo?.observacion || prev?.observacion || "").trim(),
    auditoria: readAuditoria((updatedEquipo as any)?.auditoria),
  };
}

export async function getTecnicoMapData(cuadrillaId: string, ymd = todayLimaYmd()) {
  const items = await listTecnicoOrders(cuadrillaId, ymd);
  return items
    .filter((item) => item.lat !== null && item.lng !== null)
    .map((item) => ({
      id: item.id,
      ordenId: item.ordenId,
      cliente: item.cliente,
      codigoCliente: item.codigoCliente,
      direccion: item.direccion,
      estado: item.estado,
      tipoTrabajo: item.tipoTrabajo,
      fechaProgramadaHm: item.fechaProgramadaHm,
      lat: item.lat,
      lng: item.lng,
    }));
}
function antiquityDays(ymd: string | null | undefined) {
  if (!ymd) return -1;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd).trim());
  if (!match) return -1;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const ms = Date.UTC(year, month, day);
  if (!Number.isFinite(ms)) return -1;
  return Math.max(0, Math.floor((Date.now() - ms) / 86400000));
}
