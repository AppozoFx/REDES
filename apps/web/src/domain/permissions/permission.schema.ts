import { z } from "zod";

export const PermissionEstadoSchema = z.enum(["ACTIVO", "INACTIVO"]);

export const PermissionIdSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[A-Z0-9_]+$/, "Formato inválido. Usa A-Z, 0-9 y _");

export const PermissionCreateSchema = z.object({
  id: PermissionIdSchema,
  nombre: z.string().min(3).max(80),
  descripcion: z.string().max(240).optional(),
  modulo: z.string().min(2).max(40), // puedes endurecer luego a enum
});

export const PermissionUpdateSchema = z.object({
  nombre: z.string().min(3).max(80).optional(),
  descripcion: z.string().max(240).optional(),
  modulo: z.string().min(2).max(40).optional(),
  estado: PermissionEstadoSchema.optional(),
});
