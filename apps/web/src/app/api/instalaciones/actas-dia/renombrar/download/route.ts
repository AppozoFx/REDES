import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { requireAreaScope } from "@/core/auth/apiGuards";
import { adminStorageBucket } from "@/lib/firebase/admin";

export const runtime = "nodejs";

const ROOT_PREFIX = "guias_actas/actas_servicio";

function isAllowedPath(path: string) {
  const clean = String(path || "").trim();
  if (!clean.startsWith(`${ROOT_PREFIX}/`)) return false;
  const parts = clean.split("/").filter(Boolean);
  if (parts.length < 5) return false;
  const folder = parts[2] || "";
  if (!["inbox", "ok", "error"].includes(folder)) return false;
  const dateFolder = parts[3] || "";
  return /^\d{4}-\d{2}-\d{2}$/.test(dateFolder);
}

function sanitizeDownloadName(name: string) {
  return String(name || "archivo.pdf").replace(/[\r\n"]/g, "_");
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession({ forceAccessRefresh: true });
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    requireAreaScope(session, ["INSTALACIONES"]);

    const { searchParams } = new URL(req.url);
    const path = String(searchParams.get("path") || "").trim();
    const mode = String(searchParams.get("mode") || "download").toLowerCase();
    if (!path || !isAllowedPath(path)) {
      return NextResponse.json({ ok: false, error: "INVALID_PATH" }, { status: 400 });
    }

    const bucket = adminStorageBucket();
    const file = bucket.file(path);
    const [exists] = await file.exists();
    if (!exists) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });

    const [buf] = await file.download();
    const fileName = sanitizeDownloadName(path.split("/").pop() || "archivo.pdf");
    const body = new Uint8Array(buf);

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          mode === "view"
            ? `inline; filename="${fileName}"`
            : `attachment; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (msg === "ACCESS_DISABLED") return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    if (msg === "AREA_FORBIDDEN" || msg === "FORBIDDEN") return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
