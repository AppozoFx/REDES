import { z } from "zod";

export const SupervisorAreaSchema = z.enum(["INSTALACIONES", "MANTENIMIENTO"]);
export const SupervisorEstadoSchema = z.enum(["HABILITADO", "INHABILITADO"]);

const UidSchema = z.string().min(1).max(128).trim();

const cleanIds = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
};

export const SupervisorConfigInputSchema = z.object({
  uid: UidSchema,
  area: SupervisorAreaSchema.default("INSTALACIONES"),
  estado: SupervisorEstadoSchema.default("HABILITADO"),
  almacenHabilitado: z.coerce.boolean().default(true),
  trackingHabilitado: z.coerce.boolean().default(true),
  sectoresIds: z.preprocess(cleanIds, z.array(z.string()).default([])),
  notas: z.string().max(500).optional().default(""),
  vehiculoPlaca: z.string().max(20).optional().default(""),
  vehiculoSoatVence: z.string().max(10).optional().default(""),
  vehiculoRevTecVence: z.string().max(10).optional().default(""),
});

export const SupervisorDocSchema = SupervisorConfigInputSchema.extend({
  nombre: z.string().optional().default(""),
  nombreCorto: z.string().optional().default(""),
  email: z.string().optional().default(""),
  celular: z.string().optional().default(""),
  audit: z.any().optional(),
  lastLocation: z
    .object({
      lat: z.number().optional(),
      lng: z.number().optional(),
      at: z.any().optional(),
    })
    .optional(),
});

export type SupervisorConfigInput = z.infer<typeof SupervisorConfigInputSchema>;
export type SupervisorDoc = z.infer<typeof SupervisorDocSchema>;
