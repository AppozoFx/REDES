import { z } from "zod";

export const UnidadTipoEnum = z.enum(["UND", "METROS"]);
export type UnidadTipo = z.infer<typeof UnidadTipoEnum>;

export const AreaEnum = z.enum(["INSTALACIONES", "MANTENIMIENTO"]);
export type Area = z.infer<typeof AreaEnum>;

export const MaterialCreateInputSchema = z.object({
  nombre: z.string().min(1),
  descripcion: z.string().optional(),
  areas: z.array(AreaEnum).min(1),
  unidadTipo: UnidadTipoEnum,
  vendible: z.boolean(),

  // Solo si unidadTipo === 'METROS'
  metrosPorUnd: z.number().positive().optional(), // UI en metros
  precioPorMetro: z.number().nonnegative().optional(), // UI en moneda por metro
  minStockMetros: z.number().nonnegative().optional(), // UI en metros

  // Solo si unidadTipo === 'UND'
  precioUnd: z.number().nonnegative().optional(), // UI en moneda por UND
  minStockUnd: z.number().nonnegative().optional(),
});

export type MaterialCreateInput = z.infer<typeof MaterialCreateInputSchema>;

export type MaterialDocUnd = {
  id: string;
  nombre: string;
  nombreNorm: string;
  descripcion?: string;
  unidadTipo: "UND";
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
  metrosPorUndCm: number;
  stockCm: number;
  minStockCm?: number;
  vendible: boolean;
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
  unidadTipo: UnidadTipoEnum, // no cambiar unidad sin migración; validar en repo
  vendible: z.boolean(),

  // METROS
  metrosPorUnd: z.number().positive().optional(),
  precioPorMetro: z.number().nonnegative().optional(),
  minStockMetros: z.number().nonnegative().optional(),

  // UND
  precioUnd: z.number().nonnegative().optional(),
  minStockUnd: z.number().nonnegative().optional(),
});

export type MaterialUpdateInput = z.infer<typeof MaterialUpdateInputSchema>;

