"use server";

import { redirect } from "next/navigation";
import { requireAuth, requirePermission } from "@/core/auth/guards";
import { HomeUserCreateSchema } from "@/domain/usuarios/schema";
import { createUserFromHome } from "@/domain/usuarios/service";

export type CreateState = { ok: true } | { ok: false; error: string };

export async function homeCreateUserAction(
  _prev: CreateState,
  formData: FormData
): Promise<CreateState> {
  const session = await requireAuth();
  await requirePermission("USERS_CREATE");

  const raw = {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),

    nombres: String(formData.get("nombres") ?? "").trim(),
    apellidos: String(formData.get("apellidos") ?? "").trim(),

    tipoDoc: String(formData.get("tipoDoc") ?? ""),
    nroDoc: String(formData.get("nroDoc") ?? "").trim(),

    celular: String(formData.get("celular") ?? "").trim(),
    direccion: String(formData.get("direccion") ?? "").trim(),

    genero: String(formData.get("genero") ?? ""),
    nacionalidad: String(formData.get("nacionalidad") ?? "").trim(),

    fIngreso: String(formData.get("fIngreso") ?? "").trim(),
    fNacimiento: String(formData.get("fNacimiento") ?? "").trim(),

    rolInicial: String(formData.get("rolInicial") ?? "").trim(),
  };

  const parsed = HomeUserCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  if (parsed.data.rolInicial === "ADMIN") {
    return { ok: false, error: "No se permite ADMIN como rol inicial." };
  }

  try {
    const { uid } = await createUserFromHome(parsed.data, session.uid);
    redirect(`/home/usuarios/${uid}`);
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Error creando usuario" };
  }
}
