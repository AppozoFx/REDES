import { NextResponse } from "next/server";

import { getServerSession } from "@/core/auth/session";
import { parseProviderWorkbook } from "@/core/garantias/cruceProveedor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERM_VIEW = "ORDENES_GARANTIAS_VIEW";
const PERM_EDIT = "ORDENES_GARANTIAS_EDIT";

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }

    const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
    const canEdit =
      session.isAdmin ||
      roles.includes("GERENCIA") ||
      roles.includes("SUPERVISOR") ||
      session.permissions.includes(PERM_EDIT);
    const canView = canEdit || session.permissions.includes(PERM_VIEW);
    if (!canView) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ ok: false, error: "FILE_REQUIRED" }, { status: 400 });
    }
    const upload = file as File;
    if (!/\.xlsx$/i.test(upload.name || "")) {
      return NextResponse.json({ ok: false, error: "XLSX_REQUIRED" }, { status: 400 });
    }

    const arrayBuffer = await upload.arrayBuffer();
    const parsed = parseProviderWorkbook(arrayBuffer);

    // Muestra hasta 8 filas de ejemplo por mes para la revisión previa
    const sampleByMonth: Record<string, Array<{ codPedido: string; nombre: string; fechaInstalacionYmd: string; fechaAtencionYmd: string; cuadrilla: string; diasDesdeInstalacion: number | null }>> = {};
    for (const row of parsed.rows) {
      const ym = row.fechaInstalacionYmd.slice(0, 7);
      if (!sampleByMonth[ym]) sampleByMonth[ym] = [];
      if (sampleByMonth[ym].length < 8) {
        sampleByMonth[ym].push({
          codPedido: row.codPedido,
          nombre: row.nombre,
          fechaInstalacionYmd: row.fechaInstalacionYmd,
          fechaAtencionYmd: row.fechaAtencionYmd,
          cuadrilla: row.cuadrilla,
          diasDesdeInstalacion: row.diasDesdeInstalacion,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      fileName: upload.name,
      fileSize: upload.size,
      sheetName: parsed.sheetName,
      totalRows: parsed.totalRows,
      validRows: parsed.validRows,
      omittedRows: parsed.omittedRows,
      omittedByReason: parsed.omittedByReason,
      months: parsed.months,
      sampleByMonth,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
