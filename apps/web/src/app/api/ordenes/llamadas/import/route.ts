import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

const HEADERS = new Set([
  "ordenId",
  "telefono",
  "estadoLlamada",
  "horaInicioLlamada",
  "horaFinLlamada",
  "observacionLlamada",
]);

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    const canEdit = session.isAdmin || session.permissions.includes("ORDENES_LLAMADAS_EDIT");
    if (!canEdit) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ ok: false, error: "FILE_REQUIRED" }, { status: 400 });
    }

    const buf = await (file as File).arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) {
      return NextResponse.json({ ok: false, error: "SHEET_NOT_FOUND" }, { status: 400 });
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
    const headers = Object.keys(rows[0] || {});
    const hasValidHeader = headers.some((h) => HEADERS.has(String(h).trim()));
    if (!hasValidHeader) {
      return NextResponse.json({ ok: false, error: "INVALID_HEADERS" }, { status: 400 });
    }

    let updated = 0;
    let notFound = 0;
    let invalid = 0;
    const errors: Array<{ row: number; error: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {};
      const ordenId = String(r.ordenId || r.ordenID || "").trim();
      if (!ordenId) {
        invalid++;
        errors.push({ row: i + 2, error: "ORDEN_ID_REQUIRED" });
        continue;
      }

      const docRef = adminDb().collection("ordenes").doc(ordenId);
      const snap = await docRef.get();
      if (!snap.exists) {
        notFound++;
        continue;
      }

      const payload: Record<string, any> = {};
      if (r.telefono !== undefined) payload.telefono = String(r.telefono || "").trim();
      if (r.horaInicioLlamada !== undefined) payload.horaInicioLlamada = String(r.horaInicioLlamada || "").trim();
      if (r.horaFinLlamada !== undefined) payload.horaFinLlamada = String(r.horaFinLlamada || "").trim();
      if (r.estadoLlamada !== undefined) {
        let est = String(r.estadoLlamada || "").trim();
        if (est === "-" || est === "\u2014") est = "";
        const allowed = new Set(["Contesto", "No Contesto", "No se Registro"]);
        if (est && !allowed.has(est)) {
          invalid++;
          errors.push({ row: i + 2, error: "ESTADO_LLAMADA_INVALIDO" });
          continue;
        }
        payload.estadoLlamada = est;
      }
      if (r.observacionLlamada !== undefined) payload.observacionLlamada = String(r.observacionLlamada || "").trim();

      await docRef.set(payload, { merge: true });
      updated++;
    }

    return NextResponse.json({
      ok: true,
      updated,
      notFound,
      invalid,
      errors: errors.slice(0, 50),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
