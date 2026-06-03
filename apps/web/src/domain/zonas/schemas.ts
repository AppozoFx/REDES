import { z } from "zod";

export const ZonaEstadoSchema = z.enum(["HABILITADO", "INHABILITADO"]);
export const ZonaTipoSchema = z.enum(["ALTO_VALOR", "REGULAR"]);
export const ZonaGeometryPointSchema = z.tuple([z.number(), z.number()]);
export const ZonaGeometryRingSchema = z.array(ZonaGeometryPointSchema).min(4);
export const ZonaGeometrySchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.tuple([ZonaGeometryRingSchema]),
});

export const ZonaDocSchema = z.object({
  id: z.string(),
  zona: z.string().min(2),
  numero: z.number().int().positive(),
  nombre: z.string(),
  estado: ZonaEstadoSchema,
  tipo: ZonaTipoSchema,
  distritos: z.array(z.string()),
  geometry: ZonaGeometrySchema.optional(),
});

export const ZonaCreateSchema = z.object({
  zona: z.string().min(2).trim(),
  estado: ZonaEstadoSchema.default("HABILITADO"),
  tipo: ZonaTipoSchema,
  distritos: z.array(z.string().min(1)).default([]),
});

export const ZonaUpdateSchema = z.object({
  estado: ZonaEstadoSchema.optional(),
  tipo: ZonaTipoSchema.optional(),
  distritos: z.array(z.string().min(1)).optional(),
  geometry: ZonaGeometrySchema.nullable().optional(),
});

export const ZonaCreateInputSchema = ZonaCreateSchema;
export const ZonaUpdateInputSchema = ZonaUpdateSchema;
