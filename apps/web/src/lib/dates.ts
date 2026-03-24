import { Timestamp } from "firebase-admin/firestore";

export function ymdToTimestamp(ymd: string): Timestamp {
  // ymd: YYYY-MM-DD
  const [y, m, d] = ymd.split("-").map(Number);
  // Medianoche local (no crítico). Si quieres UTC estricto, lo cambiamos.
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
  return Timestamp.fromDate(dt);
}
