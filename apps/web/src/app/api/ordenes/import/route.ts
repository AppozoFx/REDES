import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getServerSession } from "@/core/auth/session";
import { upsertOrden } from "@/domain/ordenes/repo";
import { addGlobalNotification } from "@/domain/notificaciones/service";

export const runtime = "nodejs";

function getDateOrNull(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  return null;
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

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    const allowed = session.isAdmin || session.permissions.includes("ORDENES_IMPORT");
    if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    const actorUid = session.uid;

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ ok: false, error: "FILE_REQUIRED" }, { status: 400 });
    }

    const arrayBuf = await (file as File).arrayBuffer();
    const wb = XLSX.read(arrayBuf, { type: "array", cellDates: true });
    const sheet = wb.Sheets["Hoja de Datos"] ?? wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return NextResponse.json({ ok: false, error: "SHEET_NOT_FOUND" }, { status: 400 });

    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", range: 7 });
    const payloads: OrdenImportInput[] = [];

    for (const row of rows) {
      if (!row || row.length < 1) continue;
      const ordenId = String(row[0] ?? "").trim();
      if (!ordenId) continue;

      payloads.push({
        ordenId,
        tipoOrden: String(row[1] ?? "").trim() || undefined,
        tipoTraba: String(row[2] ?? "").trim() || undefined,
        fSoli: getDateOrNull(row[3]),
        cliente: String(row[4] ?? "").trim() || undefined,
        tipo: String(row[5] ?? "").trim() || undefined,
        tipoClienId: String(row[6] ?? "").trim() || undefined,
        cuadrilla: String(row[7] ?? "").trim() || undefined,
        estado: String(row[8] ?? "").trim() || undefined,
        direccion: String(row[9] ?? "").trim() || undefined,
        direccion1: String(row[10] ?? "").trim() || undefined,
        idenServi: String(row[11] ?? "").trim() || undefined,
        region: String(row[12] ?? "").trim() || undefined,
        zonaDistrito: String(row[13] ?? "").trim() || undefined,
        codiSeguiClien: String(row[14] ?? "").trim() || undefined,
        numeroDocumento: String(row[15] ?? "").trim() || undefined,
        telefono: String(row[16] ?? "").trim() || undefined,
        fechaFinVisi: getDateOrNull(row[17]),
        fechaIniVisi: getDateOrNull(row[18]),
        motivoCancelacion: String(row[19] ?? "").trim() || undefined,
        georeferencia: String(row[20] ?? "").trim() || undefined,
      });
    }

    let nuevos = 0;
    let actualizados = 0;
    let duplicadosSinCambios = 0;
    let cursor = 0;
    let workerError: any = null;
    const concurrency = Math.min(16, Math.max(1, payloads.length));

    async function worker() {
      while (true) {
        if (workerError) return;
        const idx = cursor++;
        if (idx >= payloads.length) return;
        try {
          const res = await upsertOrden(payloads[idx], actorUid);
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
    if (workerError) throw workerError;

    await addGlobalNotification({
      title: "Importacion de Ordenes",
      message: `nuevos: ${nuevos}, actualizados: ${actualizados}, duplicados: ${duplicadosSinCambios}`,
      type: "success",
      scope: "ALL",
      createdBy: actorUid,
      entityType: "ORDENES",
      entityId: `import:${Date.now()}`,
      action: "CREATE",
      estado: "ACTIVO",
    });

    return NextResponse.json({
      ok: true,
      resumen: { nuevos, actualizados, duplicadosSinCambios },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
