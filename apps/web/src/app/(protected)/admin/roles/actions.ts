"use server";

import { requireAdmin } from "@/core/auth/guards";
import { adminDb } from "@/lib/firebase/admin";
import { RoleCreateSchema, RoleSoftDeleteSchema, RoleUpdateSchema } from "@/domain/roles/schema";
import { revalidatePath } from "next/cache";

export async function createRole(formData: FormData) {
  const session = await requireAdmin();

  const parsed = RoleCreateSchema.safeParse({
    id: formData.get("id"),
    nombre: formData.get("nombre"),
    descripcion: formData.get("descripcion"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.flatten() };

  const now = new Date();

  await adminDb().collection("roles").doc(parsed.data.id).set({
    ...parsed.data,
    estado: "ACTIVO",
    permisos: [],
    areasDefault: [],
    audit: {
      createdAt: now,
      createdBy: session.uid,
      updatedAt: now,
      updatedBy: session.uid,
      deletedAt: null,
      deletedBy: null,
      motivoBaja: null,
    },
  });

  revalidatePath("/admin/roles");
  return { ok: true };
}

export async function updateRole(roleId: string, formData: FormData) {
  const session = await requireAdmin();

  const parsed = RoleUpdateSchema.safeParse({
    nombre: formData.get("nombre"),
    descripcion: formData.get("descripcion"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.flatten() };

  await adminDb().collection("roles").doc(roleId).set(
    {
      ...parsed.data,
      audit: {
        updatedAt: new Date(),
        updatedBy: session.uid,
      },
    },
    { merge: true }
  );

  revalidatePath(`/admin/roles/${roleId}`);
  revalidatePath("/admin/roles");
  return { ok: true };
}

export async function softDeleteRole(roleId: string, formData: FormData) {
  const session = await requireAdmin();

  const parsed = RoleSoftDeleteSchema.safeParse({
    motivoBaja: formData.get("motivoBaja"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.flatten() };

  await adminDb().collection("roles").doc(roleId).set(
    {
      estado: "INACTIVO",
      audit: {
        deletedAt: new Date(),
        deletedBy: session.uid,
        motivoBaja: parsed.data.motivoBaja,
        updatedAt: new Date(),
        updatedBy: session.uid,
      },
    },
    { merge: true }
  );

  revalidatePath("/admin/roles");
  return { ok: true };
}


export async function reactivateRole(roleId: string) {
  const session = await requireAdmin();

  await adminDb().collection("roles").doc(roleId).set(
    {
      estado: "ACTIVO",
      audit: {
        updatedAt: new Date(),
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

