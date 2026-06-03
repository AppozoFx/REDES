import { adminDb } from "@/lib/firebase/admin";
import { getMobileProfile, buildShortPersonName } from "./mobile";
import type { MobileAuthContext } from "./mobile";
import { getSupervisorConfigByUid } from "@/domain/supervisores/repo";

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
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
  const n = toNum(v);
  return n === null ? 0 : Math.trunc(n);
}

function cleanValue(v: unknown) {
  return String(v || "").trim();
}

function isGarantia(x: any) {
  const txt = `${String(x?.tipo || "")} ${String(x?.tipoTraba || "")} ${String(x?.idenServi || "")} ${String(x?.tipoServicio || "")} ${String(x?.estado || "")}`.toUpperCase();
  return txt.includes("GARANTIA");
}

function normalizeAssignMap(data: any): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  Object.entries((data || {}) as Record<string, any>).forEach(([uid, list]) => {
    const cleanUid = String(uid || "").trim();
    if (!cleanUid) return;
    out[cleanUid] = Array.from(
      new Set((Array.isArray(list) ? list : []).map((id) => String(id || "").trim()).filter(Boolean))
    );
  });
  return out;
}

function normalizeText(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();
}

export async function getLatestOrdersUpdateInfoForSupervisor() {
  const db = adminDb();
  const notifsSnap = await db.collection("notificaciones").orderBy("createdAt", "desc").limit(60).get();
  const notifImport = notifsSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .find((n) => {
      const title = normalizeText(n?.title);
      const entityType = normalizeText(n?.entityType);
      if (entityType !== "ORDENES") return false;
      return title.includes("IMPORT") || title.includes("WINBO");
    });
  if (!notifImport) return null;
  const tsToIso = (v: any) => {
    if (!v) return null;
    if (typeof v?.toDate === "function") return v.toDate().toISOString();
    if (typeof v?.seconds === "number") return new Date(v.seconds * 1000).toISOString();
    return typeof v === "string" ? v : null;
  };
  return {
    at: tsToIso(notifImport.createdAt),
    byNombre: String(notifImport.createdBy || ""),
  };
}

export async function getSupervisorContext(mobile: MobileAuthContext) {
  const roles = (mobile.access.roles || []).map((role) => String(role || "").trim().toUpperCase());
  if (!roles.includes("SUPERVISOR") && !roles.includes("ADMIN")) {
    throw new Error("ROLE_SUPERVISOR_REQUIRED");
  }

  const profile = await getMobileProfile(mobile.uid);
  const config = await getSupervisorConfigByUid(mobile.uid);
  if (config && String(config.estado || "").toUpperCase() === "INHABILITADO") {
    throw new Error("SUPERVISOR_DISABLED");
  }

  return {
    uid: mobile.uid,
    nombre: profile.nombre,
    nombreCorto: profile.nombreCorto,
    area: String(config?.area || "INSTALACIONES"),
    trackingHabilitado: config?.trackingHabilitado !== false,
    vehiculoPlaca: String(config?.vehiculoPlaca || ""),  // ADD THIS
  };
}

export async function getSupervisorAssignments(uid: string, ymd: string) {
  const db = adminDb();
  const [regionDaySnap, cuadrillaDaySnap, cuadrillaBaseSnap] = await Promise.all([
    db.collection("asignacion_supervisores_zona_dia").doc(ymd).get(),
    db.collection("asignacion_supervisores_dia").doc(ymd).get(),
    db.collection("asignacion_supervisores_base").doc("base").get(),
  ]);

  const regionMap = normalizeAssignMap((regionDaySnap.data() as any)?.supervisoresMap);
  const cuadrillaDayMap = normalizeAssignMap((cuadrillaDaySnap.data() as any)?.supervisoresMap);
  const cuadrillaBaseMap = normalizeAssignMap((cuadrillaBaseSnap.data() as any)?.supervisoresMap);
  const useDayForCuadrillas = Object.keys(cuadrillaDayMap).length > 0;

  return {
    regionesHoy: regionMap[uid] || [],
    cuadrillasHoy: useDayForCuadrillas ? (cuadrillaDayMap[uid] || []) : (cuadrillaBaseMap[uid] || []),
  };
}

export async function listSupervisorOrders(cuadrillaIds: string[], ymd: string, onlyGarantias = false) {
  if (!cuadrillaIds.length) return [];
  const db = adminDb();
  const docsById = new Map<string, any>();

  await Promise.all(
    cuadrillaIds.flatMap((cuadrillaId) => [
      db.collection("ordenes").where("cuadrillaId", "==", cuadrillaId).where("fSoliYmd", "==", ymd).limit(500).get()
        .then((snap) => snap.docs.forEach((doc) => docsById.set(doc.id, doc.data()))),
      db.collection("ordenes").where("cuadrillaId", "==", cuadrillaId).where("fechaFinVisiYmd", "==", ymd).limit(500).get()
        .then((snap) => snap.docs.forEach((doc) => docsById.set(doc.id, doc.data()))),
    ])
  );

  const cuadrillaIds_set = new Set(cuadrillaIds);
  return Array.from(docsById.entries())
    .filter(([, data]) => {
      const primaryYmd = String(data?.fSoliYmd || "").trim();
      const fallbackYmd = String(data?.fechaFinVisiYmd || "").trim();
      if ((primaryYmd || fallbackYmd) !== ymd) return false;
      if (!cuadrillaIds_set.has(String(data?.cuadrillaId || "").trim())) return false;
      if (onlyGarantias && !isGarantia(data)) return false;
      return true;
    })
    .map(([id, data]) => ({
      id,
      ordenId: cleanValue(data?.ordenId || id),
      cliente: cleanValue(data?.cliente),
      codigoCliente: cleanValue(data?.codiSeguiClien),
      direccion: cleanValue(data?.direccion || data?.direccion1),
      estado: cleanValue(data?.estado),
      tipoTrabajo: cleanValue(data?.tipoTraba || data?.tipo),
      tipoServicio: cleanValue(data?.idenServi),
      fechaProgramadaHm: cleanValue(data?.fSoliHm || data?.fechaFinVisiHm),
      fechaProgramadaYmd: cleanValue(data?.fSoliYmd || data?.fechaFinVisiYmd),
      isGarantia: isGarantia(data),
      isFinalizada: String(data?.estado || "").trim().toUpperCase() === "FINALIZADA",
      region: cleanValue(data?.region || data?.zonaDistrito || data?.distrito),
      cuadrillaId: cleanValue(data?.cuadrillaId),
      cuadrillaNombre: cleanValue(data?.cuadrillaNombre),
      hasSupervision: !!data?.supervision?.supervisorUid,
      cantMesh: toInt(data?.cantMESHwin),
      cantFono: toInt(data?.cantFONOwin),
      cantBox: toInt(data?.cantBOXwin),
      lat: toNum(data?.lat),
      lng: toNum(data?.lng),
    }))
    .sort((a, b) =>
      a.fechaProgramadaHm.localeCompare(b.fechaProgramadaHm) || a.ordenId.localeCompare(b.ordenId)
    );
}

export async function getSupervisorOrderDetail(orderId: string, cuadrillaIds: string[]) {
  const snap = await adminDb().collection("ordenes").doc(orderId).get();
  if (!snap.exists) return null;

  const data = snap.data() as any;
  const orderCuadrillaId = String(data?.cuadrillaId || "").trim();
  if (cuadrillaIds.length && !cuadrillaIds.includes(orderCuadrillaId)) {
    throw new Error("ORDER_NOT_IN_SUPERVISOR_CUADRILLAS");
  }

  const supervision = data?.supervision || null;
  return {
    id: snap.id,
    ordenId: cleanValue(data?.ordenId || snap.id),
    cliente: cleanValue(data?.cliente),
    codigoCliente: cleanValue(data?.codiSeguiClien),
    documento: cleanValue(data?.documento || data?.nroDoc),
    telefono: cleanValue(data?.telefono || data?.celular),
    direccion: cleanValue(data?.direccion || data?.direccion1),
    estado: cleanValue(data?.estado),
    tipoTrabajo: cleanValue(data?.tipoTraba || data?.tipo),
    tipoServicio: cleanValue(data?.idenServi),
    fechaProgramadaHm: cleanValue(data?.fSoliHm || data?.fechaFinVisiHm),
    fechaProgramadaYmd: cleanValue(data?.fSoliYmd || data?.fechaFinVisiYmd),
    isGarantia: isGarantia(data),
    region: cleanValue(data?.region || data?.zonaDistrito || data?.distrito),
    cuadrillaId: orderCuadrillaId,
    cuadrillaNombre: cleanValue(data?.cuadrillaNombre),
    lat: toNum(data?.lat),
    lng: toNum(data?.lng),
    plan: cleanValue(data?.idenServi),
    diagnosticoGarantia: cleanValue(data?.diagnosticoGarantia),
    solucionGarantia: cleanValue(data?.solucionGarantia),
    responsableGarantia: cleanValue(data?.responsableGarantia),
    casoGarantia: cleanValue(data?.casoGarantia),
    imputadoGarantia: cleanValue(data?.imputadoGarantia),
    motivoGarantia: cleanValue(data?.motivoGarantia),
    supervision: supervision
      ? {
          notas: cleanValue(supervision.notas),
          estadoSupervision: cleanValue(supervision.estadoSupervision || "SUPERVISADA"),
          supervisorUid: cleanValue(supervision.supervisorUid),
          supervisadoEn: cleanValue(supervision.supervisadoEn),
        }
      : null,
  };
}

export async function saveSupervisorSupervision(
  orderId: string,
  supervisorUid: string,
  cuadrillaIds: string[],
  payload: { notas: string; observaciones: string }
) {
  const snap = await adminDb().collection("ordenes").doc(orderId).get();
  if (!snap.exists) throw new Error("ORDER_NOT_FOUND");
  const data = snap.data() as any;
  const orderCuadrillaId = String(data?.cuadrillaId || "").trim();
  if (cuadrillaIds.length && !cuadrillaIds.includes(orderCuadrillaId)) {
    throw new Error("ORDER_NOT_IN_SUPERVISOR_CUADRILLAS");
  }
  await adminDb().collection("ordenes").doc(orderId).set(
    {
      supervision: {
        notas: String(payload.notas || "").trim(),
        observaciones: String(payload.observaciones || "").trim(),
        estadoSupervision: "SUPERVISADA",
        supervisorUid,
        supervisadoEn: new Date().toISOString(),
      },
    },
    { merge: true }
  );
}
