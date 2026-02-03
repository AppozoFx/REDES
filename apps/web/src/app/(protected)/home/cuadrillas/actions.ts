"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireServerPermission } from "@/core/auth/require";
import {
  createCuadrilla,
  disableCuadrilla,
  enableCuadrilla,
  updateCuadrilla,
} from "@/domain/cuadrillas/repo";

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
      return "No tienes permisos para esta acción.";
    case "ZONA_INVALIDA":
      return "Zona inválida o no habilitada.";
    case "CUADRILLA_NUMERO_DUPLICADO":
      return "El número de cuadrilla ya está en uso";
    case "CONDUCTOR_NO_EN_TECNICOS":
      return "El conductor debe estar entre los técnicos seleccionados.";
    case "TECNICO_ROL_INVALIDO":
      return "Uno o más técnicos no tienen rol TECNICO.";
    case "COORDINADOR_ROL_INVALIDO":
      return "El coordinador no tiene rol COORDINADOR.";
    case "GESTOR_ROL_INVALIDO":
      return "El gestor no tiene rol GESTOR.";
    case "CONDUCTOR_ROL_INVALIDO":
      return "El conductor no tiene rol TECNICO.";
    case "INVALID_FORMDATA":
      return "Formulario inválido.";
    default:
      return code;
  }
}

function resolveFormData(a: any, b?: any): FormData {
  if (a && typeof a.get === "function" && !b) return a as FormData; // forma directa <form action={fn}>
  if (b && typeof b.get === "function") return b as FormData; // useActionState(prev, formData)
  throw new Error("INVALID_FORMDATA");
}

export async function createCuadrillaAction(arg1: any, arg2?: any) {
  const session = await requireServerPermission(PERM);
  const formData = resolveFormData(arg1, arg2);

  const categoria = String(formData.get("categoria") ?? "").trim();
  const numeroCuadrilla = Number(String(formData.get("numeroCuadrilla") ?? "0"));
  const zonaId = String(formData.get("zonaId") ?? "").trim();
  const placa = String(formData.get("placa") ?? "");

  const tecnicosUids = normalizeArray(formData.getAll("tecnicosUids"));
  const coordinadorUid = String(formData.get("coordinadorUid") ?? "").trim();
  const gestorUid = String(formData.get("gestorUid") ?? "").trim();
  const conductorUid = String(formData.get("conductorUid") ?? "").trim();

  const estado = String(formData.get("estado") ?? "HABILITADO").trim();

  const licenciaNumero = String(formData.get("licenciaNumero") ?? "").trim() || undefined;
  const licenciaVenceAt = String(formData.get("licenciaVenceAt") ?? "").trim() || undefined;
  const soatVenceAt = String(formData.get("soatVenceAt") ?? "").trim() || undefined;
  const revTecVenceAt = String(formData.get("revTecVenceAt") ?? "").trim() || undefined;

  const credUsuario = String(formData.get("credUsuario") ?? "").trim() || undefined;
  const credPassword = String(formData.get("credPassword") ?? "").trim() || undefined;

  const vehiculoModelo = String(formData.get("vehiculoModelo") ?? "").trim() || undefined;
  const vehiculoMarca = String(formData.get("vehiculoMarca") ?? "").trim() || undefined;

  let createdId: string | undefined;
  try {
    const { id } = await createCuadrilla(
      {
        categoria,
        numeroCuadrilla,
        zonaId: zonaId || undefined,
        placa: placa || undefined,
        tecnicosUids,
        coordinadorUid: coordinadorUid || undefined,
        gestorUid: gestorUid || undefined,
        conductorUid: conductorUid || undefined,
        estado,
        licenciaNumero,
        licenciaVenceAt,
        soatVenceAt,
        revTecVenceAt,
        credUsuario,
        credPassword,
        vehiculoModelo,
        vehiculoMarca,
      },
      session.uid
    );
    createdId = id;
  } catch (e: any) {
    return { ok: false as const, error: { formErrors: [mapErrorMsg(e)] } };
  }

  // Redirige fuera del try/catch para no atrapar NEXT_REDIRECT
  revalidatePath("/home/cuadrillas");
  redirect(`/home/cuadrillas/${createdId}`);
}

export async function updateCuadrillaAction(id: string, formData: FormData) {
  const session = await requireServerPermission(PERM);

  const placa = String(formData.get("placa") ?? "").trim() || undefined;
  const tecnicosUids = normalizeArray(formData.getAll("tecnicosUids"));
  const coordinadorUid = String(formData.get("coordinadorUid") ?? "").trim() || undefined;
  const gestorUid = String(formData.get("gestorUid") ?? "").trim() || undefined;
  const conductorUid = String(formData.get("conductorUid") ?? "").trim() || undefined;
  const estado = String(formData.get("estado") ?? "").trim() || undefined;

  const licenciaNumero = String(formData.get("licenciaNumero") ?? "").trim();
  const licenciaVenceAt = String(formData.get("licenciaVenceAt") ?? "").trim();
  const soatVenceAt = String(formData.get("soatVenceAt") ?? "").trim();
  const revTecVenceAt = String(formData.get("revTecVenceAt") ?? "").trim();

  const credUsuario = String(formData.get("credUsuario") ?? "").trim();
  const credPassword = String(formData.get("credPassword") ?? "").trim();
  const vehiculoModelo = String(formData.get("vehiculoModelo") ?? "").trim();
  const vehiculoMarca = String(formData.get("vehiculoMarca") ?? "").trim();

  try {
    await updateCuadrilla(
      id,
      {
        placa,
        tecnicosUids: tecnicosUids.length ? tecnicosUids : undefined,
        coordinadorUid,
        gestorUid,
        conductorUid,
        estado,
        licenciaNumero: licenciaNumero || undefined,
        licenciaVenceAt: licenciaVenceAt || undefined,
        soatVenceAt: soatVenceAt || undefined,
        revTecVenceAt: revTecVenceAt || undefined,
        credUsuario: credUsuario || undefined,
        credPassword: credPassword || undefined,
        vehiculoModelo: vehiculoModelo || undefined,
        vehiculoMarca: vehiculoMarca || undefined,
      },
      session.uid
    );

    revalidatePath("/home/cuadrillas");
    revalidatePath(`/home/cuadrillas/${id}`);
    redirect(`/home/cuadrillas/${id}`);
  } catch (e: any) {
    return { ok: false as const, error: { formErrors: [mapErrorMsg(e)] } };
  }
}

export async function disableCuadrillaAction(id: string) {
  const session = await requireServerPermission(PERM);
  try {
    await disableCuadrilla(id, session.uid);
    revalidatePath("/home/cuadrillas");
    revalidatePath(`/home/cuadrillas/${id}`);
    redirect(`/home/cuadrillas/${id}`);
  } catch (e: any) {
    return { ok: false as const, error: { formErrors: [mapErrorMsg(e)] } };
  }
}

export async function enableCuadrillaAction(id: string) {
  const session = await requireServerPermission(PERM);
  try {
    await enableCuadrilla(id, session.uid);
    revalidatePath("/home/cuadrillas");
    revalidatePath(`/home/cuadrillas/${id}`);
    redirect(`/home/cuadrillas/${id}`);
  } catch (e: any) {
    return { ok: false as const, error: { formErrors: [mapErrorMsg(e)] } };
  }
}
