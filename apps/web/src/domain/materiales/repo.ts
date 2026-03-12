import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import type { MaterialCreateInput, MaterialDoc, MaterialUpdateInput } from "./schemas";

export const MATERIALES_COL = "materiales";

export function materialesCol() {
  return adminDb().collection(MATERIALES_COL);
}

export function stripDiacritics(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/gi, (m) => (m === "ñ" ? "n" : "N"));
}

export function toId(nombre: string): string {
  const up = stripDiacritics(String(nombre ?? "").trim().toUpperCase());
  const cleaned = up.replace(/[^A-Z0-9 _]+/g, " ");
  const singleSp = cleaned.replace(/\s+/g, " ").trim();
  return singleSp.replace(/\s+/g, "_").replace(/_+/g, "_");
}

export function nombreNorm(nombre: string): string {
  const low = stripDiacritics(String(nombre ?? "").trim().toLowerCase());
  return low.replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

export function moneyToCents(n: number): number {
  return Math.round((n ?? 0) * 100);
}

export function metersToCm(m: number): number {
  return Math.round((m ?? 0) * 100);
}

export function roundUpToHalfSol(value: number): number {
  return Math.ceil((value ?? 0) * 2) / 2;
}

export function derivePrecioPorMetroCents(input: {
  precioPorMetroCents?: number | null;
  precioUndCents?: number | null;
  metrosPorUndCm?: number | null;
}): number | null {
  if (typeof input.precioPorMetroCents === "number" && Number.isFinite(input.precioPorMetroCents) && input.precioPorMetroCents > 0) {
    return Math.max(0, Math.floor(input.precioPorMetroCents));
  }
  const precioUndCents = Number(input.precioUndCents || 0);
  const metrosPorUndCm = Number(input.metrosPorUndCm || 0);
  if (!Number.isFinite(precioUndCents) || !Number.isFinite(metrosPorUndCm) || precioUndCents <= 0 || metrosPorUndCm <= 0) {
    return null;
  }
  const metrosPorUnd = metrosPorUndCm / 100;
  if (metrosPorUnd <= 0) return null;
  const precioUnd = precioUndCents / 100;
  const precioPorMetro = roundUpToHalfSol(precioUnd / metrosPorUnd);
  return moneyToCents(precioPorMetro);
}

function normalizeVentaUnidadTipos(
  unidadTipo: "UND" | "METROS",
  ventaUnidadTipos?: Array<"UND" | "METROS">
): Array<"UND" | "METROS"> {
  const unique = Array.from(new Set((ventaUnidadTipos || []).filter(Boolean))) as Array<"UND" | "METROS">;
  if (unidadTipo === "UND") return ["UND"];
  const filtered = unique.filter((x) => x === "UND" || x === "METROS");
  return filtered.length ? filtered : ["METROS"];
}

export async function existsByNombreNorm(norm: string): Promise<boolean> {
  const snap = await materialesCol().where("nombreNorm", "==", norm).limit(1).get();
  return !snap.empty;
}

export async function getMaterial(id: string): Promise<MaterialDoc | null> {
  const ref = materialesCol().doc(id);
  const snap = await ref.get();
  return snap.exists ? (snap.data() as MaterialDoc) : null;
}

export async function createMaterial(input: MaterialCreateInput, actorUid: string): Promise<{ id: string }> {
  const id = toId(input.nombre);
  const ref = materialesCol().doc(id);
  const prev = await ref.get();
  if (prev.exists) throw new Error("MATERIAL_ID_EXISTS");

  const norm = nombreNorm(input.nombre);
  const dup = await existsByNombreNorm(norm);
  if (dup) throw new Error("MATERIAL_NAME_EXISTS");

  const base: any = {
    id,
    nombre: stripDiacritics(input.nombre).toUpperCase(),
    nombreNorm: norm,
    descripcion: input.descripcion ?? "",
    areas: input.areas,
    estado: "ACTIVO",
    vendible: input.vendible,
    audit: {
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actorUid,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actorUid,
    },
  };

  if (input.unidadTipo === "UND") {
    base.unidadTipo = "UND";
    base.ventaUnidadTipos = ["UND"];
    base.stockUnd = 0;
    if (typeof input.minStockUnd === "number") base.minStockUnd = Math.max(0, Math.floor(input.minStockUnd));
    if (input.vendible) {
      if (typeof input.precioUnd !== "number") throw new Error("PRECIO_UND_REQUIRED");
      base.precioUndCents = moneyToCents(input.precioUnd);
    }
  } else {
    base.unidadTipo = "METROS";
    const ventaUnidadTipos = normalizeVentaUnidadTipos("METROS", input.ventaUnidadTipos as Array<"UND" | "METROS"> | undefined);
    base.ventaUnidadTipos = ventaUnidadTipos;
    if (typeof input.metrosPorUnd !== "number" || input.metrosPorUnd <= 0) throw new Error("METROS_POR_UND_REQUIRED");
    base.metrosPorUndCm = metersToCm(input.metrosPorUnd);
    base.stockCm = 0;
    if (typeof input.minStockMetros === "number") base.minStockCm = Math.max(0, metersToCm(input.minStockMetros));
    if (input.vendible) {
      if (ventaUnidadTipos.includes("UND")) {
        if (typeof input.precioUnd !== "number") throw new Error("PRECIO_UND_REQUIRED");
        base.precioUndCents = moneyToCents(input.precioUnd);
      }
      if (ventaUnidadTipos.includes("METROS")) {
        if (typeof input.precioPorMetro !== "number") throw new Error("PRECIO_POR_METRO_REQUIRED");
        const centsPerMeter = moneyToCents(input.precioPorMetro);
        base.precioPorMetroCents = centsPerMeter;
        base.precioPorCmCents = Math.round(centsPerMeter / 100);
      }
    }
  }

  await ref.set(base);
  return { id };
}

export async function listMateriales(params: {
  q?: string;
  unidadTipo?: "UND" | "METROS";
  area?: string;
  vendible?: boolean;
  limit?: number;
}): Promise<MaterialDoc[]> {
  const db = materialesCol();
  let qref: FirebaseFirestore.Query = db;
  if (params.unidadTipo) qref = qref.where("unidadTipo", "==", params.unidadTipo);
  if (typeof params.vendible === "boolean") qref = qref.where("vendible", "==", params.vendible);
  if (params.area) qref = qref.where("areas", "array-contains", params.area);
  const limitN = params.limit ?? 200;
  // Nota: filtro de texto se hace client-side por simplicidad (nombre/id)
  const snap = await qref.limit(limitN).get();
  const items = snap.docs.map((d) => d.data() as MaterialDoc);
  const needle = String(params.q ?? "").trim().toLowerCase();
  if (!needle) return items;
  return items.filter((m) =>
    [m.id, m.nombre, (m as any).descripcion ?? ""].some((v) => String(v ?? "").toLowerCase().includes(needle))
  );
}

export async function updateMaterial(input: MaterialUpdateInput, actorUid: string): Promise<void> {
  const ref = materialesCol().doc(input.id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("MATERIAL_NOT_FOUND");
  const curr = snap.data() as MaterialDoc;

  // Validar unidad: no permitir cambiar tipo (migración aparte)
  if (curr.unidadTipo !== input.unidadTipo) throw new Error("UNIT_TYPE_CHANGE_NOT_ALLOWED");

  const norm = nombreNorm(input.nombre);
  // Verificar duplicidad de nombreNorm en otros docs
  const dupQ = await materialesCol().where("nombreNorm", "==", norm).limit(2).get();
  const duplicate = dupQ.docs.some((d) => d.id !== input.id);
  if (duplicate) throw new Error("MATERIAL_NAME_EXISTS");

  const base: any = {
    nombre: stripDiacritics(input.nombre).toUpperCase(),
    nombreNorm: norm,
    descripcion: input.descripcion ?? "",
    areas: input.areas,
    vendible: input.vendible,
    audit: {
      ...(curr as any).audit,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actorUid,
    },
  };

  if (curr.unidadTipo === "UND") {
    base.ventaUnidadTipos = ["UND"];
    if (typeof input.minStockUnd === "number") base.minStockUnd = Math.max(0, Math.floor(input.minStockUnd));
    if (input.vendible) {
      if (typeof input.precioUnd !== "number") throw new Error("PRECIO_UND_REQUIRED");
      base.precioUndCents = moneyToCents(input.precioUnd);
    } else {
      base.precioUndCents = FieldValue.delete();
    }
  } else {
    const ventaUnidadTipos = normalizeVentaUnidadTipos("METROS", input.ventaUnidadTipos as Array<"UND" | "METROS"> | undefined);
    base.ventaUnidadTipos = ventaUnidadTipos;
    if (typeof input.metrosPorUnd !== "number" || input.metrosPorUnd <= 0) throw new Error("METROS_POR_UND_REQUIRED");
    base.metrosPorUndCm = metersToCm(input.metrosPorUnd);
    if (typeof input.minStockMetros === "number") base.minStockCm = Math.max(0, metersToCm(input.minStockMetros));
    if (input.vendible) {
      if (ventaUnidadTipos.includes("UND")) {
        if (typeof input.precioUnd !== "number") throw new Error("PRECIO_UND_REQUIRED");
        base.precioUndCents = moneyToCents(input.precioUnd);
      } else {
        base.precioUndCents = FieldValue.delete();
      }
      if (ventaUnidadTipos.includes("METROS")) {
        if (typeof input.precioPorMetro !== "number") throw new Error("PRECIO_POR_METRO_REQUIRED");
        const centsPerMeter = moneyToCents(input.precioPorMetro);
        base.precioPorMetroCents = centsPerMeter;
        base.precioPorCmCents = Math.round(centsPerMeter / 100);
      } else {
        base.precioPorMetroCents = FieldValue.delete();
        base.precioPorCmCents = FieldValue.delete();
      }
    } else {
      base.precioUndCents = FieldValue.delete();
      base.precioPorMetroCents = FieldValue.delete();
      base.precioPorCmCents = FieldValue.delete();
    }
  }

  await ref.update(base);
}
