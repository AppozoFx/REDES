import { z } from "zod";

export const VentaAreaEnum = z.enum(["INSTALACIONES", "MANTENIMIENTO"]);
export type VentaArea = z.infer<typeof VentaAreaEnum>;

export const VentaItemInputSchema = z.object({
  materialId: z.string().min(1),
  modoVenta: z.enum(["UND", "METROS"]).optional(),
  und: z.number().nonnegative().optional(),
  metros: z.number().nonnegative().optional(),
  // precio unitario opcional (solo si tiene permiso)
  precioUnitCents: z.number().nonnegative().optional(),
}).refine((v) => typeof v.und === "number" || typeof v.metros === "number", {
  message: "UND_o_METROS_REQUERIDO",
});

export const VentaCreateInputSchema = z.object({
  area: VentaAreaEnum,
  cuadrillaId: z.string().min(1).optional(),
  coordinadorUid: z.string().min(1),
  items: z.array(VentaItemInputSchema).min(1),
  observacion: z.string().optional(),
});
export type VentaCreateInput = z.infer<typeof VentaCreateInputSchema>;

export const VentaCuotasUpdateSchema = z.object({
  ventaId: z.string().min(1),
  cuotas: z.array(z.object({
    n: z.number().int().positive(),
    montoCents: z.number().nonnegative(),
  })).min(1),
});
export type VentaCuotasUpdateInput = z.infer<typeof VentaCuotasUpdateSchema>;

export const VentaPagoInputSchema = z.object({
  ventaId: z.string().min(1),
  cuotaN: z.number().int().positive(),
  montoCents: z.number().positive(),
});
export type VentaPagoInput = z.infer<typeof VentaPagoInputSchema>;

export const VentaAnularInputSchema = z.object({
  ventaId: z.string().min(1),
});
export type VentaAnularInput = z.infer<typeof VentaAnularInputSchema>;
