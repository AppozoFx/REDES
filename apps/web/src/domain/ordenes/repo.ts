import { adminDb } from "@/lib/firebase/admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { OrdenDoc } from "./schemas";

export const ORDENES_COL = "ordenes";

export function ordenesCol() {
  return adminDb().collection(ORDENES_COL);
}

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
  // ymd
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  // hm 24h
  const hm = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(d)
    .replace(":", ":");
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

  const isCondominio = /CONDOMINIO/i.test(raw);
  const tipo = isCondominio ? "MOTO" : "RESIDENCIAL";
  const codigo = `K${numero}`;
  const id = `${codigo}_${tipo}`;

  const snap = await adminDb().collection("cuadrillas").doc(id).get();
  if (!snap.exists) {
    return {
      cuadrillaRaw: raw,
      cuadrillaCodigo: codigo,
      tipoCuadrilla: tipo,
      cuadrillaId: undefined,
      cuadrillaNombre: undefined,
      zonaCuadrilla: undefined,
      gestorCuadrilla: undefined,
      coordinadorCuadrilla: undefined,
    } as Partial<OrdenDoc>;
  }
  const c = snap.data() as any;
  return {
    cuadrillaRaw: raw,
    cuadrillaCodigo: codigo,
    tipoCuadrilla: tipo,
    cuadrillaId: snap.id,
    cuadrillaNombre: c?.nombre || undefined,
    zonaCuadrilla: c?.zonaId || undefined,
    gestorCuadrilla: c?.gestorUid || undefined,
    coordinadorCuadrilla: c?.coordinadorUid || undefined,
  } as Partial<OrdenDoc>;
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
    "teleMovilNume",
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
    "cuadrillaCodigo",
    "cuadrillaRaw",
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
  teleMovilNume?: string;
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
  const iniAt = input.fechaIniVisi ? limaLocalTimestampFrom(input.fechaIniVisi) : undefined;
  const finParts = input.fechaFinVisi ? toLimaStrings(input.fechaFinVisi) : null;
  const finAt = input.fechaFinVisi ? limaLocalTimestampFrom(input.fechaFinVisi) : undefined;

  const cuadrillaMeta = await enrichCuadrilla(input.cuadrilla);

  const base: Partial<OrdenDoc> = {
    ordenId,
    tipoOrden: input.tipoOrden || undefined,
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
    teleMovilNume: input.teleMovilNume || undefined,
    motivoCancelacion: input.motivoCancelacion || undefined,
    georeferenciaRaw: geo.georeferenciaRaw,
    lat: geo.lat,
    lng: geo.lng,

    fSoliAt,
    fSoliYmd: fSoliParts?.ymd,
    fSoliHm: fSoliParts?.hm,

    fechaIniVisiAt: iniAt,
    fechaIniVisiYmd: iniParts?.ymd,
    fechaIniVisiHm: iniParts?.hm,

    fechaFinVisiAt: finAt,
    fechaFinVisiYmd: finParts?.ymd,
    fechaFinVisiHm: finParts?.hm,
    ...cuadrillaMeta,
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
