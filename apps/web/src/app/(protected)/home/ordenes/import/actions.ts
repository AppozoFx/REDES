"use server";

import { requireServerPermission } from "@/core/auth/require";
import { revalidatePath } from "next/cache";
import { upsertOrden } from "@/domain/ordenes/repo";
import { addGlobalNotification } from "@/domain/notificaciones/service";

// Excel parsing
import * as XLSX from "xlsx";

const PERM = "ORDENES_IMPORT";

type ImportResult =
  | {
      ok: true;
      resumen: { nuevos: number; actualizados: number; duplicadosSinCambios: number };
    }
  | {
      ok: false;
      error: { formErrors: string[] };
    };

function getDateOrNull(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  return null;
}

function resolveFormData(a: any, b?: any): FormData {
  if (a && typeof a.get === "function" && !b) return a as FormData;
  if (b && typeof b.get === "function") return b as FormData;
  throw new Error("INVALID_FORMDATA");
}

type OrdenImportInput = {
  ordenId: string;
  tipoOrden?: string;
  tipoTraba?: string;
  fSoli?: Date | null;
  cliente?: string;
  tipo?: string;
  tipoClienId?: string;
  cuadrilla?: string;
  estado?: string;
  direccion?: string;
  direccion1?: string;
  idenServi?: string;
  region?: string;
  zonaDistrito?: string;
  codiSeguiClien?: string;
  numeroDocumento?: string;
  telefono?: string;
  fechaFinVisi?: Date | null;
  fechaIniVisi?: Date | null;
  motivoCancelacion?: string;
  georeferencia?: string;
};

export async function importOrdenesAction(arg1: any, arg2?: any): Promise<ImportResult> {
  try {
    const session = await requireServerPermission(PERM);
    const formData = resolveFormData(arg1, arg2);

    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return { ok: false, error: { formErrors: ["FILE_REQUIRED"] } };
    }

    const arrayBuf = await (file as File).arrayBuffer();
    const wb = XLSX.read(arrayBuf, { type: "array", cellDates: true });
    const sheet = wb.Sheets["Hoja de Datos"] ?? wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return { ok: false, error: { formErrors: ["SHEET_NOT_FOUND"] } };

    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", range: 7 });
    let nuevos = 0,
      actualizados = 0,
      duplicadosSinCambios = 0;
    const payloads: OrdenImportInput[] = [];

    for (const row of rows) {
      if (!row || row.length < 1) continue;
      const ordenId = String(row[0] ?? "").trim();
      if (!ordenId) continue;

      const tipoOrden = String(row[1] ?? "").trim() || undefined;
      const tipoTraba = String(row[2] ?? "").trim() || undefined;
      const fSoli = getDateOrNull(row[3]);
      const cliente = String(row[4] ?? "").trim() || undefined;
      const tipo = String(row[5] ?? "").trim() || undefined;
      const tipoClienId = String(row[6] ?? "").trim() || undefined;
      const cuadrilla = String(row[7] ?? "").trim() || undefined;
      const estado = String(row[8] ?? "").trim() || undefined;
      const direccion = String(row[9] ?? "").trim() || undefined;
      const direccion1 = String(row[10] ?? "").trim() || undefined;
      const idenServi = String(row[11] ?? "").trim() || undefined;
      const region = String(row[12] ?? "").trim() || undefined;
      const zonaDistrito = String(row[13] ?? "").trim() || undefined;
      const codiSeguiClien = String(row[14] ?? "").trim() || undefined;
      const numeroDocumento = String(row[15] ?? "").trim() || undefined;
      const telefono = String(row[16] ?? "").trim() || undefined;
      const fechaFinVisi = getDateOrNull(row[17]);
      const fechaIniVisi = getDateOrNull(row[18]);
      const motivoCancelacion = String(row[19] ?? "").trim() || undefined;
      const georeferencia = String(row[20] ?? "").trim() || undefined;

      payloads.push({
        ordenId,
        tipoOrden,
        tipoTraba,
        fSoli,
        cliente,
        tipo,
        tipoClienId,
        cuadrilla,
        estado,
        direccion,
        direccion1,
        idenServi,
        region,
        zonaDistrito,
        codiSeguiClien,
        numeroDocumento,
        telefono,
        fechaFinVisi,
        fechaIniVisi,
        motivoCancelacion,
        georeferencia,
      });
    }

    let cursor = 0;
    let workerError: any = null;
    const concurrency = Math.min(16, Math.max(1, payloads.length));

    async function worker() {
      while (true) {
        if (workerError) return;
        const idx = cursor++;
        if (idx >= payloads.length) return;
        try {
          const res = await upsertOrden(payloads[idx], session.uid);
          if (res === "CREATED") nuevos++;
          else if (res === "UPDATED") actualizados++;
          else duplicadosSinCambios++;
        } catch (err) {
          workerError = err;
          return;
        }
      }
    }

    if (payloads.length > 0) {
      await Promise.all(Array.from({ length: concurrency }, () => worker()));
    }
    if (workerError) {
      throw workerError;
    }

    const resumen = { nuevos, actualizados, duplicadosSinCambios };

    await addGlobalNotification({
      title: "Importación de Órdenes",
      message: `nuevos: ${nuevos}, actualizados: ${actualizados}, duplicados: ${duplicadosSinCambios}`,
      type: "success",
      scope: "ALL",
      createdBy: session.uid,
      entityType: "ORDENES",
      entityId: `import:${Date.now()}`,
      action: "CREATE",
      estado: "ACTIVO",
    });

    revalidatePath("/home/ordenes");
    revalidatePath("/home");

    return { ok: true, resumen };
  } catch (e: any) {
    const code = String(e?.message ?? "ERROR");
    if (code === "UNAUTHENTICATED" || code === "ACCESS_DISABLED" || code === "FORBIDDEN") {
      return { ok: false, error: { formErrors: [code] } };
    }
    return { ok: false, error: { formErrors: [code || "ERROR"] } };
  }
}
