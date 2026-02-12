import { adminDb } from "@/lib/firebase/admin"; // usa tu helper real
import { FieldValue } from "firebase-admin/firestore";
import { FieldPath } from "firebase-admin/firestore";


export const PERMISSIONS_COL = "permissions";

export function permissionsCol() {
  return adminDb().collection(PERMISSIONS_COL);
}

export async function getPermissionById(id: string) {
  const snap = await permissionsCol().doc(id).get();
  return snap.exists ? ({ id: snap.id, ...snap.data() } as any) : null;
}



export async function listActivePermissions() {
  const qs = await permissionsCol()
    .where("estado", "==", "ACTIVO")
    .orderBy("modulo", "asc")
    .orderBy(FieldPath.documentId(), "asc")
    .get();

  return qs.docs.map((d) => ({ id: d.id, ...d.data() } as any));
}



export async function listPermissions() {
  const qs = await permissionsCol()
    .orderBy("modulo", "asc")
    .orderBy(FieldPath.documentId(), "asc")
    .get();

  return qs.docs.map((d) => ({ id: d.id, ...d.data() } as any));
}


export async function createPermission(
  data: { id: string; nombre: string; descripcion?: string; modulo: string },
  actorUid: string
) {
  const ref = permissionsCol().doc(data.id);
  const exists = await ref.get();
  if (exists.exists) throw new Error("PERMISSION_ALREADY_EXISTS");

  await ref.set({
    ...data,
    estado: "ACTIVO",
    audit: {
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actorUid,
    },
  });
}

export async function updatePermission(
  id: string,
  patch: Record<string, unknown>,
  actorUid: string
) {
  const ref = permissionsCol().doc(id);
  await ref.update({
    ...patch,
    "audit.updatedAt": FieldValue.serverTimestamp(),
    "audit.updatedBy": actorUid,
  });
}

export async function softDisablePermission(
  id: string,
  actorUid: string
) {
  const ref = permissionsCol().doc(id);
  await ref.update({
    estado: "INACTIVO",
    "audit.deletedAt": FieldValue.serverTimestamp(),
    "audit.deletedBy": actorUid,
    "audit.updatedAt": FieldValue.serverTimestamp(),
    "audit.updatedBy": actorUid,
  });
}

export async function enablePermission(
  id: string,
  actorUid: string
) {
  const ref = permissionsCol().doc(id);
  await ref.update({
    estado: "ACTIVO",
    "audit.deletedAt": FieldValue.delete(),
    "audit.deletedBy": FieldValue.delete(),
    "audit.updatedAt": FieldValue.serverTimestamp(),
    "audit.updatedBy": actorUid,
  });
}


