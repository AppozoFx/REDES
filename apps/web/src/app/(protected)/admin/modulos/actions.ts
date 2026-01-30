"use server";

import { requireAdmin } from "@/core/auth/guards";
import { adminDb } from "@/lib/firebase/admin";
import {
  ModuleCreateSchema,
  ModuleSoftDeleteSchema,
  ModuleUpdateSchema,
} from "@/domain/modulos/schema";
import { revalidatePath } from "next/cache";

export async function createModule(formData: FormData) {
  const session = await requireAdmin();

  const parsed = ModuleCreateSchema.safeParse({
    id: formData.get("id"),
    key: formData.get("key"),
    nombre: formData.get("nombre"),
    descripcion: formData.get("descripcion"),
    orden: Number(formData.get("orden") ?? 0),
  });

  if (!parsed.success) return { ok: false, error: parsed.error.flatten() };

  const ref = adminDb().collection("modulos").doc(parsed.data.id);
  const exists = await ref.get();
  if (exists.exists) return { ok: false, error: { formErrors: ["El módulo ya existe"] } };

  const now = new Date();

  await ref.set({
    ...parsed.data,
    estado: "ACTIVO",
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

  revalidatePath("/admin/modulos");
  return { ok: true };
}

export async function updateModule(moduleId: string, formData: FormData) {
  const session = await requireAdmin();

  const parsed = ModuleUpdateSchema.safeParse({
    key: formData.get("key"),
    nombre: formData.get("nombre"),
    descripcion: formData.get("descripcion"),
    orden:
      formData.get("orden") !== null && formData.get("orden") !== ""
        ? Number(formData.get("orden"))
        : undefined,
  });

  if (!parsed.success) return { ok: false, error: parsed.error.flatten() };

  await adminDb()
    .collection("modulos")
    .doc(moduleId)
    .set(
      {
        ...parsed.data,
        audit: {
          updatedAt: new Date(),
          updatedBy: session.uid,
        },
      },
      { merge: true }
    );

  revalidatePath("/admin/modulos");
  revalidatePath(`/admin/modulos/${moduleId}`);
  return { ok: true };
}

export async function softDeleteModule(moduleId: string, formData: FormData) {
  const session = await requireAdmin();

  const parsed = ModuleSoftDeleteSchema.safeParse({
    motivoBaja: formData.get("motivoBaja"),
  });

  if (!parsed.success) return { ok: false, error: parsed.error.flatten() };

  await adminDb()
    .collection("modulos")
    .doc(moduleId)
    .set(
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

  revalidatePath("/admin/modulos");
  revalidatePath(`/admin/modulos/${moduleId}`);
  return { ok: true };
}



export async function reactivateModule(moduleId: string) {
  const session = await requireAdmin();

  await adminDb().collection("modulos").doc(moduleId).set(
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

  revalidatePath("/admin/modulos");
  revalidatePath(`/admin/modulos/${moduleId}`);
  return { ok: true };
}
