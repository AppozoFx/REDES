"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/core/auth/guards";
import { UserSelfUpdateSchema } from "@/domain/usuarios/schema";
import { updateUsuarioSelfProfile } from "@/domain/usuarios/repo";

export type PerfilUpdateState =
  | null
  | { ok: true }
  | { ok: false; error: string };

export async function updateMyProfileAction(
  _prev: PerfilUpdateState,
  formData: FormData
): Promise<PerfilUpdateState> {
  const session = await requireAuth();

  const raw = {
    celular: String(formData.get("celular") ?? "").trim(),
    direccion: String(formData.get("direccion") ?? "").trim(),
    fNacimiento: String(formData.get("fNacimiento") ?? "").trim(),
    tipoDoc: String(formData.get("tipoDoc") ?? "").trim(),
    nroDoc: String(formData.get("nroDoc") ?? "").trim(),
  };

  const parsed = UserSelfUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  await updateUsuarioSelfProfile(session.uid, parsed.data, session.uid);

  revalidatePath("/home/perfil");
  return { ok: true };
}
