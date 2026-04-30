import { z } from "zod";

export const MantenimientoLiquidacionEstadoSchema = z.enum([
  "ABIERTO",
  "LISTO_PARA_LIQUIDAR",
  "LIQUIDADO",
  "CORRECCION_PENDIENTE",
  "ANULADO",
]);

export const MantenimientoLiquidacionOrigenSchema = z.enum([
  "MANUAL",
  "TELEGRAM",
  "IMPORTADO",
]);

export const MaterialLiquidacionInputSchema = z.object({
  materialId: z.string().min(1),
  descripcion: z.string().optional(),
  unidadTipo: z.enum(["UND", "METROS"]),
  und: z.coerce.number().int().nonnegative().default(0),
  metros: z.coerce.number().nonnegative().default(0),
});

export const MantenimientoLiquidacionCreateSchema = z.object({
  ticketNumero: z.string().min(1),
  codigoCaja: z.string().optional().default(""),
  fechaAtencionYmd: z.string().min(1),
  distrito: z.string().optional().default(""),
  latitud: z.number().min(-90).max(90).nullable().optional(),
  longitud: z.number().min(-180).max(180).nullable().optional(),
  cuadrillaId: z.string().min(1),
  horaInicio: z.string().optional().default(""),
  horaFin: z.string().optional().default(""),
  causaRaiz: z.string().optional().default(""),
  solucion: z.string().optional().default(""),
  observacion: z.string().optional().default(""),
  sinMateriales: z.coerce.boolean().optional().default(false),
  motivoSinMateriales: z.string().optional().default(""),
  origen: MantenimientoLiquidacionOrigenSchema.default("MANUAL"),
  materialesConsumidos: z.array(MaterialLiquidacionInputSchema).default([]),
});

export const MantenimientoLiquidacionUpdateSchema = MantenimientoLiquidacionCreateSchema.extend({
  estado: MantenimientoLiquidacionEstadoSchema.optional(),
});

export type MaterialLiquidacionInput = z.infer<typeof MaterialLiquidacionInputSchema>;
export type MantenimientoLiquidacionCreateInput = z.infer<typeof MantenimientoLiquidacionCreateSchema>;
export type MantenimientoLiquidacionUpdateInput = z.infer<typeof MantenimientoLiquidacionUpdateSchema>;
