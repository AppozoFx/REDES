import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { requireAreaScope } from "@/core/auth/apiGuards";
import { adminStorageBucket } from "@/lib/firebase/admin";

export const runtime = "nodejs";

const ROOT_PREFIX = "guias_actas/actas_servicio";

function normalizeDateFolder(raw: string) {
  const v = String(raw || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeDateFolderString(raw: string) {
  const v = String(raw || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
}

async function requireSession() {
  const session = await getServerSession({ forceAccessRefresh: true });
  if (!session) throw new Error("UNAUTHENTICATED");
  requireAreaScope(session, ["INSTALACIONES"]);
}

export async function POST(req: Request) {
  try {
    await requireSession();
    const body = await req.json().catch(() => ({}));
    const mode = String(body?.mode || "older_than").trim().toLowerCase();
    const bucket = adminStorageBucket();
    let deleted = 0;
    let scanned = 0;
    const prefixes = ["inbox", "ok", "error"] as const;

    if (mode === "day") {
      const dateFolder = normalizeDateFolderString(body?.dateFolder);
      if (!dateFolder) {
        return NextResponse.json({ ok: false, error: "DATE_REQUIRED_YYYY_MM_DD" }, { status: 400 });
      }
      for (const folder of prefixes) {
        const [files] = await bucket.getFiles({ prefix: `${ROOT_PREFIX}/${folder}/${dateFolder}/` });
        for (const file of files) {
          scanned += 1;
          await file.delete({ ignoreNotFound: true });
          deleted += 1;
        }
      }
      return NextResponse.json({
        ok: true,
        mode: "day",
        dateFolder,
        scanned,
        deleted,
      });
    }

    const maxAgeDays = Math.max(1, Math.min(60, Number(body?.maxAgeDays || 7)));
    const cutoff = new Date();
    cutoff.setUTCHours(0, 0, 0, 0);
    cutoff.setUTCDate(cutoff.getUTCDate() - maxAgeDays);

    for (const folder of prefixes) {
      const [files] = await bucket.getFiles({ prefix: `${ROOT_PREFIX}/${folder}/` });
      for (const file of files) {
        const path = String(file.name || "");
        const parts = path.split("/").filter(Boolean);
        const dateFolder = parts[3] || "";
        const folderDate = normalizeDateFolder(dateFolder);
        if (!folderDate) continue;
        scanned += 1;
        if (folderDate < cutoff) {
          await file.delete({ ignoreNotFound: true });
          deleted += 1;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      mode: "older_than",
      maxAgeDays,
      scanned,
      deleted,
      cutoffYmd: cutoff.toISOString().slice(0, 10),
    });
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (msg === "ACCESS_DISABLED") return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    if (msg === "AREA_FORBIDDEN" || msg === "FORBIDDEN") return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
