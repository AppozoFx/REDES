"use server";

import { requireServerPermission } from "@/core/auth/require";
import { z } from "zod";
import {
  createMaterial,
  moneyToCents,
  metersToCm,
} from "@/domain/materiales/repo";
import { MaterialCreateInputSchema } from "@/domain/materiales/schemas";

const PERM = "MATERIALES_CREATE";

function resolveForm(a: any, b?: any): FormData {
  if (a && typeof a.get === "function" && !b) return a as FormData;
  if (b && typeof b.get === "function") return b as FormData;
  throw new Error("INVALID_FORMDATA");
}

export async function createMaterialAction(arg1: any, arg2?: any): Promise<
  | { ok: true; id: string }
  | { ok: false; error: { formErrors: string[] } }
> {
  const session = await requireServerPermission(PERM);
  try {
    const form = resolveForm(arg1, arg2);
    const raw = {
      nombre: String(form.get("nombre") ?? "").trim(),
      descripcion: String(form.get("descripcion") ?? "").trim(),
      unidadTipo: String(form.get("unidadTipo") ?? "").toUpperCase(),
      areas: JSON.parse(String(form.get("areas") ?? "[]")),
      vendible: String(form.get("vendible") ?? "false") === "true",
      metrosPorUnd: form.get("metrosPorUnd") ? Number(form.get("metrosPorUnd")) : undefined,
      precioPorMetro: form.get("precioPorMetro") ? Number(form.get("precioPorMetro")) : undefined,
      minStockMetros: form.get("minStockMetros") ? Number(form.get("minStockMetros")) : undefined,
      precioUnd: form.get("precioUnd") ? Number(form.get("precioUnd")) : undefined,
      minStockUnd: form.get("minStockUnd") ? Number(form.get("minStockUnd")) : undefined,
    } as any;

    const parsed = MaterialCreateInputSchema.parse(raw);
    const { id } = await createMaterial(parsed, session.uid);
    return { ok: true, id };
  } catch (e: any) {
    const code = String(e?.message ?? "ERROR");
    if (
      code === "UNAUTHENTICATED" ||
      code === "ACCESS_DISABLED" ||
      code === "FORBIDDEN" ||
      code === "INVALID_FORMDATA" ||
      code === "MATERIAL_ID_EXISTS" ||
      code === "MATERIAL_NAME_EXISTS" ||
      code === "METROS_POR_UND_REQUIRED" ||
      code === "PRECIO_UND_REQUIRED" ||
      code === "PRECIO_POR_METRO_REQUIRED"
    ) {
      return { ok: false, error: { formErrors: [code] } };
    }
    if (e?.issues) {
      try {
        const zs = (e.issues as any[]).map((i) => String(i?.message ?? "INVALID")).slice(0, 5);
        return { ok: false, error: { formErrors: zs } };
      } catch {}
    }
    return { ok: false, error: { formErrors: [code] } };
  }
}

