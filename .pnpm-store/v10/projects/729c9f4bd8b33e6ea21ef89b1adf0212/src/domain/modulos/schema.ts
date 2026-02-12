import { z } from "zod";

export const ModuleIdSchema = z.string().min(2).max(40);

export const ModuleCreateSchema = z.object({
  id: ModuleIdSchema.regex(/^[A-Z0-9_]+$/, "Usa MAYÚSCULAS, números y _"),
  key: z.string().min(2).max(40).regex(/^[A-Z0-9_]+$/, "Usa MAYÚSCULAS, números y _"),
  nombre: z.string().min(2).max(60),
  descripcion: z.string().max(200).optional().default(""),
  orden: z.number().int().min(0).max(999).default(0),
});

export const ModuleUpdateSchema = ModuleCreateSchema.omit({ id: true }).partial();

export const ModuleSoftDeleteSchema = z.object({
  motivoBaja: z.string().min(3).max(200),
});
