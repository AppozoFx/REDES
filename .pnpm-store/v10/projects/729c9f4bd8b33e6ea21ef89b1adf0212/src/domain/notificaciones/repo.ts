"use client";

import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  getFirestore,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { writeBatch } from "firebase/firestore";


import { getFirebaseApp } from "@/lib/firebase/client";

const app = getFirebaseApp();
const db = getFirestore(app);
// Debug: confirmar projectId del Firestore client
// eslint-disable-next-line no-console
try { console.log("[notifications repo] db.app.projectId", (db.app.options as any)?.projectId); } catch {}

export type NotificacionDoc = {
  id: string;
  title: string;
  message: string;
  type: "success" | "info" | "warn" | "error";
  scope: "ALL";
  createdAt?: any;
  createdBy: string;
  entityType: string;
  entityId: string;
  action: "CREATE" | "UPDATE" | "DISABLE" | "ENABLE" | "DELETE";
  estado: "ACTIVO" | "ARCHIVADO";
  read?: boolean;
};

export function listenGlobalNotifications(
  uid: string,
  onChange: (items: NotificacionDoc[]) => void,
  n = 20
) {
  const q = query(
    collection(db, "notificaciones"),
    where("scope", "==", "ALL"),
    where("estado", "==", "ACTIVO"),
    orderBy("createdAt", "desc"),
    limit(n)
  );

  // Log de subscripción (auth vs props)
  // eslint-disable-next-line no-console
  try { console.log("[listenGlobalNotifications] subscribe", { uid }); } catch {}
  return onSnapshot(
    q,
    async (snap) => {
      const authUid = getAuth(getFirebaseApp()).currentUser?.uid || uid;
      try { console.log("[listenGlobalNotifications] snapshot", { size: snap.size, ids: snap.docs.map(d=>d.id) }); } catch {}
      const items = await Promise.all(
        snap.docs.map(async (d) => {
          const data = d.data() as any;
          const notifId = d.id;
          const readId = `${authUid}_${notifId}`;
          const readRef = doc(db, "notificaciones_reads", readId);
          const readSnap = await getDoc(readRef);

          return {
            id: notifId,
            ...data,
            read: readSnap.exists(),
          } as NotificacionDoc;
        })
      );

      onChange(items);
    },
    (error) => {
      // Evitar "Uncaught Error in snapshot listener" y dejar la UI vacía
      console.error("[listenGlobalNotifications]", error?.code || error?.name, error?.message);
      onChange([]);
    }
  );
}

export async function markNotificationRead(uid: string, notifId: string) {
  const authUid = getAuth(getFirebaseApp()).currentUser?.uid || uid;
  const readId = `${authUid}_${notifId}`;
  const ref = doc(db, "notificaciones_reads", readId);

  await setDoc(
    ref,
    { uid: authUid, notifId, readAt: serverTimestamp() },
    { merge: true }
  );
}

export async function markAllNotificationsRead(uid: string, notifIds: string[]) {
  const authUid = getAuth(getFirebaseApp()).currentUser?.uid || uid;
  const batch = writeBatch(db);
  try { console.log("[markAllNotificationsRead] start", { uid: authUid, count: notifIds.length }); } catch {}

  for (const notifId of notifIds) {
    const readId = `${authUid}_${notifId}`;
    const ref = doc(db, "notificaciones_reads", readId);
    batch.set(ref, { uid: authUid, notifId, readAt: serverTimestamp() }, { merge: true });
  }

  await batch.commit();
  try { console.log("[markAllNotificationsRead] committed", { uid: authUid }); } catch {}
}
