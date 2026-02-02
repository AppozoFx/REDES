"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";

import { requireAdmin } from "@/core/auth/guards";
import { adminDb } from "@/lib/firebase/admin";
import {
  RoleCreateSchema,
  RoleSoftDeleteSchema,
  RoleUpdateSchema,
} from "@/domain/roles/schema";

/**
 * Actualizar permisos del rol (roles/{id}.permissions)
 */
const RolePermissionsUpdateSchema = z.object({
  permissions: z.array(z.string().min(3).max(64)),
});

export async function roleUpdatePermissionsAction(roleId: string, input: unknown) {
  const session = await requireAdmin();
  const { permissions } = RolePermissionsUpdateSchema.parse(input);

  const uniq = Array.from(new Set(permissions));

  await adminDb()
    .collection("roles")
    .doc(roleId)
    .set(
      {
        permissions: uniq,
        audit: {
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: session.uid,
        },
      },
      { merge: true }
    );

  revalidatePath("/admin/roles");
  revalidatePath(`/admin/roles/${roleId}`);
}

/**
 * Crear rol
 */
export async function createRole(formData: FormData) {
  const session = await requireAdmin();

  const parsed = RoleCreateSchema.safeParse({
    id: formData.get("id"),
    nombre: formData.get("nombre"),
    descripcion: formData.get("descripcion"),
  });

  if (!parsed.success) return { ok: false, error: parsed.error.flatten() };

  const roleId = parsed.data.id;

  await adminDb()
    .collection("roles")
    .doc(roleId)
    .set({
      ...parsed.data,
      estado: "ACTIVO",

      // ✅ nuevo estándar
      permissions: [],

      // si tu dominio aún usa esto, déjalo; si no existe en schema, no pasa nada
      areasDefault: [],

      audit: {
        createdAt: FieldValue.serverTimestamp(),
        createdBy: session.uid,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: session.uid,
        deletedAt: null,
        deletedBy: null,
        motivoBaja: null,
      },
    });

  revalidatePath("/admin/roles");
  return { ok: true };
}

/**
 * Actualizar rol (nombre/descripcion)
 */
export async function updateRole(roleId: string, formData: FormData) {
  const session = await requireAdmin();

  const parsed = RoleUpdateSchema.safeParse({
    nombre: formData.get("nombre"),
    descripcion: formData.get("descripcion"),
  });

  if (!parsed.success) return { ok: false, error: parsed.error.flatten() };

  await adminDb()
    .collection("roles")
    .doc(roleId)
    .set(
      {
        ...parsed.data,
        audit: {
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: session.uid,
        },
      },
      { merge: true }
    );

  revalidatePath(`/admin/roles/${roleId}`);
  revalidatePath("/admin/roles");
  return { ok: true };
}

/**
 * Soft delete / desactivar rol
 */
export async function softDeleteRole(roleId: string, formData: FormData) {
  const session = await requireAdmin();

  const parsed = RoleSoftDeleteSchema.safeParse({
    motivoBaja: formData.get("motivoBaja"),
  });

  if (!parsed.success) return { ok: false, error: parsed.error.flatten() };

  await adminDb()
    .collection("roles")
    .doc(roleId)
    .set(
      {
        estado: "INACTIVO",
        audit: {
          deletedAt: FieldValue.serverTimestamp(),
          deletedBy: session.uid,
          motivoBaja: parsed.data.motivoBaja,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: session.uid,
        },
      },
      { merge: true }
    );

  revalidatePath("/admin/roles");
  revalidatePath(`/admin/roles/${roleId}`);
  return { ok: true };
}

/**
 * Reactivar rol (soft undelete)
 */
export async function reactivateRole(roleId: string) {
  const session = await requireAdmin();

  await adminDb()
    .collection("roles")
    .doc(roleId)
    .set(
      {
        estado: "ACTIVO",
        audit: {
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: session.uid,
          deletedAt: null,
          deletedBy: null,
          motivoBaja: null,
        },
      },
      { merge: true }
    );

  revalidatePath("/admin/roles");
  revalidatePath(`/admin/roles/${roleId}`);
  return { ok: true };
}
