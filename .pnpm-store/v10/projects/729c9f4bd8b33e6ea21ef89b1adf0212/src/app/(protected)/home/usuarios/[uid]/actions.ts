"use server";

import { revalidatePath } from "next/cache";
import { requireAuth, requirePermission } from "@/core/auth/guards";
import { UserOperativePerfilUpdateSchema } from "@/domain/usuarios/schema";
import { updateUsuarioOperativeProfile } from "@/domain/usuarios/repo";

export type EditState = { ok: true } | { ok: false; error: string };

export async function homeUpdateUsuarioAction(
  targetUid: string,
  _prev: EditState,
  formData: FormData
): Promise<EditState> {
  const session = await requireAuth();
  await requirePermission("USERS_EDIT");

  const raw = {
    nombres: String(formData.get("nombres") ?? "").trim(),
    apellidos: String(formData.get("apellidos") ?? "").trim(),
    celular: String(formData.get("celular") ?? "").trim(),
    direccion: String(formData.get("direccion") ?? "").trim(),
  };

  const parsed = UserOperativePerfilUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  await updateUsuarioOperativeProfile(targetUid, parsed.data, session.uid);
  revalidatePath(`/home/usuarios/${targetUid}`);
  return { ok: true };
}
