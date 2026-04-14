"use server";

import { requireServerPermission } from "@/core/auth/require";
import { listMateriales, getMaterial, updateMaterial, metersToCm, derivePrecioPorMetroCents } from "@/domain/materiales/repo";
import { MaterialUpdateInputSchema } from "@/domain/materiales/schemas";
import { revalidatePath } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";

export async function listMaterialesAction(params: { q?: string; unidadTipo?: string; area?: string; vendible?: string }) {
  await requireServerPermission("MATERIALES_VIEW");
  const arg = (params && typeof params === "object" && "q" in params ? params : {}) as {
    q?: string;
    unidadTipo?: string;
    area?: string;
    vendible?: string;
  };
  const unidadTipo = arg.unidadTipo === "UND" || arg.unidadTipo === "METROS" ? (arg.unidadTipo as any) : undefined;
  const vendible = arg.vendible === "true" ? true : arg.vendible === "false" ? false : undefined;
  const items = await listMateriales({ q: arg.q, unidadTipo, area: arg.area, vendible, limit: 500 });
  const ids = items.map((m) => String(m.id || "")).filter(Boolean);
  const stockMap = new Map<string, any>();
  if (ids.length) {
    const refs = ids.map((id) => adminDb().collection("almacen_stock").doc(id));
    const snaps = await adminDb().getAll(...refs);
    snaps.forEach((s) => {
      if (s.exists) stockMap.set(s.id, s.data() || {});
    });
  }
  // Sanitizar para cliente: remover campos con tipos no serializables (ej. Timestamp)
  const safe = items.map((m: any) => {
    const { audit, ...rest } = m || {};
    const stock = stockMap.get(String(rest?.id || "")) || {};
    const stockUnd = Number(stock?.stockUnd || 0);
    const stockCm = Number(stock?.stockCm || 0);
    const stockMetros = Number((stockCm / 100).toFixed(2));
    return {
      ...rest,
      stockUnd,
      stockMetros,
    };
  });
  return { ok: true, items: safe } as const;
}

export async function listMaterialesActionWithPrev(
  _prev: any,
  params: { q?: string; unidadTipo?: string; area?: string; vendible?: string }
) {
  return listMaterialesAction(params || {});
}

export async function updateMaterialStockAction(input: { id?: string; unidadTipo?: string; stock?: number | string }) {
  await requireServerPermission("MATERIALES_EDIT");
  const id = String(input?.id || "").trim();
  const unidadTipo = String(input?.unidadTipo || "").trim().toUpperCase();
  const parsedStock = Number(String(input?.stock ?? "").replace(",", "."));
  if (!id) return { ok: false, error: "MATERIAL_REQUIRED" } as const;
  if (unidadTipo !== "UND" && unidadTipo !== "METROS") return { ok: false, error: "UNIDAD_INVALIDA" } as const;
  if (!Number.isFinite(parsedStock) || parsedStock < 0) return { ok: false, error: "STOCK_INVALIDO" } as const;

  const stockRef = adminDb().collection("almacen_stock").doc(id);
  if (unidadTipo === "UND") {
    await stockRef.set(
      {
        materialId: id,
        unidadTipo: "UND",
        stockUnd: Math.max(0, Math.floor(parsedStock)),
      },
      { merge: true }
    );
  } else {
    await stockRef.set(
      {
        materialId: id,
        unidadTipo: "METROS",
        stockCm: metersToCm(Math.max(0, parsedStock)),
      },
      { merge: true }
    );
  }
  revalidatePath("/home/materiales");
  return { ok: true } as const;
}

export async function getMaterialAction(id: string) {
  await requireServerPermission("MATERIALES_VIEW");
  const doc = await getMaterial(id);
  if (!doc) return { ok: false, error: { formErrors: ["MATERIAL_NOT_FOUND"] } } as const;
  const { audit, ...rest } = (doc as any) || {};
  if ((rest as any).unidadTipo === "METROS") {
    (rest as any).precioPorMetroCents = derivePrecioPorMetroCents({
      precioPorMetroCents: (rest as any).precioPorMetroCents,
      precioUndCents: (rest as any).precioUndCents,
      metrosPorUndCm: (rest as any).metrosPorUndCm,
    });
  }
  const stockSnap = await adminDb().collection("almacen_stock").doc(id).get();
  if (stockSnap.exists) {
    const s = stockSnap.data() as any;
    if (rest.unidadTipo === "UND") {
      (rest as any).stockUnd = s?.stockUnd ?? 0;
    } else {
      const cm = typeof s?.stockCm === "number" ? s.stockCm : 0;
      (rest as any).stockMetros = cm / 100;
    }
  }
  return { ok: true, doc: rest } as const;
}

export async function updateMaterialAction(arg1: any, arg2?: any) {
  const session = await requireServerPermission("MATERIALES_EDIT");
  try {
    // Permitir FormData o JSON simple
    let payload: any;
    if (arg2 && typeof arg2.get === "function") {
      const form = arg2 as FormData;
      payload = {
        id: String(form.get("id") ?? ""),
        nombre: String(form.get("nombre") ?? ""),
        descripcion: String(form.get("descripcion") ?? ""),
        unidadTipo: String(form.get("unidadTipo") ?? ""),
        areas: JSON.parse(String(form.get("areas") ?? "[]")),
        vendible: String(form.get("vendible") ?? "false") === "true",
        ventaUnidadTipos: JSON.parse(String(form.get("ventaUnidadTipos") ?? "[]")),
        metrosPorUnd: form.get("metrosPorUnd") ? Number(String(form.get("metrosPorUnd")).replace(",", ".")) : undefined,
        precioPorMetro: form.get("precioPorMetro") ? Number(String(form.get("precioPorMetro")).replace(",", ".")) : undefined,
        minStockMetros: form.get("minStockMetros") ? Number(String(form.get("minStockMetros")).replace(",", ".")) : undefined,
        precioUnd: form.get("precioUnd") ? Number(String(form.get("precioUnd")).replace(",", ".")) : undefined,
        minStockUnd: form.get("minStockUnd") ? Number(String(form.get("minStockUnd")).replace(",", ".")) : undefined,
      };
      payload._stockUnd = form.get("stockUnd") ? Number(String(form.get("stockUnd")).replace(",", ".")) : undefined;
      payload._stockMetros = form.get("stockMetros") ? Number(String(form.get("stockMetros")).replace(",", ".")) : undefined;
    } else if (arg1 && typeof arg1.get === "function" && !arg2) {
      const form = arg1 as FormData;
      payload = {
        id: String(form.get("id") ?? ""),
        nombre: String(form.get("nombre") ?? ""),
        descripcion: String(form.get("descripcion") ?? ""),
        unidadTipo: String(form.get("unidadTipo") ?? ""),
        areas: JSON.parse(String(form.get("areas") ?? "[]")),
        vendible: String(form.get("vendible") ?? "false") === "true",
        ventaUnidadTipos: JSON.parse(String(form.get("ventaUnidadTipos") ?? "[]")),
        metrosPorUnd: form.get("metrosPorUnd") ? Number(String(form.get("metrosPorUnd")).replace(",", ".")) : undefined,
        precioPorMetro: form.get("precioPorMetro") ? Number(String(form.get("precioPorMetro")).replace(",", ".")) : undefined,
        minStockMetros: form.get("minStockMetros") ? Number(String(form.get("minStockMetros")).replace(",", ".")) : undefined,
        precioUnd: form.get("precioUnd") ? Number(String(form.get("precioUnd")).replace(",", ".")) : undefined,
        minStockUnd: form.get("minStockUnd") ? Number(String(form.get("minStockUnd")).replace(",", ".")) : undefined,
      };
      payload._stockUnd = form.get("stockUnd") ? Number(String(form.get("stockUnd")).replace(",", ".")) : undefined;
      payload._stockMetros = form.get("stockMetros") ? Number(String(form.get("stockMetros")).replace(",", ".")) : undefined;
    } else {
      payload = arg1;
    }

    const stockUnd = payload?._stockUnd;
    const stockMetros = payload?._stockMetros;
    if (payload && "_stockUnd" in payload) delete (payload as any)._stockUnd;
    if (payload && "_stockMetros" in payload) delete (payload as any)._stockMetros;

    const parsed = MaterialUpdateInputSchema.parse(payload);
    const current = await getMaterial(parsed.id);
    if (!current) {
      return { ok: false, error: { formErrors: ["MATERIAL_NOT_FOUND"] } } as const;
    }
    const isUndToMetros = current.unidadTipo === "UND" && parsed.unidadTipo === "METROS";
    await updateMaterial(parsed, session.uid);
    // Sync almacen_stock if provided
    const stockRef = adminDb().collection("almacen_stock").doc(parsed.id);
    if (parsed.unidadTipo === "UND") {
      if (typeof stockUnd === "number") {
        await stockRef.set(
          { materialId: parsed.id, unidadTipo: "UND", stockUnd: Math.max(0, Math.floor(stockUnd)) },
          { merge: true }
        );
      }
    } else {
      if (typeof stockMetros === "number") {
        await stockRef.set(
          { materialId: parsed.id, unidadTipo: "METROS", stockCm: metersToCm(Math.max(0, stockMetros)) },
          { merge: true }
        );
      } else if (isUndToMetros) {
        const stockSnap = await stockRef.get();
        const currentStockUnd = Math.max(0, Math.floor(Number(stockSnap.data()?.stockUnd || 0)));
        await stockRef.set(
          {
            materialId: parsed.id,
            unidadTipo: "METROS",
            stockCm: metersToCm(currentStockUnd * Number(parsed.metrosPorUnd || 0)),
            stockUnd: 0,
          },
          { merge: true }
        );
      }
    }
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
    if (e?.issues) {
      const msgs = (e.issues as any[]).map((i) => String(i?.message ?? "INVALID")).slice(0, 5);
      return { ok: false, error: { formErrors: msgs.length ? msgs : ["INVALID_INPUT"] } } as const;
    }
    return { ok: false, error: { formErrors: [code] } } as const;
  }
}
