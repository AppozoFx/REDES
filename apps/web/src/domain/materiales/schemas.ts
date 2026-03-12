import { z } from "zod";

export const UnidadTipoEnum = z.enum(["UND", "METROS"]);
export type UnidadTipo = z.infer<typeof UnidadTipoEnum>;
export const VentaUnidadTiposSchema = z.array(UnidadTipoEnum).min(1).optional();
export type VentaUnidadTipos = z.infer<typeof VentaUnidadTiposSchema>;

export const AreaEnum = z.enum(["INSTALACIONES", "MANTENIMIENTO"]);
export type Area = z.infer<typeof AreaEnum>;

export const MaterialCreateInputSchema = z.object({
  nombre: z.string().min(1),
  descripcion: z.string().optional(),
  areas: z.array(AreaEnum).min(1),
  unidadTipo: UnidadTipoEnum,
  vendible: z.boolean(),
  ventaUnidadTipos: VentaUnidadTiposSchema,

  // Solo si unidadTipo === 'METROS'
  metrosPorUnd: z.number().positive().optional(),
  precioPorMetro: z.number().nonnegative().optional(),
  minStockMetros: z.number().nonnegative().optional(),

  // Solo si unidadTipo === 'UND'
  precioUnd: z.number().nonnegative().optional(),
  minStockUnd: z.number().nonnegative().optional(),
});

export type MaterialCreateInput = z.infer<typeof MaterialCreateInputSchema>;

export type MaterialDocUnd = {
  id: string;
  nombre: string;
  nombreNorm: string;
  descripcion?: string;
  unidadTipo: "UND";
  ventaUnidadTipos?: Array<"UND">;
  stockUnd: number;
  minStockUnd?: number;
  vendible: boolean;
  precioUndCents?: number;
  areas: Area[];
  estado: "ACTIVO" | "INACTIVO";
  audit?: any;
};

export type MaterialDocMetros = {
  id: string;
  nombre: string;
  nombreNorm: string;
  descripcion?: string;
  unidadTipo: "METROS";
  ventaUnidadTipos?: Array<"UND" | "METROS">;
  metrosPorUndCm: number;
  stockCm: number;
  minStockCm?: number;
  vendible: boolean;
  precioUndCents?: number;
  precioPorMetroCents?: number;
  precioPorCmCents?: number;
  areas: Area[];
  estado: "ACTIVO" | "INACTIVO";
  audit?: any;
};

export type MaterialDoc = MaterialDocUnd | MaterialDocMetros;

export const MaterialUpdateInputSchema = z.object({
  id: z.string().min(1),
  nombre: z.string().min(1),
  descripcion: z.string().optional(),
  areas: z.array(AreaEnum).min(1),
  unidadTipo: UnidadTipoEnum,
  vendible: z.boolean(),
  ventaUnidadTipos: VentaUnidadTiposSchema,

  // METROS
  metrosPorUnd: z.number().positive().optional(),
  precioPorMetro: z.number().nonnegative().optional(),
  minStockMetros: z.number().nonnegative().optional(),

  // UND
  precioUnd: z.number().nonnegative().optional(),
  minStockUnd: z.number().nonnegative().optional(),
});

export type MaterialUpdateInput = z.infer<typeof MaterialUpdateInputSchema>;
