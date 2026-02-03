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

import { getFirebaseApp } from "@/lib/firebase/client";

const db = getFirestore(getFirebaseApp());

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

  return onSnapshot(q, async (snap) => {
    const items = await Promise.all(
      snap.docs.map(async (d) => {
        const data = d.data() as any;
        const notifId = d.id;
        const readId = `${uid}_${notifId}`;
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
  });
}

export async function markNotificationRead(uid: string, notifId: string) {
  const readId = `${uid}_${notifId}`;
  const ref = doc(db, "notificaciones_reads", readId);

  await setDoc(
    ref,
    { uid, notifId, readAt: serverTimestamp() },
    { merge: true }
  );
}
