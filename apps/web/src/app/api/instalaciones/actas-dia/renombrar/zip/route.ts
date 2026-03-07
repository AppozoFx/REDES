import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { requireAreaScope } from "@/core/auth/apiGuards";
import { adminStorageBucket } from "@/lib/firebase/admin";

export const runtime = "nodejs";

const ROOT_PREFIX = "guias_actas/actas_servicio";

function normalizeDateFolder(raw: string) {
  const v = String(raw || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
}

function sanitizeFileName(name: string) {
  return String(name || "archivo.pdf")
    .replace(/[\r\n"]/g, "_")
    .replace(/[\/\\:*?<>|]/g, "_")
    .trim();
}

function formatDateDdMmYyyy(ymd: string) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function uniqueName(name: string, used: Set<string>) {
  const safe = sanitizeFileName(name) || "archivo.pdf";
  if (!used.has(safe)) {
    used.add(safe);
    return safe;
  }
  const dot = safe.lastIndexOf(".");
  const base = dot > 0 ? safe.slice(0, dot) : safe;
  const ext = dot > 0 ? safe.slice(dot) : "";
  let idx = 1;
  while (true) {
    const candidate = `${base} (${idx})${ext}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
    idx += 1;
  }
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession({ forceAccessRefresh: true });
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    requireAreaScope(session, ["INSTALACIONES"]);

    const { searchParams } = new URL(req.url);
    const dateFolder = normalizeDateFolder(String(searchParams.get("dateFolder") || ""));
    if (!dateFolder) return NextResponse.json({ ok: false, error: "DATE_REQUIRED_YYYY_MM_DD" }, { status: 400 });

    const bucket = adminStorageBucket();
    const prefix = `${ROOT_PREFIX}/ok/${dateFolder}/`;
    const [files] = await bucket.getFiles({ prefix });
    const pdfFiles = files.filter((f: any) => String(f.name || "").toLowerCase().endsWith(".pdf"));
    if (!pdfFiles.length) {
      return NextResponse.json({ ok: false, error: "NO_OK_FILES_FOR_DATE" }, { status: 404 });
    }

    // fflate esta disponible en el workspace (usado en runtime sin agregar dependencia nueva).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { zipSync } = require("fflate") as { zipSync: (data: Record<string, Uint8Array>) => Uint8Array };

    const entries: Record<string, Uint8Array> = {};
    const usedNames = new Set<string>();
    for (const f of pdfFiles) {
      const [buf] = await f.download();
      const original = String(f.name || "").split("/").pop() || "archivo.pdf";
      const entryName = uniqueName(original, usedNames);
      entries[entryName] = new Uint8Array(buf);
    }

    const zipBody = Buffer.from(zipSync(entries));
    const zipName = `${formatDateDdMmYyyy(dateFolder)}.zip`;

    return new NextResponse(zipBody, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipName}"`,
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
