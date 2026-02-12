import { FieldValue } from "firebase-admin/firestore";

export function normalizeBobinaCode(raw: string): string {
  const digits = String(raw ?? "").replace(/\s+/g, "").match(/\d+/g)?.join("") ?? "";
  if (!digits) throw new Error("BOBINA_CODIGO_INVALIDO");
  return `WIN-${digits}`.toUpperCase();
}

export function generateTransferId(): string {
  const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `TX-${Date.now()}-${rand}`;
}

export function buildGuiaCode(prefix: string, d: Date, seq: number): string {
  const year = d.getFullYear();
  const n = String(seq).padStart(6, "0");
  return `${prefix}-${year}-${n}`;
}

export const KIT_BASE_POR_ONT: Record<string, number> = {
  ACTA: 1,
  CONECTOR: 1,
  ROSETA: 1,
  ACOPLADOR: 1,
  PACHCORD: 1,
  CINTILLO_30: 4,
  CINTILLO_BANDERA: 1,
};

export type GuiaSequenceDoc = { counter: number; updatedAt?: any };

