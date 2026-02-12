import { z } from "zod";

export const EquipoEnum = z.enum(["ONT", "MESH", "FONO", "BOX"]);

export const EquipoDocSchema = z.object({
  SN: z.string().min(1),
  equipo: EquipoEnum,
  descripcion: z.string().min(1),
  sn_tail: z.string().optional(),

  // Condicional: solo ONT
  proId: z.string().nullable().optional(),

  ubicacion: z.string().min(1), // normalizada MAYÚSCULAS
  estado: z.string().min(1), // derivado de ubicacion

  // Flags de control (SI/NO)
  pri_tec: z.enum(["SI", "NO"]).optional(),
  tec_liq: z.enum(["SI", "NO"]).optional(),
  inv: z.enum(["SI", "NO"]).optional(),

  // Fechas normalizadas (Lima) opcionales
  f_ingresoAt: z.any().nullable().optional(),
  f_ingresoYmd: z.string().nullable().optional(),
  f_ingresoHm: z.string().nullable().optional(),

  f_despachoAt: z.any().nullable().optional(),
  f_despachoYmd: z.string().nullable().optional(),
  f_despachoHm: z.string().nullable().optional(),

  f_devolucionAt: z.any().nullable().optional(),
  f_devolucionYmd: z.string().nullable().optional(),
  f_devolucionHm: z.string().nullable().optional(),

  f_instaladoAt: z.any().nullable().optional(),
  f_instaladoYmd: z.string().nullable().optional(),
  f_instaladoHm: z.string().nullable().optional(),

  // Opcionales (strings) - usar string vacía como convención consistente
  guia_ingreso: z.string().optional(),
  guia_despacho: z.string().optional(),
  guia_devolucion: z.string().optional(),
  cliente: z.string().optional(),
  codigoCliente: z.string().optional(),
  caso: z.string().optional(),
  observacion: z.string().optional(),

  tecnicos: z.array(z.string()).optional(),

  audit: z.any().optional(),
});

export type EquipoDoc = z.infer<typeof EquipoDocSchema>;

export const ImportEquiposRowSchema = z.object({
  SN: z.string().min(1),
  equipo: EquipoEnum,
  proId: z.string().optional(),
  descripcion: z.string().min(1),
  ubicacion: z.string().optional(),

  pri_tec: z.string().optional(),
  tec_liq: z.string().optional(),
  inv: z.string().optional(),

  f_ingreso: z.union([z.string(), z.number(), z.date()]).optional(),
  f_despacho: z.union([z.string(), z.number(), z.date()]).optional(),
  f_devolucion: z.union([z.string(), z.number(), z.date()]).optional(),
  f_instalado: z.union([z.string(), z.number(), z.date()]).optional(),

  guia_ingreso: z.string().optional(),
  guia_despacho: z.string().optional(),
  guia_devolucion: z.string().optional(),
  cliente: z.string().optional(),
  codigoCliente: z.string().optional(),
  caso: z.string().optional(),
  observacion: z.string().optional(),
  tecnicos: z.string().optional(), // CSV en input
});

export type ImportEquiposRow = z.infer<typeof ImportEquiposRowSchema>;
