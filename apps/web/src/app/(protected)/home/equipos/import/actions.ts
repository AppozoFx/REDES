"use server";

import { requireServerPermission } from "@/core/auth/require";
import { revalidatePath } from "next/cache";
import { addGlobalNotification } from "@/domain/notificaciones/service";
import * as XLSX from "xlsx";
import type { EquipoDoc } from "@/domain/equipos/schemas";
import {
  createEquipo,
  getExistingSNs,
  normalizeUbicacion,
  parseExcelDateToDate,
  timestampFromLimaParts,
  toDatePartsLima,
} from "@/domain/equipos/repo";

const PERM = "EQUIPOS_IMPORT";

type ImportFail = { ok: false; error: { formErrors: string[] } };

export type NormalizedImportRow = {
  SN: string;
  equipo: "ONT" | "MESH" | "FONO" | "BOX";
  descripcion: string;
  proId?: string | null;
  ubicacion: string;
  estado: string;
  f_ingresoYmd: string | null;
  f_ingresoHm: string | null;
  f_despachoYmd: string | null;
  f_despachoHm: string | null;
  f_devolucionYmd: string | null;
  f_devolucionHm: string | null;
  f_instaladoYmd: string | null;
  f_instaladoHm: string | null;
  guia_ingreso: string;
  guia_despacho: string;
  guia_devolucion: string;
  cliente: string;
  codigoCliente: string;
  caso: string;
  observacion: string;
  tecnicos: string[];
  pri_tec: "SI" | "NO";
  tec_liq: "SI" | "NO";
  inv: "SI" | "NO";
};

type ParseOk = {
  ok: true;
  data: {
    fileFingerprint: string;
    nuevos: { SN: string; equipo: string; descripcion: string; ubicacion: string; estado: string }[];
    duplicadosBD: { SN: string; equipo?: string; descripcion?: string; ubicacion?: string }[];
    duplicadosInternosExcel: number;
    invalidas: number;
    ubicacionesInvalidas: number;
    conteoPorEquipo: Record<string, number>;
    totalNuevos: number;
    importRows: NormalizedImportRow[];
  };
};

type SaveChunkOk = {
  ok: true;
  data: {
    requested: number;
    created: number;
    alreadyExists: number;
  };
};

function resolveFormData(a: any, b?: any): FormData {
  if (a && typeof a.get === "function" && !b) return a as FormData;
  if (b && typeof b.get === "function") return b as FormData;
  throw new Error("INVALID_FORMDATA");
}

function hasHeaders(headers: string[], required: string[]): boolean {
  const set = new Set(headers.map((h) => String(h || "").trim()));
  return required.every((r) => set.has(r));
}

function normalizeEquipo(v: any): "ONT" | "MESH" | "FONO" | "BOX" | null {
  const t = String(v ?? "").trim().toUpperCase();
  if (t === "ONT" || t === "MESH" || t === "FONO" || t === "BOX") return t;
  return null;
}

function normalizeYesNo(v: any): "SI" | "NO" {
  const s = String(v ?? "").trim().toUpperCase();
  return s === "SI" ? "SI" : "NO";
}

function fileFingerprintFromFormData(formData: FormData): string {
  const explicit = formData.get("fileFingerprint");
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  const file = formData.get("file");
  if (!file || typeof file === "string") return "unknown";
  const typedFile = file as File;
  return [typedFile.name || "file", typedFile.size || 0, typedFile.lastModified || 0].join(":");
}

function normalizedRowToDoc(row: NormalizedImportRow): Omit<EquipoDoc, "audit"> {
  return {
    SN: row.SN,
    equipo: row.equipo,
    descripcion: row.descripcion,
    proId: row.proId ?? undefined,
    ubicacion: row.ubicacion,
    estado: row.estado,
    f_ingresoAt: timestampFromLimaParts(row.f_ingresoYmd, row.f_ingresoHm),
    f_ingresoYmd: row.f_ingresoYmd,
    f_ingresoHm: row.f_ingresoHm,
    f_despachoAt: timestampFromLimaParts(row.f_despachoYmd, row.f_despachoHm),
    f_despachoYmd: row.f_despachoYmd,
    f_despachoHm: row.f_despachoHm,
    f_devolucionAt: timestampFromLimaParts(row.f_devolucionYmd, row.f_devolucionHm),
    f_devolucionYmd: row.f_devolucionYmd,
    f_devolucionHm: row.f_devolucionHm,
    f_instaladoAt: timestampFromLimaParts(row.f_instaladoYmd, row.f_instaladoHm),
    f_instaladoYmd: row.f_instaladoYmd,
    f_instaladoHm: row.f_instaladoHm,
    guia_ingreso: row.guia_ingreso,
    guia_despacho: row.guia_despacho,
    guia_devolucion: row.guia_devolucion,
    cliente: row.cliente,
    codigoCliente: row.codigoCliente,
    caso: row.caso,
    observacion: row.observacion,
    tecnicos: row.tecnicos,
    pri_tec: row.pri_tec,
    tec_liq: row.tec_liq,
    inv: row.inv,
  };
}

async function parseArrayBuffer(arrayBuf: ArrayBuffer): Promise<{
  duplicadosInternosExcel: number;
  invalidas: number;
  ubicacionesInvalidas: number;
  duplicadosBD: { SN: string; equipo?: string; descripcion?: string; ubicacion?: string }[];
  nuevosItems: { SN: string; equipo: "ONT" | "MESH" | "FONO" | "BOX"; doc: NormalizedImportRow }[];
  conteoPorEquipo: Record<string, number>;
}> {
  const wb = XLSX.read(arrayBuf, { type: "array", cellDates: true });
  const sheet = wb.Sheets["Hoja de Datos"] ?? wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("SHEET_NOT_FOUND");

  const headerRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (!headerRows.length) throw new Error("INVALID_HEADERS");
  const headers = headerRows[0].map((x: any) => String(x ?? "").trim());
  const required = ["SN", "equipo", "descripcion"];
  if (!hasHeaders(headers, required)) throw new Error("INVALID_HEADERS");

  const rowsRaw: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  let duplicadosInternosExcel = 0;
  let invalidas = 0;
  let ubicacionesInvalidas = 0;

  const firstBySN = new Set<string>();
  const candidates: Map<string, { SN: string; equipo: "ONT" | "MESH" | "FONO" | "BOX"; doc: NormalizedImportRow }> = new Map();

  for (const r of rowsRaw) {
    const raw: Record<string, any> = {
      SN: r["SN"],
      equipo: r["equipo"],
      proId: r["proId"],
      descripcion: r["descripcion"],
      ubicacion: r["ubicacion"],
      f_ingreso: r["f_ingreso"],
      f_despacho: r["f_despacho"],
      f_devolucion: r["f_devolucion"],
      f_instalado: r["f_instalado"],
      guia_ingreso: r["guia_ingreso"],
      guia_despacho: r["guia_despacho"],
      guia_devolucion: r["guia_devolucion"],
      cliente: r["cliente"],
      codigoCliente: r["codigoCliente"],
      caso: r["caso"],
      observacion: r["observacion"],
      tecnicos: r["tecnicos"],
      pri_tec: r["pri_tec"],
      tec_liq: r["tec_liq"],
      inv: r["inv"],
    };

    const SN = String(raw.SN ?? "").trim().toUpperCase();
    if (!SN) {
      invalidas++;
      continue;
    }
    if (firstBySN.has(SN)) {
      duplicadosInternosExcel++;
      continue;
    }

    const equipo = normalizeEquipo(raw.equipo);
    const descripcion = String(raw.descripcion ?? "").trim();
    if (!equipo || !descripcion) {
      invalidas++;
      continue;
    }

    const loc = normalizeUbicacion(raw.ubicacion);
    if (loc.invalid) ubicacionesInvalidas++;

    const dIng = toDatePartsLima(parseExcelDateToDate(raw.f_ingreso));
    const dDes = toDatePartsLima(parseExcelDateToDate(raw.f_despacho));
    const dDev = toDatePartsLima(parseExcelDateToDate(raw.f_devolucion));
    const dIns = toDatePartsLima(parseExcelDateToDate(raw.f_instalado));

    const proIdRaw = String(raw.proId ?? "").trim();
    const proId = equipo === "ONT" ? (proIdRaw || null) : undefined;

    const toS = (v: any) => String(v ?? "").trim();
    const tecnicosCsv = String(raw.tecnicos ?? "");
    const tecnicos = tecnicosCsv
      ? tecnicosCsv
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const doc: NormalizedImportRow = {
      SN,
      equipo,
      descripcion,
      proId,
      ubicacion: loc.ubicacion,
      estado: loc.estado,
      f_ingresoYmd: dIng.ymd,
      f_ingresoHm: dIng.hm,
      f_despachoYmd: dDes.ymd,
      f_despachoHm: dDes.hm,
      f_devolucionYmd: dDev.ymd,
      f_devolucionHm: dDev.hm,
      f_instaladoYmd: dIns.ymd,
      f_instaladoHm: dIns.hm,
      guia_ingreso: toS(raw.guia_ingreso),
      guia_despacho: toS(raw.guia_despacho),
      guia_devolucion: toS(raw.guia_devolucion),
      cliente: toS(raw.cliente),
      codigoCliente: toS(raw.codigoCliente),
      caso: toS(raw.caso),
      observacion: toS(raw.observacion),
      tecnicos,
      pri_tec: normalizeYesNo(raw.pri_tec),
      tec_liq: normalizeYesNo(raw.tec_liq),
      inv: normalizeYesNo(raw.inv),
    };

    firstBySN.add(SN);
    candidates.set(SN, { SN, equipo, doc });
  }

  const sns = Array.from(candidates.keys());
  const existing = await getExistingSNs(sns);
  const duplicadosBD: { SN: string; equipo?: string; descripcion?: string; ubicacion?: string }[] = [];

  existing.forEach((id) => {
    const candidate = candidates.get(id);
    duplicadosBD.push({
      SN: id,
      equipo: candidate?.equipo,
      descripcion: candidate?.doc.descripcion,
      ubicacion: candidate?.doc.ubicacion,
    });
    candidates.delete(id);
  });

  const nuevosItems = Array.from(candidates.values());
  const conteoPorEquipo: Record<string, number> = { ONT: 0, MESH: 0, FONO: 0, BOX: 0 };
  for (const item of nuevosItems) {
    conteoPorEquipo[item.equipo]++;
  }

  return { duplicadosInternosExcel, invalidas, ubicacionesInvalidas, duplicadosBD, nuevosItems, conteoPorEquipo };
}

export async function parseEquiposAction(arg1: any, arg2?: any): Promise<ParseOk | ImportFail> {
  await requireServerPermission(PERM);
  const formData = resolveFormData(arg1, arg2);
  try {
    const file = formData.get("file");
    if (!file || typeof file === "string") return { ok: false, error: { formErrors: ["FILE_REQUIRED"] } };
    const arrayBuf = await (file as File).arrayBuffer();
    const { duplicadosInternosExcel, invalidas, ubicacionesInvalidas, duplicadosBD, nuevosItems, conteoPorEquipo } =
      await parseArrayBuffer(arrayBuf);

    return {
      ok: true,
      data: {
        fileFingerprint: fileFingerprintFromFormData(formData),
        nuevos: nuevosItems.map((x) => ({
          SN: x.SN,
          equipo: x.equipo,
          descripcion: x.doc.descripcion,
          ubicacion: x.doc.ubicacion,
          estado: x.doc.estado,
        })),
        duplicadosBD,
        duplicadosInternosExcel,
        invalidas,
        ubicacionesInvalidas,
        conteoPorEquipo,
        totalNuevos: nuevosItems.length,
        importRows: nuevosItems.map((x) => x.doc),
      },
    };
  } catch (e: any) {
    const code = String(e?.message ?? "ERROR");
    if (code === "UNAUTHENTICATED" || code === "ACCESS_DISABLED" || code === "FORBIDDEN") {
      return { ok: false, error: { formErrors: [code] } };
    }
    if (code === "INVALID_FORMDATA" || code === "INVALID_HEADERS" || code === "SHEET_NOT_FOUND" || code === "FILE_REQUIRED") {
      return { ok: false, error: { formErrors: [code] } };
    }
    return { ok: false, error: { formErrors: [code] } };
  }
}

export async function saveEquiposChunkAction(formData: FormData): Promise<SaveChunkOk | ImportFail> {
  const session = await requireServerPermission(PERM);
  try {
    const rowsJson = formData.get("rows");
    if (typeof rowsJson !== "string") return { ok: false, error: { formErrors: ["INVALID_FORMDATA"] } };
    const rows = JSON.parse(rowsJson) as NormalizedImportRow[];
    if (!Array.isArray(rows)) return { ok: false, error: { formErrors: ["INVALID_FORMDATA"] } };

    let created = 0;
    let alreadyExists = 0;

    for (const row of rows) {
      const result = await createEquipo(normalizedRowToDoc(row), session.uid);
      if (result === "created") created++;
      else alreadyExists++;
    }

    return {
      ok: true,
      data: {
        requested: rows.length,
        created,
        alreadyExists,
      },
    };
  } catch (e: any) {
    const code = String(e?.message ?? "ERROR");
    if (code === "UNAUTHENTICATED" || code === "ACCESS_DISABLED" || code === "FORBIDDEN") {
      return { ok: false, error: { formErrors: [code] } };
    }
    if (code === "INVALID_FORMDATA") {
      return { ok: false, error: { formErrors: [code] } };
    }
    return { ok: false, error: { formErrors: [code] } };
  }
}

export async function notifyEquiposImportAction(summary: { totalGuardados: number; duplicados: number; yaExistian?: number }) {
  const session = await requireServerPermission(PERM);
  const createdPart = `Nuevos: ${summary.totalGuardados}`;
  const duplicatesPart = `Duplicados iniciales: ${summary.duplicados}`;
  const alreadyExistsPart = `Ya existentes al guardar: ${summary.yaExistian ?? 0}`;

  await addGlobalNotification({
    title: "Equipos importados",
    message: `${createdPart}, ${duplicatesPart}, ${alreadyExistsPart}`,
    type: "success",
    scope: "ALL",
    createdBy: session.uid,
    entityType: "EQUIPOS",
    entityId: `import:${Date.now()}`,
    action: "CREATE",
    estado: "ACTIVO",
  });
  revalidatePath("/home/equipos/import");
  revalidatePath("/home");
}
