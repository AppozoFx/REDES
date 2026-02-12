import { z } from "zod";

export const ZonaEstadoSchema = z.enum(["HABILITADO", "INHABILITADO"]);
export const ZonaTipoSchema = z.enum(["ALTO_VALOR", "REGULAR"]);

// Documento completo guardado en Firestore
export const ZonaDocSchema = z.object({
  id: z.string(),
  zona: z.string().min(2), // SIEMPRE MAYÚSCULA (se normaliza en server)
  numero: z.number().int().positive(), // autogenerado; no editable
  nombre: z.string(), // `${ZONA} ${numero}`
  estado: ZonaEstadoSchema,
  tipo: ZonaTipoSchema,
  distritos: z.array(z.string()), // SIEMPRE MAYÚSCULA, deduplicado
});

// Crear zona: numero NO va en input; estado opcional con default HABILITADO
export const ZonaCreateSchema = z.object({
  zona: z.string().min(2).trim(),
  estado: ZonaEstadoSchema.default("HABILITADO"),
  tipo: ZonaTipoSchema,
  // Permitimos string[] para form-data; normalizamos en server
  distritos: z.array(z.string().min(1)).default([]),
});

// Actualizar zona: zona/numero NO editables
export const ZonaUpdateSchema = z.object({
  estado: ZonaEstadoSchema.optional(),
  tipo: ZonaTipoSchema.optional(),
  distritos: z.array(z.string().min(1)).optional(),
});

// Aliases con nombres solicitados
export const ZonaCreateInputSchema = ZonaCreateSchema;
export const ZonaUpdateInputSchema = ZonaUpdateSchema;
