"use server";

import { requireServerPermission } from "@/core/auth/require";
import { listMateriales, getMaterial, updateMaterial } from "@/domain/materiales/repo";
import { MaterialUpdateInputSchema } from "@/domain/materiales/schemas";
import { revalidatePath } from "next/cache";

export async function listMaterialesAction(params: { q?: string; unidadTipo?: string; area?: string; vendible?: string }) {
  await requireServerPermission("MATERIALES_VIEW");
  const unidadTipo = params.unidadTipo === "UND" || params.unidadTipo === "METROS" ? (params.unidadTipo as any) : undefined;
  const vendible = params.vendible === "true" ? true : params.vendible === "false" ? false : undefined;
  const items = await listMateriales({ q: params.q, unidadTipo, area: params.area, vendible, limit: 500 });
  // Sanitizar para cliente: remover campos con tipos no serializables (ej. Timestamp)
  const safe = items.map((m: any) => {
    const { audit, ...rest } = m || {};
    return rest;
  });
  return { ok: true, items: safe } as const;
}

export async function getMaterialAction(id: string) {
  await requireServerPermission("MATERIALES_VIEW");
  const doc = await getMaterial(id);
  if (!doc) return { ok: false, error: { formErrors: ["MATERIAL_NOT_FOUND"] } } as const;
  const { audit, ...rest } = (doc as any) || {};
  return { ok: true, doc: rest } as const;
}

export async function updateMaterialAction(arg1: any, arg2?: any) {
  const session = await requireServerPermission("MATERIALES_EDIT");
  try {
    // Permitir FormData o JSON simple
    let payload: any;
    if (arg1 && typeof arg1.get === "function" && !arg2) {
      const form = arg1 as FormData;
      payload = {
        id: String(form.get("id") ?? ""),
        nombre: String(form.get("nombre") ?? ""),
        descripcion: String(form.get("descripcion") ?? ""),
        unidadTipo: String(form.get("unidadTipo") ?? ""),
        areas: JSON.parse(String(form.get("areas") ?? "[]")),
        vendible: String(form.get("vendible") ?? "false") === "true",
        metrosPorUnd: form.get("metrosPorUnd") ? Number(String(form.get("metrosPorUnd")).replace(",", ".")) : undefined,
        precioPorMetro: form.get("precioPorMetro") ? Number(String(form.get("precioPorMetro")).replace(",", ".")) : undefined,
        minStockMetros: form.get("minStockMetros") ? Number(String(form.get("minStockMetros")).replace(",", ".")) : undefined,
        precioUnd: form.get("precioUnd") ? Number(String(form.get("precioUnd")).replace(",", ".")) : undefined,
        minStockUnd: form.get("minStockUnd") ? Number(String(form.get("minStockUnd")).replace(",", ".")) : undefined,
      };
    } else {
      payload = arg1;
    }

    const parsed = MaterialUpdateInputSchema.parse(payload);
    await updateMaterial(parsed, session.uid);
    revalidatePath("/home/materiales");
    revalidatePath(`/home/materiales/${parsed.id}`);
    return { ok: true } as const;
  } catch (e: any) {
    const code = String(e?.message ?? "ERROR");
    const known = [
      "UNAUTHENTICATED",
      "ACCESS_DISABLED",
      "FORBIDDEN",
      "MATERIAL_NOT_FOUND",
      "MATERIAL_NAME_EXISTS",
      "UNIT_TYPE_CHANGE_NOT_ALLOWED",
      "METROS_POR_UND_REQUIRED",
      "PRECIO_UND_REQUIRED",
      "PRECIO_POR_METRO_REQUIRED",
    ];
    if (known.includes(code)) return { ok: false, error: { formErrors: [code] } } as const;
    if (e?.issues) return { ok: false, error: { formErrors: ["INVALID_INPUT"] } } as const;
    return { ok: false, error: { formErrors: [code] } } as const;
  }
}
