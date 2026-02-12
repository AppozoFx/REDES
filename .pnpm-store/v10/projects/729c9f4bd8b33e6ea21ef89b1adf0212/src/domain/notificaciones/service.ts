"use server";

import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export type GlobalNotificationInput = {
  title: string;
  message: string;
  type: "success" | "info" | "warn" | "error";
  scope: "ALL";
  createdBy: string;
  entityType: string;
  entityId: string;
  action: "CREATE" | "UPDATE" | "DISABLE" | "ENABLE" | "DELETE";
  estado: "ACTIVO" | "ARCHIVADO";
};

export async function addGlobalNotification(input: GlobalNotificationInput) {
  await adminDb().collection("notificaciones").add({
    ...input,
    createdAt: FieldValue.serverTimestamp(), // ✅ ESTA ES LA CLAVE
  });
}
