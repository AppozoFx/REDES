import { z } from "zod";

export const ComunicadoPersistenciaSchema = z.enum(["ONCE", "ALWAYS"]);

export const ComunicadoCreateSchema = z.object({
  titulo: z.string().trim().min(3).max(120),
  cuerpo: z.string().trim().min(1).max(5000),

  // ✅ permitir vacío o URL válida
  imageUrl: z.string().trim().url().optional().or(z.literal("")).default(""),
  linkUrl: z.string().trim().url().optional().or(z.literal("")).default(""),
  linkLabel: z.string().trim().max(60).optional().or(z.literal("")).default(""),

  estado: z.enum(["ACTIVO", "INACTIVO"]).default("ACTIVO"),
  target: z.enum(["ALL", "ROLES", "AREAS", "USERS"]).default("ALL"),

  rolesTarget: z.array(z.string()).default([]),
  areasTarget: z.array(z.string()).default([]),
  uidsTarget: z.array(z.string()).default([]),

  // las fechas llegan como YYYY-MM-DD o ""
  visibleDesde: z.string().optional().or(z.literal("")).default(""),
  visibleHasta: z.string().optional().or(z.literal("")).default(""),

  prioridad: z.number().int().min(0).max(999).default(100),
  obligatorio: z.boolean().default(false),

  // ✅ NUEVO
  persistencia: ComunicadoPersistenciaSchema.default("ONCE"),
});

export const ComunicadoUpdateSchema = ComunicadoCreateSchema.partial();

export const ComunicadoToggleSchema = z.object({
  estado: z.enum(["ACTIVO", "INACTIVO"]),
});
