import { z } from "zod";

export const UidSchema = z.string().min(10).max(128);

export const EstadoAccesoSchema = z.enum(["HABILITADO", "INHABILITADO"]);

export const UserCreateSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(64),
  displayName: z.string().min(2).max(60).optional().default(""),
  roles: z.array(z.string().min(2)).default([]),
  areas: z.array(z.string().min(2)).default([]),
});

export const UserAccessUpdateSchema = z.object({
  roles: z.array(z.string().min(2)).default([]),
  areas: z.array(z.string().min(2)).default([]),
  estadoAcceso: EstadoAccesoSchema.default("HABILITADO"),
});

export const UserDisableSchema = z.object({
  motivoBaja: z.string().min(3).max(200),
});
