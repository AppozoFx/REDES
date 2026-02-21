import { adminDb } from "@/lib/firebase/admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { OrdenDoc } from "./schemas";

export const ORDENES_COL = "ordenes";

export function ordenesCol() {
  return adminDb().collection(ORDENES_COL);
}

const cuadrillaMetaCache = new Map<string, Partial<OrdenDoc>>();

function omitUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

function parseLatLng(raw: string | undefined | null): { lat?: number; lng?: number; georeferenciaRaw?: string } {
  const s = (raw ?? "").trim();
  if (!s) return {};
  const parts = s.split(",").map((x) => x.trim());
  if (parts.length !== 2) return { georeferenciaRaw: s };
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!isFinite(lat) || !isFinite(lng)) return { georeferenciaRaw: s };
  return { lat, lng, georeferenciaRaw: s };
}

function toLimaStrings(d: Date): { ymd: string; hm: string } {
  // Excel date-time values are interpreted in UTC-like wall time; keep that wall time
  // to avoid shifting the intended tramo by timezone conversions.
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  let hh = d.getUTCHours();
  let mm = d.getUTCMinutes();
  const ss = d.getUTCSeconds();
  if (ss >= 30) {
    mm += 1;
    if (mm >= 60) {
      mm = 0;
      hh = (hh + 1) % 24;
    }
  }
  const ymd = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const hm = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  return { ymd, hm };
}

function limaLocalTimestampFrom(d: Date): Timestamp {
  // Build Timestamp matching Lima local wall-clock by converting to UTC adding 5 hours
  const { ymd, hm } = toLimaStrings(d);
  const [y, m, day] = ymd.split("-").map(Number);
  const [hh, mm] = hm.split(":").map(Number);
  const utcMillis = Date.UTC(y, (m ?? 1) - 1, day ?? 1, (hh ?? 0) + 5, mm ?? 0, 0, 0);
  return Timestamp.fromMillis(utcMillis);
}

export async function enrichCuadrilla(metaRaw: string | undefined) {
  const raw = String(metaRaw ?? "");
  if (!raw) return { cuadrillaRaw: raw } as Partial<OrdenDoc>;

  const m = raw.match(/K\s*(\d+)/i);
  const numero = m ? Number(m[1]) : undefined;
  if (!numero || !isFinite(numero)) return { cuadrillaRaw: raw } as Partial<OrdenDoc>;

  // Regla: contiene MOTOWIN => MOTO, si no => RESIDENCIAL
  const tipo = /MOTOWIN/i.test(raw) ? "MOTO" : "RESIDENCIAL";
  const codigo = `K${numero}`;
  const id = `${codigo}_${tipo}`;
  const cached = cuadrillaMetaCache.get(id);
  if (cached) return cached;

  const snap = await adminDb().collection("cuadrillas").doc(id).get();
  if (!snap.exists) {
    const miss = {
      cuadrillaRaw: raw,
      tipoCuadrilla: tipo,
      cuadrillaId: id, // guardar ID calculado aun si no existe doc
      cuadrillaNombre: id.replace("_", " "),
      zonaCuadrilla: undefined,
      gestorCuadrilla: undefined,
      coordinadorCuadrilla: undefined,
    } as Partial<OrdenDoc>;
    cuadrillaMetaCache.set(id, miss);
    return miss;
  }
  const c = snap.data() as any;
  const found = {
    cuadrillaRaw: raw,
    tipoCuadrilla: tipo,
    cuadrillaId: snap.id,
    cuadrillaNombre: snap.id.replace("_", " "),
    zonaCuadrilla: c?.zonaId || undefined,
    gestorCuadrilla: c?.gestorUid || undefined,
    coordinadorCuadrilla: c?.coordinadorUid || undefined,
  } as Partial<OrdenDoc>;
  cuadrillaMetaCache.set(id, found);
  return found;
}

function deriveOpcionalesFromIdenServi(textRaw: string | undefined) {
  const text = String(textRaw ?? "");
  if (!text) return {} as Partial<OrdenDoc>;

  const out: Record<string, string> = {};

  // planGamer + cat6
  if (/INTERNETGAMER/i.test(text)) {
    out.planGamer = "GAMER";
    out.cat6 = "1";
  }

  // kitWifiPro
  if (/KIT\s+WIFI\s+PRO\s*\(EN\s+VENTA\)/i.test(text)) {
    out.kitWifiPro = "KIT WIFI PRO (AL CONTADO)";
  }

  // servicioCableadoMesh
  if (/SERVICIO\s+CABLEADO\s+DE\s+MESH/i.test(text)) {
    out.servicioCableadoMesh = "SERVICIO CABLEADO DE MESH";
  }

  // cantMESHwin
  let cantMeshFromCantidad: number | undefined;
  const mCantidad = text.match(/Cantidad\s+de\s+Mesh:\s*(\d+)/i);
  if (mCantidad) {
    const n = Number(mCantidad[1]);
    if (isFinite(n) && n > 0) cantMeshFromCantidad = n;
  }
  const hasComodatoMesh = /MESH\s*\(EN\s+COMODATO\)/i.test(text);
  if (cantMeshFromCantidad !== undefined) out.cantMESHwin = String(cantMeshFromCantidad);
  else if (hasComodatoMesh) out.cantMESHwin = "1";
  else out.cantMESHwin = "0";

  // cantFONOwin
  out.cantFONOwin = /FONO\s+WIN\s+100/i.test(text) ? "1" : "0";

  // cantBOXwin = comodato + adicionales
  let comodato = 0;
  let adicionales = 0;
  const mComodato = text.match(/(\d+)\s+WIN\s+BOX\s*\(EN\s+COMODATO\)/i);
  if (mComodato) {
    const n = Number(mComodato[1]);
    if (isFinite(n) && n > 0) comodato = n;
  }
  const mAdic = text.match(/\+\s*(\d+)\s+WIN\s+BOX/i);
  if (mAdic) {
    const n = Number(mAdic[1]);
    if (isFinite(n) && n > 0) adicionales = n;
  }
  const totalBox = comodato + adicionales;
  out.cantBOXwin = String(totalBox);

  return out as Partial<OrdenDoc>;
}

function pickBusinessComparable(doc: Partial<OrdenDoc>): Record<string, any> {
  const t = (x: any) => (x && typeof x.toMillis === "function" ? x.toMillis() : x);
  const keys = [
    "tipoOrden",
    "tipoTraba",
    "cliente",
    "tipo",
    "tipoClienId",
    "estado",
    "direccion",
    "direccion1",
    "idenServi",
    "region",
    "zonaDistrito",
    "codiSeguiClien",
    "numeroDocumento",
    "telefono",
    "motivoCancelacion",
    "lat",
    "lng",
    "fSoliAt",
    "fSoliYmd",
    "fSoliHm",
    "fechaIniVisiAt",
    "fechaIniVisiYmd",
    "fechaIniVisiHm",
    "fechaFinVisiAt",
    "fechaFinVisiYmd",
    "fechaFinVisiHm",
    "cuadrillaId",
    "cuadrillaNombre",
    "tipoCuadrilla",
    "zonaCuadrilla",
    "gestorCuadrilla",
    "coordinadorCuadrilla",
    "cuadrillaRaw",
    "dia",
    // opcionales
    "planGamer",
    "cat6",
    "kitWifiPro",
    "servicioCableadoMesh",
    "cantMESHwin",
    "cantFONOwin",
    "cantBOXwin",
  ];
  const out: Record<string, any> = {};
  for (const k of keys) {
    if ((doc as any)[k] !== undefined) out[k] = t((doc as any)[k]);
  }
  return out;
}

export async function upsertOrden(input: {
  ordenId: string;
  tipoOrden?: string;
  tipoTraba?: string;
  fSoli?: Date | null;
  cliente?: string;
  tipo?: string;
  tipoClienId?: string;
  cuadrilla?: string;
  estado?: string;
  direccion?: string;
  direccion1?: string;
  idenServi?: string;
  region?: string;
  zonaDistrito?: string;
  codiSeguiClien?: string;
  numeroDocumento?: string;
  telefono?: string;
  fechaFinVisi?: Date | null;
  fechaIniVisi?: Date | null;
  motivoCancelacion?: string;
  georeferencia?: string;
}, actorUid: string): Promise<"CREATED" | "UPDATED" | "UNCHANGED"> {
  const ordenId = String(input.ordenId ?? "").trim();
  if (!ordenId) throw new Error("ORDEN_ID_VACIO");

  const ref = ordenesCol().doc(ordenId);
  const snap = await ref.get();

  const geo = parseLatLng(input.georeferencia);

  // fechas
  const fSoliParts = input.fSoli ? toLimaStrings(input.fSoli) : null;
  const fSoliAt = input.fSoli ? limaLocalTimestampFrom(input.fSoli) : undefined;
  const iniParts = input.fechaIniVisi ? toLimaStrings(input.fechaIniVisi) : null;
  const iniAt = input.fechaIniVisi ? limaLocalTimestampFrom(input.fechaIniVisi) : null;
  const finParts = input.fechaFinVisi ? toLimaStrings(input.fechaFinVisi) : null;
  const finAt = input.fechaFinVisi ? limaLocalTimestampFrom(input.fechaFinVisi) : null;

  const cuadrillaMeta = await enrichCuadrilla(input.cuadrilla);
  const opcionales = deriveOpcionalesFromIdenServi(input.idenServi);
  // Derivar dia (Lima) basado en fSoli si existe
  let dia: string | undefined = undefined;
  if (input.fSoli) {
    const d = input.fSoli;
    try {
      const weekday = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", weekday: "long" }).format(d);
      dia = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    } catch {}
  }
  // Derivar tipoOrden en base a tipo
  const tipoOrdenDerived = input.tipo === "Condominio/Edificio" ? "CONDOMINIO" : "RESIDENCIAL";

  const base: Partial<OrdenDoc> = {
    ordenId,
    tipoOrden: tipoOrdenDerived,
    tipoTraba: input.tipoTraba || undefined,
    cliente: input.cliente || undefined,
    tipo: input.tipo || undefined,
    tipoClienId: input.tipoClienId || undefined,
    estado: input.estado || undefined,
    direccion: input.direccion || undefined,
    direccion1: input.direccion1 || undefined,
    idenServi: input.idenServi || undefined,
    region: input.region || undefined,
    zonaDistrito: input.zonaDistrito || undefined,
    codiSeguiClien: input.codiSeguiClien || undefined,
    numeroDocumento: input.numeroDocumento || undefined,
    telefono: input.telefono || undefined,
    motivoCancelacion: input.motivoCancelacion || undefined,
    georeferenciaRaw: geo.georeferenciaRaw,
    lat: geo.lat,
    lng: geo.lng,

    fSoliAt,
    fSoliYmd: fSoliParts?.ymd,
    fSoliHm: fSoliParts?.hm,

    fechaIniVisiAt: iniAt,
    fechaIniVisiYmd: iniParts?.ymd ?? "",
    fechaIniVisiHm: iniParts?.hm ?? "",

    fechaFinVisiAt: finAt,
    fechaFinVisiYmd: finParts?.ymd ?? "",
    fechaFinVisiHm: finParts?.hm ?? "",
    dia,
    ...cuadrillaMeta,
    ...opcionales,
  };

  if (!snap.exists) {
    await ref.set({
      ...omitUndefined(base),
      audit: {
        createdAt: FieldValue.serverTimestamp(),
        createdBy: actorUid,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actorUid,
      },
    });
    return "CREATED";
  }

  const curr = snap.data() as any as OrdenDoc;
  const before = pickBusinessComparable(curr || {});
  const after = pickBusinessComparable(base);

  const same = JSON.stringify(before) === JSON.stringify(after);
  if (same) return "UNCHANGED";

  await ref.set(
    {
      ...omitUndefined(base),
      "audit.updatedAt": FieldValue.serverTimestamp(),
      "audit.updatedBy": actorUid,
    },
    { merge: true }
  );
  return "UPDATED";
}
