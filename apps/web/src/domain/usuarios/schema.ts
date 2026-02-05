import { z } from "zod";

export const UidSchema = z.string().min(10).max(128);

export const EstadoAccesoSchema = z.enum(["HABILITADO", "INHABILITADO"]);
export const EstadoPerfilSchema = z.enum(["ACTIVO", "INACTIVO"]);

export const TipoDocSchema = z.enum(["DNI", "CE"]);
export const GeneroSchema = z.enum(["M", "F", "OTRO", "NO_ESPECIFICA"]);

const DateYmdSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato inválido (YYYY-MM-DD)");

const onlyDigits = (s: string) => s.replace(/\D/g, "");

/**
 * ✅ Crear usuario: perfil + acceso base
 */
export const UserCreateSchema = z.object({
  // Auth
  email: z.string().email(),
  password: z.string().min(6).max(64),

  // Perfil requerido
  nombres: z.string().min(2).max(80).trim(),
  apellidos: z.string().min(2).max(80).trim(),

  tipoDoc: TipoDocSchema,
  nroDoc: z.string().min(6).max(15).trim(),

  celular: z
    .string()
    .min(7)
    .max(20)
    .transform((v) => onlyDigits(v)),

  direccion: z.string().min(3).max(160).trim(),

  genero: GeneroSchema,
  nacionalidad: z.string().min(2).max(60).trim(),

  fIngreso: DateYmdSchema,
  fNacimiento: DateYmdSchema,

  estadoPerfil: EstadoPerfilSchema.default("ACTIVO"),

  // Acceso
  roles: z.array(z.string().min(2)).default([]),
  areas: z.array(z.string().min(2)).default([]),

  // permisos directos (opcional)
  permissions: z.array(z.string().min(3).max(64)).default([]),

  // Recomendados (opcionales)
  sede: z.string().min(2).max(40).trim().optional(),
  cargo: z.string().min(2).max(40).trim().optional(),
  cuadrillaId: z.string().min(1).max(60).trim().optional(),
  supervisorUid: UidSchema.optional(),
});

/**
 * Crear usuario (NO ADMIN): restringe roles a catálogo permitido sin ADMIN.
 * Devuelve errores en path roles[i] cuando corresponda.
 */
export const UserCreateNonAdminSchema = UserCreateSchema.extend({
  roles: z.array(z.enum(["COORDINADOR", "GESTOR", "SUPERVISOR", "TECNICO"]))
    .default([]),
});

/**
 * ✅ Update acceso (RBAC) - ya existente
 */
export const UserAccessUpdateSchema = z.object({
  roles: z.array(z.string().min(2)).default([]),
  areas: z.array(z.string().min(2)).default([]),
  permissions: z.array(z.string().min(3).max(64)).default([]),
  estadoAcceso: EstadoAccesoSchema.default("HABILITADO"),
});

/**
 * ✅ Deshabilitar acceso (soft)
 */
export const UserDisableSchema = z.object({
  motivoBaja: z.string().min(3).max(200),
});

/**
 * ✅ Update perfil (para siguiente paso /admin/usuarios/[uid])
 */
export const UserPerfilUpdateSchema = z.object({
  nombres: z.string().min(2).max(80).trim().optional(),
  apellidos: z.string().min(2).max(80).trim().optional(),
  tipoDoc: TipoDocSchema.optional(),
  nroDoc: z.string().min(6).max(15).trim().optional(),
  celular: z
    .string()
    .min(7)
    .max(20)
    .transform((v) => onlyDigits(v))
    .optional(),
  direccion: z.string().min(3).max(160).trim().optional(),
  genero: GeneroSchema.optional(),
  nacionalidad: z.string().min(2).max(60).trim().optional(),
  fIngreso: DateYmdSchema.optional(),
  fNacimiento: DateYmdSchema.optional(),
  estadoPerfil: EstadoPerfilSchema.optional(),

  sede: z.string().min(2).max(40).trim().optional(),
  cargo: z.string().min(2).max(40).trim().optional(),
  cuadrillaId: z.string().min(1).max(60).trim().optional(),
  supervisorUid: UidSchema.optional(),
});

/**
 * ✅ Update perfil (SELF) - usuario no-admin (Mi Perfil)
 * Solo campos seguros: contacto. No tocar doc/fechas/estado/sede/cargo/etc.
 */
export const UserSelfUpdateSchema = z.object({
  celular: z
    .string()
    .min(7)
    .max(20)
    .transform((v) => onlyDigits(v))
    .optional()
    .or(z.literal("")),

  direccion: z.string().min(3).max(160).trim().optional().or(z.literal("")),
});

export type UserSelfUpdateInput = z.infer<typeof UserSelfUpdateSchema>;

/**
 * ✅ Update perfil OPERATIVO (desde /home/usuarios/[uid])
 * Importante: NO incluye tipoDoc/nroDoc/fechas/estado/sede/cargo/cuadrilla/supervisor.
 */
export const UserOperativePerfilUpdateSchema = z.object({
  nombres: z.string().min(2).max(80).trim().optional().or(z.literal("")),
  apellidos: z.string().min(2).max(80).trim().optional().or(z.literal("")),

  celular: z
    .string()
    .min(7)
    .max(20)
    .transform((v) => onlyDigits(v))
    .optional()
    .or(z.literal("")),

  direccion: z.string().min(3).max(160).trim().optional().or(z.literal("")),
});

export type UserOperativePerfilUpdateInput = z.infer<
  typeof UserOperativePerfilUpdateSchema
>;


export const HomeUserCreateSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(64),

  nombres: z.string().min(2).max(80).trim(),
  apellidos: z.string().min(2).max(80).trim(),

  tipoDoc: TipoDocSchema,
  nroDoc: z.string().min(6).max(15).trim(),

  celular: z.string().min(7).max(20).transform((v) => onlyDigits(v)),
  direccion: z.string().min(3).max(160).trim(),

  genero: GeneroSchema,
  nacionalidad: z.string().min(2).max(60).trim(),

  fIngreso: DateYmdSchema,
  fNacimiento: DateYmdSchema,

  // Rol inicial controlado (NO ADMIN)
  rolInicial: z.string().min(2),
});

export type HomeUserCreateInput = z.infer<typeof HomeUserCreateSchema>;



