import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { SupervisorConfigInputSchema, type SupervisorDoc } from "./schemas";

export const SUPERVISORES_COL = "supervisores";

export type SupervisorGestionRow = {
  uid: string;
  nombres: string;
  apellidos: string;
  nombre: string;
  nombreCorto: string;
  email: string;
  celular: string;
  roles: string[];
  areas: string[];
  estadoAcceso: string;
  configExists: boolean;
  area: "INSTALACIONES" | "MANTENIMIENTO";
  estado: "HABILITADO" | "INHABILITADO";
  almacenHabilitado: boolean;
  trackingHabilitado: boolean;
  sectoresIds: string[];
  notas: string;
  vehiculoPlaca: string;
  vehiculoSoatVence: string;
  vehiculoRevTecVence: string;
  regionesHoy: string[];
  cuadrillasHoy: string[];
};

export function supervisoresCol() {
  return adminDb().collection(SUPERVISORES_COL);
}

function normalizeUpperList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.map((value) => String(value || "").toUpperCase()).filter(Boolean);
}

function shortName(full: string, fallback: string) {
  const parts = String(full || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = parts[0] || "";
  const firstLast = parts.length >= 4 ? parts[2] || "" : parts[1] || "";
  return `${first} ${firstLast}`.trim() || fallback;
}

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
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

function normalizeSupervisorDoc(uid: string, data: any | null | undefined): Pick<
  SupervisorGestionRow,
  "area" | "estado" | "almacenHabilitado" | "trackingHabilitado" | "sectoresIds" | "notas" | "vehiculoPlaca" | "vehiculoSoatVence" | "vehiculoRevTecVence"
> {
  const areaRaw = String(data?.area || "INSTALACIONES").toUpperCase();
  const estadoRaw = String(data?.estado || "HABILITADO").toUpperCase();
  return {
    area: areaRaw === "MANTENIMIENTO" ? "MANTENIMIENTO" : "INSTALACIONES",
    estado: estadoRaw === "INHABILITADO" ? "INHABILITADO" : "HABILITADO",
    almacenHabilitado: data?.almacenHabilitado !== false,
    trackingHabilitado: data?.trackingHabilitado !== false,
    sectoresIds: Array.isArray(data?.sectoresIds)
      ? data.sectoresIds.map((id: any) => String(id || "").trim()).filter(Boolean)
      : [],
    notas: String(data?.notas || ""),
    vehiculoPlaca: String(data?.vehiculoPlaca || "").trim().toUpperCase(),
    vehiculoSoatVence: String(data?.vehiculoSoatVence || "").trim(),
    vehiculoRevTecVence: String(data?.vehiculoRevTecVence || "").trim(),
  };
}

async function getProfileMap(uids: string[]) {
  const refs = uids.map((uid) => adminDb().collection("usuarios").doc(uid));
  const snaps = refs.length ? await adminDb().getAll(...refs) : [];
  return new Map(snaps.map((snap) => [snap.id, snap.exists ? (snap.data() as any) : {}]));
}

async function getSupervisorDocMap(uids: string[]) {
  const refs = uids.map((uid) => supervisoresCol().doc(uid));
  const snaps = refs.length ? await adminDb().getAll(...refs) : [];
  return new Map(snaps.map((snap) => [snap.id, snap.exists ? (snap.data() as any) : null]));
}

export async function listSupervisoresForGestion(area = "INSTALACIONES"): Promise<SupervisorGestionRow[]> {
  const areaFilter = String(area || "INSTALACIONES").trim().toUpperCase();
  const db = adminDb();
  const accessSnap = await db
    .collection("usuarios_access")
    .where("roles", "array-contains", "SUPERVISOR")
    .limit(1000)
    .get();

  const accessRows = accessSnap.docs
    .map((doc) => ({ uid: doc.id, data: (doc.data() as any) || {} }))
    .filter((row) => {
      if (!areaFilter) return true;
      const areas = normalizeUpperList(row.data?.areas);
      return areas.includes(areaFilter);
    });

  const uids = accessRows.map((row) => row.uid);
  const todayYmd = todayLimaYmd();

  const [profiles, configs, regionDaySnap, cuadrillaDaySnap, cuadrillaBaseSnap] = await Promise.all([
    getProfileMap(uids),
    getSupervisorDocMap(uids),
    db.collection("asignacion_supervisores_zona_dia").doc(todayYmd).get(),
    db.collection("asignacion_supervisores_dia").doc(todayYmd).get(),
    db.collection("asignacion_supervisores_base").doc("base").get(),
  ]);

  const regionMap = normalizeAssignMap((regionDaySnap.data() as any)?.supervisoresMap);
  const cuadrillaDayMap = normalizeAssignMap((cuadrillaDaySnap.data() as any)?.supervisoresMap);
  const cuadrillaBaseMap = normalizeAssignMap((cuadrillaBaseSnap.data() as any)?.supervisoresMap);
  const useDayForCuadrillas = Object.keys(cuadrillaDayMap).length > 0;

  const allCuadrillaIds = new Set<string>();
  [...Object.values(cuadrillaDayMap), ...Object.values(cuadrillaBaseMap)].flat().forEach((id) => allCuadrillaIds.add(id));

  const cuadrillaNameMap = new Map<string, string>();
  if (allCuadrillaIds.size > 0) {
    const cuadrillaRefs = Array.from(allCuadrillaIds).map((id) => db.collection("cuadrillas").doc(id));
    const cuadrillaSnaps = await db.getAll(...cuadrillaRefs);
    cuadrillaSnaps.forEach((snap) => {
      cuadrillaNameMap.set(snap.id, snap.exists ? String((snap.data() as any)?.nombre || snap.id) : snap.id);
    });
  }

  return accessRows
    .map((row) => {
      const profile = profiles.get(row.uid) || {};
      const config = configs.get(row.uid);
      const nombres = String(profile?.nombres || "").trim();
      const apellidos = String(profile?.apellidos || "").trim();
      const nombre = `${nombres} ${apellidos}`.trim() || row.uid;
      const normalized = normalizeSupervisorDoc(row.uid, config);
      const cuadrillasIds = useDayForCuadrillas
        ? (cuadrillaDayMap[row.uid] || [])
        : (cuadrillaBaseMap[row.uid] || []);
      return {
        uid: row.uid,
        nombres,
        apellidos,
        nombre,
        nombreCorto: shortName(nombre, row.uid),
        email: String(profile?.email || row.data?.email || "").trim(),
        celular: String(profile?.celular || "").trim(),
        roles: normalizeUpperList(row.data?.roles),
        areas: normalizeUpperList(row.data?.areas),
        estadoAcceso: String(row.data?.estadoAcceso || "INHABILITADO").toUpperCase(),
        configExists: Boolean(config),
        regionesHoy: regionMap[row.uid] || [],
        cuadrillasHoy: cuadrillasIds.map((id) => cuadrillaNameMap.get(id) || id),
        ...normalized,
      };
    })
    .sort((a, b) => a.nombreCorto.localeCompare(b.nombreCorto, "es", { sensitivity: "base" }));
}

export async function getSupervisorConfigByUid(uid: string): Promise<SupervisorDoc | null> {
  const cleanUid = String(uid || "").trim();
  if (!cleanUid) return null;
  const snap = await supervisoresCol().doc(cleanUid).get();
  return snap.exists ? ({ uid: cleanUid, ...(snap.data() as any) } as SupervisorDoc) : null;
}

async function assertUsuarioEsSupervisor(uid: string, area: string) {
  const snap = await adminDb().collection("usuarios_access").doc(uid).get();
  if (!snap.exists) throw new Error("SUPERVISOR_ACCESS_NOT_FOUND");
  const access = (snap.data() as any) || {};
  const roles = normalizeUpperList(access.roles);
  const areas = normalizeUpperList(access.areas);
  if (!roles.includes("SUPERVISOR")) throw new Error("SUPERVISOR_ROLE_REQUIRED");
  if (String(access.estadoAcceso || "").toUpperCase() !== "HABILITADO") {
    throw new Error("SUPERVISOR_ACCESS_DISABLED");
  }
  if (area === "INSTALACIONES" && !areas.includes("INSTALACIONES")) {
    throw new Error("SUPERVISOR_AREA_INSTALACIONES_REQUIRED");
  }
  if (area === "MANTENIMIENTO") {
    throw new Error("SUPERVISOR_MANTENIMIENTO_NOT_ENABLED");
  }
}

export async function upsertSupervisorConfig(input: unknown, actorUid: string) {
  const parsed = SupervisorConfigInputSchema.parse(input);
  const uid = parsed.uid;
  await assertUsuarioEsSupervisor(uid, parsed.area);

  const [profileSnap, currentSnap] = await Promise.all([
    adminDb().collection("usuarios").doc(uid).get(),
    supervisoresCol().doc(uid).get(),
  ]);

  const profile = profileSnap.exists ? (profileSnap.data() as any) : {};
  const nombres = String(profile?.nombres || "").trim();
  const apellidos = String(profile?.apellidos || "").trim();
  const nombre = `${nombres} ${apellidos}`.trim() || uid;

  const ref = supervisoresCol().doc(uid);
  const payload: Record<string, any> = {
    uid,
    nombre,
    nombreCorto: shortName(nombre, uid),
    email: String(profile?.email || "").trim(),
    celular: String(profile?.celular || "").trim(),
    area: parsed.area,
    estado: parsed.estado,
    almacenHabilitado: parsed.almacenHabilitado,
    trackingHabilitado: parsed.trackingHabilitado,
    sectoresIds: parsed.sectoresIds,
    notas: parsed.notas || "",
    vehiculoPlaca: String(parsed.vehiculoPlaca || "").trim().toUpperCase(),
    vehiculoSoatVence: String(parsed.vehiculoSoatVence || "").trim(),
    vehiculoRevTecVence: String(parsed.vehiculoRevTecVence || "").trim(),
    "audit.updatedAt": FieldValue.serverTimestamp(),
    "audit.updatedBy": actorUid,
  };

  if (!currentSnap.exists) {
    payload["audit.createdAt"] = FieldValue.serverTimestamp();
    payload["audit.createdBy"] = actorUid;
  }

  await ref.set(payload, { merge: true });
  return { uid };
}
