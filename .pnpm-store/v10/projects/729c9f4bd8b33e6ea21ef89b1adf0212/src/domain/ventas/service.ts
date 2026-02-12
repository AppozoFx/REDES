import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export async function nextVentaId(prefix: string): Promise<string> {
  const db = adminDb();
  const year = new Date().getFullYear();
  const seqRef = db.collection("sequences").doc(`${prefix}_${year}`);
  const n = await db.runTransaction(async (tx) => {
    const snap = await tx.get(seqRef);
    const curr = snap.exists ? (snap.data() as any)?.counter || 0 : 0;
    const next = curr + 1;
    tx.set(seqRef, { counter: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return next as number;
  });
  return `${prefix}-${year}-${String(n).padStart(6, "0")}`;
}

export function centsToMoney(cents: number): number {
  return Math.round((cents ?? 0)) / 100;
}

export function moneyToCents(n: number): number {
  return Math.round((n ?? 0) * 100);
}
