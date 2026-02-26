"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireServerPermission } from "@/core/auth/require";
import { createCuadrillaMantenimiento } from "@/domain/cuadrillas/repo";

const PERM = "CUADRILLAS_MANAGE";

function normalizeArray(values: FormDataEntryValue[] | null): string[] {
  if (!values) return [];
  return values.map((v) => String(v).trim()).filter(Boolean);
}

function mapErrorMsg(e: unknown): string {
  const code = String((e as any)?.message ?? "ERROR");
  switch (code) {
    case "UNAUTHENTICATED":
      return "No autenticado.";
    case "ACCESS_DISABLED":
      return "Acceso inhabilitado.";
    case "FORBIDDEN":
      return "No tienes permisos para esta accion.";
    case "TECNICO_ROL_INVALIDO":
      return "Uno o mas tecnicos no tienen rol TECNICO.";
    case "COORDINADOR_ROL_INVALIDO":
      return "El coordinador no tiene rol COORDINADOR.";
    case "GESTOR_ROL_INVALIDO":
      return "El gestor no tiene rol GESTOR.";
    case "TECNICO_OCUPADO":
      return "Uno o mas tecnicos ya estan asignados a otra cuadrilla de mantenimiento.";
    case "TECNICO_AREA_INVALIDA":
      return "Uno o mas tecnicos no pertenecen al area requerida.";
    case "COORDINADOR_AREA_INVALIDA":
      return "El coordinador no pertenece al area requerida.";
    case "GESTOR_AREA_INVALIDA":
      return "El gestor no pertenece al area requerida.";
    case "CUADRILLA_ID_CONFLICT":
      return "Ya existe una cuadrilla con ese nombre.";
    case "INVALID_FORMDATA":
      return "Formulario invalido.";
    default:
      return code;
  }
}

function resolveFormData(a: any, b?: any): FormData {
  if (a && typeof a.get === "function" && !b) return a as FormData;
  if (b && typeof b.get === "function") return b as FormData;
  throw new Error("INVALID_FORMDATA");
}

export async function createCuadrillaMantenimientoAction(arg1: any, arg2?: any) {
  const session = await requireServerPermission(PERM);
  if (!session.isAdmin && !(session.access.areas || []).includes("MANTENIMIENTO")) {
    return { ok: false as const, error: { formErrors: ["FORBIDDEN"] } };
  }
  const formData = resolveFormData(arg1, arg2);

  const zona = String(formData.get("zona") ?? "").trim();
  const turno = String(formData.get("turno") ?? "").trim();
  const estado = String(formData.get("estado") ?? "HABILITADO").trim();

  const tecnicosUids = normalizeArray(formData.getAll("tecnicosUids"));
  const coordinadorUid = String(formData.get("coordinadorUid") ?? "").trim();
  const gestorUid = String(formData.get("gestorUid") ?? "").trim();

  let createdId: string | undefined;
  try {
    const { id } = await createCuadrillaMantenimiento(
      {
        zona,
        turno,
        estado,
        tecnicosUids,
        coordinadorUid: coordinadorUid || undefined,
        gestorUid: gestorUid || undefined,
      },
      session.uid
    );
    createdId = id;
  } catch (e: any) {
    return { ok: false as const, error: { formErrors: [mapErrorMsg(e)] } };
  }

  revalidatePath("/home/mantenimiento/cuadrillas");
  redirect(`/home/mantenimiento/cuadrillas`);
}
