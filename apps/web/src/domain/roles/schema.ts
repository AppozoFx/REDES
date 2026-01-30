import { z } from "zod";

export const RoleIdSchema = z.string().min(2).max(40);

export const RoleCreateSchema = z.object({
  id: RoleIdSchema.regex(/^[A-Z0-9_]+$/, "Usa MAYÚSCULAS, números y _"),
  nombre: z.string().min(2).max(60),
  descripcion: z.string().max(200).optional().default(""),
  permisos: z.array(z.string()).default([]),
  areasDefault: z.array(z.string()).default([]),
});

export const RoleUpdateSchema = RoleCreateSchema.omit({ id: true }).partial();

export const RoleSoftDeleteSchema = z.object({
  motivoBaja: z.string().min(3).max(200),
});
