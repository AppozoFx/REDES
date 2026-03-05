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
  toDatePartsLima,
} from "@/domain/equipos/repo";

const PERM = "EQUIPOS_IMPORT";

type ImportFail = { ok: false; error: { formErrors: string[] } };

type ParseOk = {
  ok: true;
  data: {
    nuevos: { SN: string; equipo: string; descripcion: string; ubicacion: string; estado: string }[];
    duplicadosBD: { SN: string; equipo?: string; descripcion?: string; ubicacion?: string }[];
    duplicadosInternosExcel: number;
    invalidas: number;
    ubicacionesInvalidas: number;
    conteoPorEquipo: Record<string, number>;
    totalNuevos: number;
  };
};

type SaveOk = {
  ok: true;
  data: {
    nuevos: number;
    duplicadosBD: { SN: string; equipo?: string; descripcion?: string; ubicacion?: string }[];
    duplicadosInternosExcel: number;
    invalidas: number;
    ubicacionesInvalidas: number;
    conteoPorEquipo: Record<string, number>;
    totalGuardados: number;
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
  if (t === "ONT" || t === "MESH" || t === "FONO" || t === "BOX") return t as any;
  return null;
}

function normalizeYesNo(v: any): "SI" | "NO" {
  const s = String(v ?? "").trim().toUpperCase();
  return s === "SI" ? "SI" : "NO";
}

async function parseArrayBuffer(arrayBuf: ArrayBuffer): Promise<{
  duplicadosInternosExcel: number;
  invalidas: number;
  ubicacionesInvalidas: number;
  duplicadosBD: { SN: string; equipo?: string; descripcion?: string; ubicacion?: string }[];
  nuevosItems: { SN: string; equipo: string; doc: Partial<EquipoDoc> }[];
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
  const candidates: Map<string, { SN: string; equipo: string; doc: any }> = new Map();

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
    const proId = equipo === "ONT" ? (proIdRaw ? proIdRaw : null) : undefined;

    const toS = (v: any) => String(v ?? "").trim();
    const guia_ingreso = toS(raw.guia_ingreso);
    const guia_despacho = toS(raw.guia_despacho);
    const guia_devolucion = toS(raw.guia_devolucion);
    const cliente = toS(raw.cliente);
    const codigoCliente = toS(raw.codigoCliente);
    const caso = toS(raw.caso);
    const observacion = toS(raw.observacion);

    const tecnicosCsv = String(raw.tecnicos ?? "");
    const tecnicos = tecnicosCsv
      ? tecnicosCsv
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const pri_tec = normalizeYesNo(raw.pri_tec);
    const tec_liq = normalizeYesNo(raw.tec_liq);
    const inv = normalizeYesNo(raw.inv);

    const doc: Partial<EquipoDoc> = {
      SN,
      equipo,
      descripcion,
      proId,
      ubicacion: loc.ubicacion,
      estado: loc.estado,

      f_ingresoAt: dIng.at,
      f_ingresoYmd: dIng.ymd,
      f_ingresoHm: dIng.hm,

      f_despachoAt: dDes.at,
      f_despachoYmd: dDes.ymd,
      f_despachoHm: dDes.hm,

      f_devolucionAt: dDev.at,
      f_devolucionYmd: dDev.ymd,
      f_devolucionHm: dDev.hm,

      f_instaladoAt: dIns.at,
      f_instaladoYmd: dIns.ymd,
      f_instaladoHm: dIns.hm,

      guia_ingreso,
      guia_despacho,
      guia_devolucion,
      cliente,
      codigoCliente,
      caso,
      observacion,
      tecnicos,

      pri_tec,
      tec_liq,
      inv,
    } as any;

    firstBySN.add(SN);
    candidates.set(SN, { SN, equipo, doc });
  }

  const sns = Array.from(candidates.keys());
  const existing = await getExistingSNs(sns);
  const duplicadosBD: { SN: string; equipo?: string; descripcion?: string; ubicacion?: string }[] = [];

  existing.forEach((id) => {
    const c = candidates.get(id);
    duplicadosBD.push({ SN: id, equipo: c?.equipo, descripcion: (c?.doc as any)?.descripcion, ubicacion: (c?.doc as any)?.ubicacion });
    candidates.delete(id);
  });

  const nuevosItems = Array.from(candidates.values());
  const conteoPorEquipo: Record<string, number> = { ONT: 0, MESH: 0, FONO: 0, BOX: 0 } as any;
  for (const item of nuevosItems) {
    if (item.equipo && conteoPorEquipo[item.equipo] !== undefined) conteoPorEquipo[item.equipo]++;
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
        nuevos: nuevosItems.map((x) => ({
          SN: x.SN,
          equipo: x.equipo,
          descripcion: (x.doc as any)?.descripcion ?? "",
          ubicacion: (x.doc as any)?.ubicacion ?? "",
          estado: (x.doc as any)?.estado ?? "",
        })),
        duplicadosBD,
        duplicadosInternosExcel,
        invalidas,
        ubicacionesInvalidas,
        conteoPorEquipo,
        totalNuevos: nuevosItems.length,
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

export async function saveEquiposAction(arg1: any, arg2?: any): Promise<SaveOk | ImportFail> {
  const session = await requireServerPermission(PERM);
  const formData = resolveFormData(arg1, arg2);
  try {
    const file = formData.get("file");
    if (!file || typeof file === "string") return { ok: false, error: { formErrors: ["FILE_REQUIRED"] } };
    const arrayBuf = await (file as File).arrayBuffer();

    const { duplicadosInternosExcel, invalidas, ubicacionesInvalidas, duplicadosBD, nuevosItems, conteoPorEquipo } =
      await parseArrayBuffer(arrayBuf);

    let saved = 0;
    for (const item of nuevosItems) {
      await createEquipo(item.doc as any, session.uid);
      saved++;
    }

    await addGlobalNotification({
      title: "Equipos importados",
      message: `Nuevos: ${saved}, Duplicados: ${duplicadosBD.length}`,
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

    return {
      ok: true,
      data: {
        nuevos: nuevosItems.length,
        duplicadosBD,
        duplicadosInternosExcel,
        invalidas,
        ubicacionesInvalidas,
        conteoPorEquipo,
        totalGuardados: saved,
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

export async function saveEquiposChunkAction(formData: FormData): Promise<{ ok: true; saved: number } | ImportFail> {
  const session = await requireServerPermission(PERM);
  try {
    const file = formData.get("file");
    const snsJson = formData.get("sns");
    if (!file || typeof file === "string") return { ok: false, error: { formErrors: ["FILE_REQUIRED"] } };
    if (typeof snsJson !== "string") return { ok: false, error: { formErrors: ["INVALID_FORMDATA"] } };
    const sns: string[] = (JSON.parse(snsJson) as any[])
      .map((v) => String(v ?? "").trim().toUpperCase())
      .filter(Boolean);
    const arrayBuf = await (file as File).arrayBuffer();
    const { nuevosItems } = await (async () => {
      const wb = XLSX.read(arrayBuf, { type: "array", cellDates: true });
      const sheet = wb.Sheets["Hoja de Datos"] ?? wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error("SHEET_NOT_FOUND");
      const rowsRaw: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const firstBySN = new Set<string>();
      const candidates: Map<string, { SN: string; equipo: string; doc: any }> = new Map();
      for (const r of rowsRaw) {
        const SN = String(r["SN"] ?? "").trim().toUpperCase();
        if (!SN) continue;
        if (firstBySN.has(SN)) continue;
        const equipo = normalizeEquipo(r["equipo"]);
        const descripcion = String(r["descripcion"] ?? "").trim();
        if (!equipo || !descripcion) continue;
        const loc = normalizeUbicacion(r["ubicacion"]);
        const dIng = toDatePartsLima(parseExcelDateToDate(r["f_ingreso"]));
        const dDes = toDatePartsLima(parseExcelDateToDate(r["f_despacho"]));
        const dDev = toDatePartsLima(parseExcelDateToDate(r["f_devolucion"]));
        const dIns = toDatePartsLima(parseExcelDateToDate(r["f_instalado"]));
        const proIdRaw = String(r["proId"] ?? "").trim();
        const proId = equipo === "ONT" ? (proIdRaw ? proIdRaw : null) : undefined;
        const toS = (v: any) => String(v ?? "").trim();
        const tecnicosCsv = String(r["tecnicos"] ?? "");
        const tecnicos = tecnicosCsv ? tecnicosCsv.split(",").map((s) => s.trim()).filter(Boolean) : [];
        const pri_tec = normalizeYesNo(r["pri_tec"]);
        const tec_liq = normalizeYesNo(r["tec_liq"]);
        const inv = normalizeYesNo(r["inv"]);
        const doc: Partial<EquipoDoc> = {
          SN,
          equipo,
          descripcion,
          proId,
          ubicacion: loc.ubicacion,
          estado: loc.estado,
          f_ingresoAt: dIng.at,
          f_ingresoYmd: dIng.ymd,
          f_ingresoHm: dIng.hm,
          f_despachoAt: dDes.at,
          f_despachoYmd: dDes.ymd,
          f_despachoHm: dDes.hm,
          f_devolucionAt: dDev.at,
          f_devolucionYmd: dDev.ymd,
          f_devolucionHm: dDev.hm,
          f_instaladoAt: dIns.at,
          f_instaladoYmd: dIns.ymd,
          f_instaladoHm: dIns.hm,
          guia_ingreso: toS(r["guia_ingreso"]),
          guia_despacho: toS(r["guia_despacho"]),
          guia_devolucion: toS(r["guia_devolucion"]),
          cliente: toS(r["cliente"]),
          codigoCliente: toS(r["codigoCliente"]),
          caso: toS(r["caso"]),
          observacion: toS(r["observacion"]),
          tecnicos,
          pri_tec,
          tec_liq,
          inv,
        } as any;
        firstBySN.add(SN);
        candidates.set(SN, { SN, equipo, doc });
      }
      return { nuevosItems: Array.from(candidates.values()) };
    })();

    let saved = 0;
    // Save only requested SNs (intersection)
    for (const sn of sns) {
      const item = nuevosItems.find((x) => x.SN === sn);
      if (!item) continue;
      await createEquipo(item.doc as any, session.uid);
      saved++;
    }
    return { ok: true, saved };
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

export async function notifyEquiposImportAction(summary: { totalGuardados: number; duplicados: number }) {
  const session = await requireServerPermission(PERM);
  await addGlobalNotification({
    title: "Equipos importados",
    message: `Nuevos: ${summary.totalGuardados}, Duplicados: ${summary.duplicados}`,
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
// Backward-compat alias (if any consumer expects this name)
export const importEquiposAction = saveEquiposAction;
