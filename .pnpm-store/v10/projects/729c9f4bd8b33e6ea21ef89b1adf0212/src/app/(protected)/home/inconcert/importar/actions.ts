"use server";

import * as XLSX from "xlsx";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

import { requireServerPermission } from "@/core/auth/require";
import { adminDb } from "@/lib/firebase/admin";
import { addGlobalNotification } from "@/domain/notificaciones/service";

import { hasMinimumData, mapCsvRow, normalizePhone } from "./csvMapping";

const PERM = "INCONCERT_IMPORT";

type ImportResult =
  | {
      ok: true;
      resumen: { nuevos: number; existentes: number; batches: number };
    }
  | {
      ok: false;
      error: { formErrors: string[] };
    };

function resolveFormData(a: any, b?: any): FormData {
  if (a && typeof a.get === "function" && !b) return a as FormData;
  if (b && typeof b.get === "function") return b as FormData;
  throw new Error("INVALID_FORMDATA");
}

function asRows(sheet: XLSX.WorkSheet): Record<string, unknown>[] {
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
}

async function actorDisplay(uid: string) {
  try {
    const s = await adminDb().collection("usuarios").doc(uid).get();
    const x = s.data() as any;
    const nombres = String(x?.nombres || "").trim();
    if (nombres) return nombres.split(/\s+/)[0].toUpperCase();
  } catch {}
  return uid.toUpperCase();
}

export async function importInconcertAction(arg1: any, arg2?: any): Promise<ImportResult> {
  let session: any;
  try {
    session = await requireServerPermission(PERM);
  } catch (e: any) {
    return { ok: false, error: { formErrors: [String(e?.message || "FORBIDDEN")] } };
  }

  try {
    const formData = resolveFormData(arg1, arg2);
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return { ok: false, error: { formErrors: ["FILE_REQUIRED"] } };
    }

    const arrayBuf = await (file as File).arrayBuffer();
    const wb = XLSX.read(arrayBuf, { type: "array", cellDates: false, raw: false });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return { ok: false, error: { formErrors: ["SHEET_NOT_FOUND"] } };

    const rawRows = asRows(sheet).filter(hasMinimumData);
    if (!rawRows.length) {
      return { ok: false, error: { formErrors: ["CSV_VACIO"] } };
    }

    const mappedRows = rawRows.map(mapCsvRow);
    const ids = Array.from(
      new Set(mappedRows.map((r) => String(r._idConversacion || "").trim()).filter(Boolean))
    );

    const existentes = new Set<string>();
    const colRef = adminDb().collection("inconcert");
    for (let i = 0; i < ids.length; i += 30) {
      const chunk = ids.slice(i, i + 30);
      const snap = await colRef.where("_idConversacion", "in", chunk).get();
      snap.forEach((d) => {
        const idc = String((d.data() as any)?._idConversacion || "").trim();
        if (idc) existentes.add(idc);
      });
    }

    let nuevos = 0;
    let omitidos = 0;
    let batches = 0;
    let ops = 0;
    let batch = adminDb().batch();

    for (let i = 0; i < mappedRows.length; i++) {
      const mapped = mappedRows[i];
      const raw = rawRows[i] || {};
      const idc = String(mapped._idConversacion || "").trim() || null;

      if (idc && existentes.has(idc)) {
        omitidos++;
        continue;
      }

      const payload = {
        ...mapped,
        _idConversacion: idc,
        _agenteCrudo: String(raw["Agente"] || "").trim() || null,
        _dirCrudo: String(raw["Dir."] || "").trim() || null,
        _telNorm: normalizePhone(mapped.telefonoCliente),
        _fuente: "CSV InConcert",
        _importadoPor: session.uid,
        _importadoEn: FieldValue.serverTimestamp(),
      };

      const ref = idc ? colRef.doc(idc) : colRef.doc();
      batch.set(ref, payload, { merge: true });
      nuevos++;
      ops++;

      if (ops >= 450) {
        await batch.commit();
        batches++;
        batch = adminDb().batch();
        ops = 0;
      }
    }

    if (ops > 0) {
      await batch.commit();
      batches++;
    }

    try {
      const actor = await actorDisplay(session.uid);
      await addGlobalNotification({
        title: "Importacion InConcert",
        message: `${actor} importó INCONCERT. Nuevos: ${nuevos}, Omitidos: ${omitidos}`,
        type: "success",
        scope: "ALL",
        createdBy: session.uid,
        entityType: "INCONCERT",
        entityId: `import:${Date.now()}`,
        action: "CREATE",
        estado: "ACTIVO",
      });
    } catch {}

    revalidatePath("/home/inconcert/importar");
    revalidatePath("/home/inconcert/gerencia");

    return { ok: true, resumen: { nuevos, existentes: omitidos, batches } };
  } catch (e: any) {
    return { ok: false, error: { formErrors: [String(e?.message || "ERROR")] } };
  }
}
