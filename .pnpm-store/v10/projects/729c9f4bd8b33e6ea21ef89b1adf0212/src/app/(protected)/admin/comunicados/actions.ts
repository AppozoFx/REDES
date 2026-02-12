"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/core/auth/guards";
import { adminDb } from "@/lib/firebase/admin";
import {
  createComunicado,
  updateComunicado,
  setComunicadoEstado,
} from "@/domain/comunicados/repo";
import {
  ComunicadoCreateSchema,
  ComunicadoUpdateSchema,
  ComunicadoToggleSchema,
} from "@/domain/comunicados/schema";

const PERM = "ANNOUNCEMENTS_MANAGE";

export type ComunicadoFormState =
  | null
  | { ok: true; id?: string; redirectTo?: string }
  | { ok: false; error: string };

/** CSV "a,b,c" -> ["a","b","c"] */
function csvToArr(v: FormDataEntryValue | null): string[] {
  const raw = String(v ?? "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * ✅ ÚNICO parseo del FormData (create y update).
 * Importante: aquí agregamos persistencia.
 */
function buildInputFromForm(formData: FormData) {
  return {
    titulo: String(formData.get("titulo") ?? "").trim(),
    cuerpo: String(formData.get("cuerpo") ?? "").trim(),

    imageUrl: String(formData.get("imageUrl") ?? "").trim(),
    linkUrl: String(formData.get("linkUrl") ?? "").trim(),
    linkLabel: String(formData.get("linkLabel") ?? "").trim(),

    target: String(formData.get("target") ?? "ALL").trim(),
    rolesTarget: csvToArr(formData.get("rolesTarget")),
    areasTarget: csvToArr(formData.get("areasTarget")),
    uidsTarget: csvToArr(formData.get("uidsTarget")),

    estado: String(formData.get("estado") ?? "ACTIVO").trim(),
    visibleDesde: String(formData.get("visibleDesde") ?? "").trim(),
    visibleHasta: String(formData.get("visibleHasta") ?? "").trim(),

    prioridad: Number(formData.get("prioridad") ?? 100),
    obligatorio: formData.get("obligatorio") === "on",

    // ✅ FIX: este campo era enviado por el form pero NO se leía aquí
    persistencia: String(formData.get("persistencia") ?? "ONCE").trim(),
  };
}

/**
 * ✅ Server Action compatible con React.useActionState
 * Retorna state para que el client muestre error/redirect.
 */
export async function comunicadosCreateWithStateAction(
  _prev: ComunicadoFormState,
  formData: FormData
): Promise<ComunicadoFormState> {
  try {
    const session = await requirePermission(PERM);

    const input = buildInputFromForm(formData);
    const data = ComunicadoCreateSchema.parse(input);

    const id = await createComunicado(data, session.uid);

    revalidatePath("/admin/comunicados");
    return { ok: true, id, redirectTo: `/admin/comunicados/${id}` };
  } catch (e: any) {
    // Si quieres, aquí puedes formatear ZodError más bonito
    return { ok: false, error: e?.message ?? "Error al crear comunicado" };
  }
}

/**
 * ✅ Mantengo tu createFromFormAction (server page)
 */
export async function comunicadosCreateFromFormAction(formData: FormData) {
  const session = await requirePermission(PERM);

  const input = buildInputFromForm(formData);
  const data = ComunicadoCreateSchema.parse(input);

  const id = await createComunicado(data, session.uid);

  revalidatePath("/admin/comunicados");
  return { ok: true, id };
}

/**
 * ✅ Update desde FormData (server page)
 */
export async function comunicadosUpdateFromFormAction(id: string, formData: FormData) {
  const session = await requirePermission(PERM);

  const input = buildInputFromForm(formData);
  const patch = ComunicadoUpdateSchema.parse(input);

  await updateComunicado(id, patch, session.uid);

  revalidatePath("/admin/comunicados");
  revalidatePath(`/admin/comunicados/${id}`);
  return { ok: true };
}

export async function comunicadosToggleAction(id: string, input: unknown) {
  const session = await requirePermission(PERM);
  const { estado } = ComunicadoToggleSchema.parse(input);

  await setComunicadoEstado(id, estado, session.uid);

  revalidatePath("/admin/comunicados");
  revalidatePath(`/admin/comunicados/${id}`);
  return { ok: true };
}

/**
 * ✅ Toggle robusto: re-lee el estado desde Firestore (evita closures raros)
 */
export async function comunicadosToggleByIdAction(id: string) {
  const session = await requirePermission(PERM);

  const ref = adminDb().collection("comunicados").doc(String(id ?? "").trim());
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "NOT_FOUND" };

  const cur = snap.data() as any;
  const currentEstado = cur?.estado === "ACTIVO" ? "ACTIVO" : "INACTIVO";
  const nextEstado = currentEstado === "ACTIVO" ? "INACTIVO" : "ACTIVO";

  await setComunicadoEstado(id, nextEstado, session.uid);

  revalidatePath("/admin/comunicados");
  revalidatePath(`/admin/comunicados/${id}`);
  return { ok: true, estado: nextEstado };
}
