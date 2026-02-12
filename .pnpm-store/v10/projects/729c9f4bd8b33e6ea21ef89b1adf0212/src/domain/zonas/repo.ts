import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { ZonaCreateSchema, ZonaDocSchema, ZonaUpdateSchema } from "./schemas";

export const ZONAS_COL = "zonas";
export const ZONAS_COUNTERS_COL = "zonas_counters"; // docId: ZONA (MAYÚSCULA)

export function zonasCol() {
  return adminDb().collection(ZONAS_COL);
}

export function zonasCountersCol() {
  return adminDb().collection(ZONAS_COUNTERS_COL);
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function normalizeSpaces(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function normalizeUpper(s: string) {
  return normalizeSpaces(s).toUpperCase();
}

function normalizeDistritos(input: string[] | undefined): string[] {
  const arr = Array.isArray(input) ? input : [];
  const norm = arr
    .map((x) => normalizeUpper(String(x)))
    .filter((x) => x.length > 0);
  return Array.from(new Set(norm));
}

export async function listZonas() {
  const qs = await zonasCol()
    .orderBy("zona", "asc")
    .orderBy("numero", "asc")
    .get();
  return qs.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

export async function getZonaById(id: string) {
  const snap = await zonasCol().doc(id).get();
  return snap.exists ? ({ id: snap.id, ...(snap.data() as any) } as any) : null;
}

/**
 * Crea zona con numeración automática por ZONA (Opción A: zonas_counters/{ZONA})
 * - zona: uppercased y colapso de espacios
 * - distritos: uppercased y deduplicados
 * - numero: autoincrement por zona
 * - id: `${ZONA}_${pad2(numero)}`
 * - nombre: `${ZONA} ${numero}`
 */
export async function createZona(
  input: unknown,
  actorUid: string
): Promise<{ id: string }> {
  const parsed = ZonaCreateSchema.parse(input);

  const ZONA = normalizeUpper(parsed.zona);
  const distritos = normalizeDistritos(parsed.distritos);
  const estado = parsed.estado ?? "HABILITADO";
  const tipo = parsed.tipo;

  const db = adminDb();
  const counters = zonasCountersCol().doc(ZONA);

  const result = await db.runTransaction(async (tx) => {
    const counterSnap = await tx.get(counters);
    const lastNumero = (counterSnap.exists ? (counterSnap.data() as any)?.lastNumero : 0) || 0;
    const next = Number(lastNumero) + 1;

    const id = `${ZONA}_${pad2(next)}`;
    const docRef = zonasCol().doc(id);
    const docSnap = await tx.get(docRef);
    if (docSnap.exists) {
      // extremadamente raro, pero prevenimos colisión
      throw new Error("ZONA_ID_CONFLICT");
    }

    tx.set(counters, { lastNumero: next }, { merge: true });
    tx.set(docRef, {
      zona: ZONA,
      numero: next,
      nombre: `${ZONA} ${next}`,
      estado,
      tipo,
      distritos,
      audit: {
        createdAt: FieldValue.serverTimestamp(),
        createdBy: actorUid,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actorUid,
      },
    });

    return { id };
  });

  return result;
}

/**
 * Actualiza zona: no permite editar zona/numero/nombre (deriva de zona+numero).
 * Permitido: estado, tipo, distritos.
 */
export async function updateZona(
  id: string,
  patchInput: unknown,
  actorUid: string
) {
  const patch = ZonaUpdateSchema.parse(patchInput);
  const toSet: Record<string, any> = {};

  if (patch.estado !== undefined) toSet.estado = patch.estado;
  if (patch.tipo !== undefined) toSet.tipo = patch.tipo;
  if (patch.distritos !== undefined) toSet.distritos = normalizeDistritos(patch.distritos);

  if (Object.keys(toSet).length === 0) return; // nada que actualizar

  await zonasCol()
    .doc(id)
    .set(
      {
        ...toSet,
        "audit.updatedAt": FieldValue.serverTimestamp(),
        "audit.updatedBy": actorUid,
      },
      { merge: true }
    );
}

export async function disableZona(id: string, actorUid: string) {
  await zonasCol()
    .doc(id)
    .set(
      {
        estado: "INHABILITADO",
        "audit.deletedAt": FieldValue.serverTimestamp(),
        "audit.deletedBy": actorUid,
        "audit.updatedAt": FieldValue.serverTimestamp(),
        "audit.updatedBy": actorUid,
      },
      { merge: true }
    );
}

export async function enableZona(id: string, actorUid: string) {
  await zonasCol()
    .doc(id)
    .set(
      {
        estado: "HABILITADO",
        "audit.deletedAt": FieldValue.delete(),
        "audit.deletedBy": FieldValue.delete(),
        "audit.updatedAt": FieldValue.serverTimestamp(),
        "audit.updatedBy": actorUid,
      },
      { merge: true }
    );
}
