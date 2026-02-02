"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/core/auth/guards";
import {
  createPermission,
  updatePermission,
  softDisablePermission,
  enablePermission,
} from "@/domain/permissions/permissions.repo";
import {
  PermissionCreateSchema,
  PermissionUpdateSchema,
} from "@/domain/permissions/permission.schema";

const PERM = "PERMISSIONS_MANAGE";

export async function permissionsCreateAction(input: unknown) {
  const session = await requirePermission(PERM);
  const data = PermissionCreateSchema.parse(input);

  await createPermission(data, session.uid);
  revalidatePath("/admin/permissions");
}

export async function permissionsUpdateAction(id: string, input: unknown) {
  const session = await requirePermission(PERM);
  const patch = PermissionUpdateSchema.parse(input);

  await updatePermission(id, patch, session.uid);
  revalidatePath("/admin/permissions");
  revalidatePath(`/admin/permissions/${id}`);
}

export async function permissionsDisableAction(id: string) {
  const session = await requirePermission(PERM);
  await softDisablePermission(id, session.uid);
  revalidatePath("/admin/permissions");
}

export async function permissionsEnableAction(id: string) {
  const session = await requirePermission(PERM);
  await enablePermission(id, session.uid);
  revalidatePath("/admin/permissions");
}
