import { z } from "zod";

export const OrdenDocSchema = z.object({
  ordenId: z.string().min(1),

  tipoOrden: z.string().optional(),
  tipoTraba: z.string().optional(),
  cliente: z.string().optional(),
  tipo: z.string().optional(),
  tipoClienId: z.string().optional(),

  estado: z.string().optional(),
  direccion: z.string().optional(),
  direccion1: z.string().optional(),
  idenServi: z.string().optional(),
  region: z.string().optional(),
  zonaDistrito: z.string().optional(),
  codiSeguiClien: z.string().optional(),
  numeroDocumento: z.string().optional(),
  teleMovilNume: z.string().optional(),
  motivoCancelacion: z.string().optional(),

  // Georeferencia
  georeferenciaRaw: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),

  // Fechas normalizadas (Lima)
  fSoliAt: z.any().optional(), // Firestore Timestamp
  fSoliYmd: z.string().optional(),
  fSoliHm: z.string().optional(),

  fechaIniVisiAt: z.any().optional(),
  fechaIniVisiYmd: z.string().optional(),
  fechaIniVisiHm: z.string().optional(),

  fechaFinVisiAt: z.any().optional(),
  fechaFinVisiYmd: z.string().optional(),
  fechaFinVisiHm: z.string().optional(),

  // Cuadrilla enriquecida
  cuadrillaRaw: z.string().optional(),
  cuadrillaCodigo: z.string().optional(), // K{n}
  cuadrillaId: z.string().optional(), // K{n}_{MOTO|RESIDENCIAL}
  cuadrillaNombre: z.string().optional(),
  tipoCuadrilla: z.string().optional(), // MOTO | RESIDENCIAL
  zonaCuadrilla: z.string().optional(), // zonaId
  gestorCuadrilla: z.string().optional(), // uid
  coordinadorCuadrilla: z.string().optional(), // uid

  audit: z.any().optional(),
});

export type OrdenDoc = z.infer<typeof OrdenDocSchema>;

