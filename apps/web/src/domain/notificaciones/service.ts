"use server";

import { adminDb } from "@/lib/firebase/admin";
import { serverTimestamp } from "firebase-admin/firestore";

export type NotifType = "success" | "info" | "warn" | "error";
export type NotifAction = "CREATE" | "UPDATE" | "DISABLE" | "ENABLE" | "DELETE";
export type NotifScope = "ALL";

export type GlobalNotificationInput = {
  title: string;
  message: string;
  type: NotifType;
  scope?: NotifScope; // default ALL
  createdBy: string;

  entityType: string;
  entityId: string;
  action: NotifAction;

  estado?: "ACTIVO" | "ARCHIVADO";
};

export async function addGlobalNotification(input: GlobalNotificationInput) {
  const doc = {
    ...input,
    scope: input.scope ?? "ALL",
    estado: input.estado ?? "ACTIVO",
    createdAt: serverTimestamp(),
  };

  await adminDb().collection("notificaciones").add(doc);
}
