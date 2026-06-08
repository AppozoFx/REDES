import { NextResponse } from "next/server";

import { getServerSession } from "@/core/auth/session";
import { listProviderPeriods, saveProviderImport } from "@/core/garantias/cruceProveedor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERM_VIEW = "ORDENES_GARANTIAS_VIEW";
const PERM_EDIT = "ORDENES_GARANTIAS_EDIT";

function canViewOrEdit(session: Awaited<ReturnType<typeof getServerSession>>, mode: "view" | "edit") {
  if (!session) return false;
  const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
  const canEdit =
    session.isAdmin ||
    roles.includes("GERENCIA") ||
    roles.includes("SUPERVISOR") ||
    session.permissions.includes(PERM_EDIT);
  if (mode === "edit") return canEdit;
  return canEdit || session.permissions.includes(PERM_VIEW);
}

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    if (!canViewOrEdit(session, "view")) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    return NextResponse.json({ ok: true, periods: await listProviderPeriods() });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    if (!canViewOrEdit(session, "edit")) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

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
    const result = await saveProviderImport({
      fileName: upload.name || "garantias.xlsx",
      buffer: arrayBuffer,
      actorUid: session.uid,
    });

    return NextResponse.json({ ok: true, result, periods: await listProviderPeriods() });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
