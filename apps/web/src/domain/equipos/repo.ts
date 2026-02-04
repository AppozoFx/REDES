import { adminDb } from "@/lib/firebase/admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { EquipoDoc } from "./schemas";

export const EQUIPOS_COL = "equipos";

export function equiposCol() {
  return adminDb().collection(EQUIPOS_COL);
}

function omitUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

function toLimaStrings(d: Date): { ymd: string; hm: string } {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
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
  const { ymd, hm } = toLimaStrings(d);
  const [y, m, day] = ymd.split("-").map(Number);
  const [hh, mm] = hm.split(":").map(Number);
  const utcMillis = Date.UTC(y, (m ?? 1) - 1, day ?? 1, (hh ?? 0) + 5, mm ?? 0, 0, 0);
  return Timestamp.fromMillis(utcMillis);
}

export function parseExcelDateToDate(v: any): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v;
  if (typeof v === "number" && isFinite(v)) {
    // Excel serial date (1900-based). 25569 = days between 1899-12-30 and 1970-01-01
    const millis = Math.round((v - 25569) * 86400 * 1000);
    return new Date(millis);
  }
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

export function normalizeUbicacion(raw: string | undefined | null): { ubicacion: string; estado: string; invalid: boolean; isCuadrilla: boolean } {
  const base = String(raw ?? "").replace(/\s+/g, " ").trim();
  let up = base.toUpperCase();
  if (!up) up = "ALMACEN";

  // Cuadrilla formato: K{n} MOTO|RESIDENCIAL
  const cuRegex = /^K\s*\d+\s+(MOTO|RESIDENCIAL)$/i;
  const isCuadrilla = cuRegex.test(base);
  const allowed = new Set(["ALMACEN", "AVERIA", "GARANTIA", "WIN", "PERDIDO", "ROBO", "INSTALADOS"]);

  let invalid = false;
  if (isCuadrilla) {
    // Normalizar: K{n} {MODE}
    const m = base.match(/^(K)\s*(\d+)\s+(MOTO|RESIDENCIAL)$/i);
    if (m) up = `K${m[2]} ${m[3].toUpperCase()}`;
  } else if (!allowed.has(up)) {
    invalid = up !== "ALMACEN"; // si no matchea, forzar ALMACEN y marcar inválida 
    up = "ALMACEN";
  }

  // Derivar estado
  let estado = "ALMACEN";
  if (isCuadrilla) estado = "CAMPO";
  else if (up === "ALMACEN") estado = "ALMACEN";
  else if (up === "AVERIA" || up === "GARANTIA") estado = "ALMACEN";
  else if (up === "WIN") estado = "WIN";
  else if (up === "PERDIDO" || up === "ROBO") estado = "DESCONTADOS";
  else if (up === "INSTALADOS") estado = "INSTALADO";

  return { ubicacion: up, estado, invalid, isCuadrilla };
}

export function toDatePartsLima(d: Date | null): { at: Timestamp | null; ymd: string | null; hm: string | null } {
  if (!d) return { at: null, ymd: null, hm: null };
  const { ymd, hm } = toLimaStrings(d);
  return { at: limaLocalTimestampFrom(d), ymd, hm };
}

export async function getExistingSNs(sns: string[]): Promise<Set<string>> {
  const db = adminDb();
  const out = new Set<string>();
  const chunkSize = 300;
  for (let i = 0; i < sns.length; i += chunkSize) {
    const part = sns.slice(i, i + chunkSize);
    const refs = part.map((id) => db.collection(EQUIPOS_COL).doc(id));
    const snaps = await db.getAll(...refs);
    snaps.forEach((snap) => {
      if (snap.exists) out.add(snap.id);
    });
  }
  return out;
}

export async function createEquipo(doc: Omit<EquipoDoc, "audit">, actorUid: string): Promise<void> {
  const id = doc.SN;
  const ref = equiposCol().doc(id);
  const snap = await ref.get();
  if (snap.exists) return; // create-only

  const payload: Partial<EquipoDoc> = {
    ...omitUndefined(doc),
    audit: {
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actorUid,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actorUid,
    },
  } as any;

  await ref.set(payload);
}

