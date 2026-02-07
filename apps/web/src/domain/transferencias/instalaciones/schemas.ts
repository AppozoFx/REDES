import { z } from "zod";

// Entradas
export const MaterialLineaInputSchema = z.object({
  materialId: z.string().min(1),
  und: z.number().nonnegative().optional(),
  metros: z.number().nonnegative().optional(),
}).refine((v) => typeof v.und === "number" || typeof v.metros === "number", {
  message: "UND_o_METROS_REQUERIDO",
});

export const BobinaResidencialDespachoSchema = z.object({
  codigoRaw: z.string().min(1),
});

export const BobinaResidencialDevolucionSchema = z.object({
  codigo: z.string().min(1), // esperado ya normalizado en UI (WIN-XXXX) o bruto si decides normalizar en server
});

export const DespachoInstalacionesInputSchema = z.object({
  transferId: z.string().min(1).optional(),
  cuadrillaId: z.string().min(1),
  guia: z.string().min(1).optional(),
  equipos: z.array(z.string().min(1)).default([]),
  materiales: z.array(MaterialLineaInputSchema).default([]),
  bobinasResidenciales: z.array(BobinaResidencialDespachoSchema).optional(),
  observacion: z.string().optional(),
});

export type DespachoInstalacionesInput = z.infer<typeof DespachoInstalacionesInputSchema>;

export const DevolucionInstalacionesInputSchema = z.object({
  transferId: z.string().min(1).optional(),
  cuadrillaId: z.string().min(1),
  guia: z.string().min(1).optional(),
  equipos: z.array(z.string().min(1)).default([]),
  materiales: z.array(MaterialLineaInputSchema).default([]),
  bobinasResidenciales: z.array(BobinaResidencialDevolucionSchema).optional(),
  observacion: z.string().optional(),
});

export type DevolucionInstalacionesInput = z.infer<typeof DevolucionInstalacionesInputSchema>;

// Resultados
export const TransferItemEquipoResultSchema = z.object({
  sn: z.string(),
  status: z.enum(["OK", "ERROR"]),
  reason: z.string().optional(),
});
export type TransferItemEquipoResult = z.infer<typeof TransferItemEquipoResultSchema>;

export const TransferItemMaterialResultSchema = z.object({
  materialId: z.string(),
  status: z.enum(["OK", "ERROR"]),
  reason: z.string().optional(),
});
export type TransferItemMaterialResult = z.infer<typeof TransferItemMaterialResultSchema>;

export const TransferResumenSchema = z.object({
  equipos: z.object({ ok: z.number(), fail: z.number() }),
  materiales: z.object({ ok: z.number(), fail: z.number() }),
  warnings: z.array(z.string()),
});
export type TransferResumen = z.infer<typeof TransferResumenSchema>;

export const TransferOkSchema = z.object({
  ok: z.literal(true),
  transferId: z.string(),
  guia: z.string(),
  resumen: TransferResumenSchema,
  itemsEquipos: z.array(TransferItemEquipoResultSchema),
  itemsMateriales: z.array(TransferItemMaterialResultSchema),
});
export type TransferOk = z.infer<typeof TransferOkSchema>;

export const TransferFailSchema = z.object({
  ok: z.literal(false),
  error: z.object({ formErrors: z.array(z.string()) }),
});
export type TransferFail = z.infer<typeof TransferFailSchema>;

