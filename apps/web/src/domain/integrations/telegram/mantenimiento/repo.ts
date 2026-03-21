import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

export const TELEGRAM_MANT_UPDATES_COL = "telegram_updates_mantenimiento";
export const TELEGRAM_MANT_INGRESOS_COL = "telegram_mantenimiento_ingresos";
export const TELEGRAM_MANT_THREAD_MAPPINGS_COL = "telegram_mantenimiento_thread_mappings";

function clean(value: unknown): string {
  return String(value || "").trim();
}

export function buildTelegramMantKey(chatId: string, messageThreadId?: string | null) {
  const base = clean(chatId);
  const thread = clean(messageThreadId);
  return thread ? `${base}:${thread}` : `${base}:main`;
}

export async function resolveMappedCuadrilla(chatId: string, messageThreadId?: string | null) {
  const db = adminDb();
  const candidates = [buildTelegramMantKey(chatId, messageThreadId)];
  if (clean(messageThreadId)) candidates.push(buildTelegramMantKey(chatId, ""));

  for (const key of candidates) {
    const snap = await db.collection(TELEGRAM_MANT_THREAD_MAPPINGS_COL).doc(key).get();
    if (!snap.exists) continue;
    const data = snap.data() as any;
    if (clean(data?.estado || "ACTIVO").toUpperCase() !== "ACTIVO") continue;
    const cuadrillaId = clean(data?.cuadrillaId);
    if (!cuadrillaId) continue;
    const cuadrillaSnap = await db.collection("cuadrillas").doc(cuadrillaId).get();
    if (!cuadrillaSnap.exists) continue;
    const cuadrilla = cuadrillaSnap.data() as any;
    if (clean(cuadrilla?.area).toUpperCase() !== "MANTENIMIENTO") continue;
    return {
      key,
      mappingId: snap.id,
      topicName: clean(data?.topicName),
      cuadrillaId,
      cuadrillaNombre: clean(cuadrilla?.nombre || cuadrillaId),
    };
  }

  return null;
}

export async function registerTelegramMantIngreso(params: {
  dedupeId: string;
  updateId: number;
  rawUpdate: unknown;
  telegram: Record<string, unknown>;
  parsing: Record<string, unknown>;
  mapping: Record<string, unknown>;
  normalizedPayload: Record<string, unknown> | null;
  status: string;
}) {
  const db = adminDb();
  const updateRef = db.collection(TELEGRAM_MANT_UPDATES_COL).doc(params.dedupeId);
  const ingresoRef = db.collection(TELEGRAM_MANT_INGRESOS_COL).doc(params.dedupeId);

  let duplicated = false;
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(updateRef);
    if (existing.exists) {
      duplicated = true;
      return;
    }

    tx.set(updateRef, {
      dedupeId: params.dedupeId,
      updateId: params.updateId,
      createdAt: FieldValue.serverTimestamp(),
    });

    tx.set(ingresoRef, {
      source: "TELEGRAM",
      kind: "MANTENIMIENTO_TICKET",
      status: params.status,
      telegram: params.telegram,
      parsing: params.parsing,
      mapping: params.mapping,
      normalizedPayload: params.normalizedPayload,
      createTicket: {
        attempted: false,
        createdId: "",
        error: "",
      },
      rawUpdate: params.rawUpdate,
      audit: {
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
    });
  });

  return { duplicated, ingresoId: ingresoRef.id };
}
