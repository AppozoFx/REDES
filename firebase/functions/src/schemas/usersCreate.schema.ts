import { z } from "zod";

export const UsersCreateSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).optional(),

  nombres: z.string().min(1),
  apellidos: z.string().min(1),
  dni_ce: z.string().min(6),
  celular: z.string().min(6),
  direccion: z.string().optional().default(""),

  genero: z.enum(["M", "F", "OTRO"]).optional(),
  nacionalidad: z.string().optional(),

  rol: z.string().min(1),
  area: z.enum(["INSTALACIONES", "AVERIAS"]),

  roles: z.array(z.string()).default([]),
  areas: z.array(z.enum(["INSTALACIONES", "AVERIAS"])).default([]),

  estado: z.enum(["ACTIVO", "INACTIVO"]).default("ACTIVO"),
  estadoAcceso: z.enum(["HABILITADO", "BLOQUEADO"]).default("HABILITADO"),
});

export type UsersCreateInput = z.infer<typeof UsersCreateSchema>;
