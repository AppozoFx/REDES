import { z } from "zod";

export const CuadrillaEstadoSchema = z.enum(["HABILITADO", "INHABILITADO"]);
export const CuadrillaCategoriaSchema = z.enum(["CONDOMINIO", "RESIDENCIAL"]);
export const CuadrillaVehiculoSchema = z.enum(["MOTO", "AUTO"]);
export const ZonaTipoSchema = z.enum(["ALTO_VALOR", "REGULAR"]);

// Documento completo en Firestore
export const CuadrillaDocSchema = z.object({
  id: z.string(), // K{n}_MOTO | K{n}_RESIDENCIAL
  nombre: z.string(), // K{n} MOTO | K{n} RESIDENCIAL
  area: z.literal("INSTALACIONES"),
  categoria: CuadrillaCategoriaSchema,
  r_c: CuadrillaCategoriaSchema, // mismo valor que categoria
  numeroCuadrilla: z.number().int().positive(),
  vehiculo: CuadrillaVehiculoSchema,
  vehiculoModelo: z.string().optional(),
  vehiculoMarca: z.string().optional(),

  zonaId: z.string().min(1),
  tipoZona: ZonaTipoSchema,

  placa: z.string().min(1), // normalizada MAYÚSCULA y colapso de espacios

  tecnicosUids: z.array(z.string()),
  coordinadorUid: z.string().min(1),
  gestorUid: z.string().min(1),
  conductorUid: z.string().min(1), // debe pertenecer a tecnicosUids

  estado: CuadrillaEstadoSchema,

  licenciaNumero: z.string().optional(),
  licenciaVenceAt: z.any().optional(), // Firestore Timestamp | null
  licenciaEstado: z.enum(["NO_CUENTA", "VIGENTE", "VENCIDA"]),

  soatVenceAt: z.any().optional(),
  soatEstado: z.enum(["NO_CUENTA", "VIGENTE", "VENCIDA"]),

  revTecVenceAt: z.any().optional(),
  revTecEstado: z.enum(["NO_CUENTA", "VIGENTE", "VENCIDA"]),

  credUsuario: z.string().optional(),
  credPassword: z.string().optional(),

  lat: z.number().optional(),
  lng: z.number().optional(),
  lastLocationAt: z.any().optional(),
});

// Crear (inputs provenientes del form)
export const CuadrillaCreateSchema = z.object({
  categoria: CuadrillaCategoriaSchema,zonaId: z.string().min(1).optional(),
  placa: z.string().trim().optional(),

  tecnicosUids: z.array(z.string().min(1)).default([]),
  coordinadorUid: z.string().min(1).optional(),
  gestorUid: z.string().min(1).optional(),
  conductorUid: z.string().min(1).optional(),

  estado: CuadrillaEstadoSchema.default("HABILITADO"),

  licenciaNumero: z.string().optional(),
  licenciaVenceAt: z.string().optional(), // YYYY-MM-DD
  soatVenceAt: z.string().optional(), // YYYY-MM-DD
  revTecVenceAt: z.string().optional(), // YYYY-MM-DD

  credUsuario: z.string().optional(),
  credPassword: z.string().optional(),

  vehiculoModelo: z.string().optional(),
  vehiculoMarca: z.string().optional(),

  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
});

// Actualizar: solo campos editables
export const CuadrillaUpdateSchema = z.object({
  placa: z.string().trim().optional(),
  tecnicosUids: z.array(z.string().min(1)).optional(),
  coordinadorUid: z.string().min(1).optional(),
  gestorUid: z.string().min(1).optional(),
  conductorUid: z.string().min(1).optional(),
  estado: CuadrillaEstadoSchema.optional(),

  licenciaNumero: z.string().optional().nullable(),
  licenciaVenceAt: z.string().optional().nullable(),
  soatVenceAt: z.string().optional().nullable(),
  revTecVenceAt: z.string().optional().nullable(),

  credUsuario: z.string().optional().nullable(),
  credPassword: z.string().optional().nullable(),

  vehiculoModelo: z.string().optional().nullable(),
  vehiculoMarca: z.string().optional().nullable(),

  lat: z.coerce.number().optional().nullable(),
  lng: z.coerce.number().optional().nullable(),
});

export const CuadrillaCreateInputSchema = CuadrillaCreateSchema;
export const CuadrillaUpdateInputSchema = CuadrillaUpdateSchema;
