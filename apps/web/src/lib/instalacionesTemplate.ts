// @ts-nocheck
import { FieldValue } from "firebase-admin/firestore";

export type FlatRow = Record<string, any>;

const isPlainObject = (v: any) =>
  v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date);

export function flattenObject(obj: any, prefix = "", out: FlatRow = {}) {
  if (!isPlainObject(obj)) return out;
  Object.entries(obj).forEach(([k, v]) => {
    if (v === undefined) return;
    const key = prefix ? `${prefix}.${k}` : k;
    if (isPlainObject(v)) {
      flattenObject(v, key, out);
      return;
    }
    if (Array.isArray(v)) {
      out[key] = JSON.stringify(v);
      return;
    }
    if (typeof v?.toDate === "function") {
      const d = v.toDate();
      out[key] = d.toISOString();
      return;
    }
    if (typeof v?._seconds === "number") {
      out[key] = new Date(v._seconds * 1000).toISOString();
      return;
    }
    out[key] = v;
  });
  return out;
}

export function collectHeaders(rows: FlatRow[]) {
  const set = new Set<string>();
  rows.forEach((r) => Object.keys(r).forEach((k) => set.add(k)));
  const all = Array.from(set);
  const prefer = ["id", "codigoCliente"];
  const rest = all.filter((k) => !prefer.includes(k)).sort();
  return [...prefer.filter((k) => all.includes(k)), ...rest];
}

function tryParseJSON(v: string) {
  const t = v.trim();
  if (!t) return null;
  if (!(t.startsWith("{") || t.startsWith("["))) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

export function parseCell(v: any) {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Date) return v.toISOString();
  const s = String(v).trim();
  if (!s) return undefined;
  const low = s.toLowerCase();
  if (low === "true") return true;
  if (low === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  const json = tryParseJSON(s);
  if (json !== null) return json;
  return s;
}

export function unflattenObject(flat: FlatRow) {
  const out: Record<string, any> = {};
  Object.entries(flat).forEach(([path, value]) => {
    if (value === undefined) return;
    const parts = path.split(".");
    let cur = out;
    parts.forEach((p, idx) => {
      if (idx === parts.length - 1) {
        cur[p] = value;
      } else {
        if (!isPlainObject(cur[p])) cur[p] = {};
        cur = cur[p];
      }
    });
  });
  return out;
}

export function addAuditPayload(payload: Record<string, any>, uid: string) {
  return {
    ...payload,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: uid,
  };
}


