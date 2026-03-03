import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { adminStorageBucket } from "@/lib/firebase/admin";
import { requireAreaScope, requirePermission } from "@/core/auth/apiGuards";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await getServerSession({ forceAccessRefresh: true });
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (!session.isAdmin) {
      const transferPerms = [
        "EQUIPOS_DESPACHO",
        "EQUIPOS_DEVOLUCION",
        "MATERIALES_TRANSFER_SERVICIO",
        "MATERIALES_DEVOLUCION",
        "ORDENES_LIQUIDAR",
      ];
      let hasPermission = false;
      for (const perm of transferPerms) {
        try {
          requirePermission(session, perm);
          hasPermission = true;
          break;
        } catch {}
      }
      if (!hasPermission) throw new Error("FORBIDDEN");
      requireAreaScope(session, ["INSTALACIONES", "MANTENIMIENTO"]);
    }

    const { searchParams } = new URL(req.url);
    const guiaId = searchParams.get("guiaId");
    if (!guiaId) return NextResponse.json({ ok: false, error: "MISSING_GUIA_ID" }, { status: 400 });
    const tipoRaw = String(searchParams.get("tipo") || "despacho").toLowerCase();
    const tipo = ["despacho", "devolucion", "ventas", "actas", "tecnicos-materiales", "reposicion"].includes(tipoRaw) ? tipoRaw : "despacho";

    const bucket = adminStorageBucket();
    const path = `guias/mantenimiento/${tipo}/${guiaId}.pdf`;
    const file = bucket.file(path);
    const [exists] = await file.exists();
    if (!exists) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });

    const [meta] = await file.getMetadata();
    const token = meta?.metadata?.firebaseStorageDownloadTokens;
    if (!token) return NextResponse.json({ ok: false, error: "MISSING_TOKEN" }, { status: 404 });

    const encodedPath = encodeURIComponent(path);
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`;
    return NextResponse.json({ ok: true, url });
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (msg === "ACCESS_DISABLED") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    if (msg === "FORBIDDEN" || msg === "AREA_FORBIDDEN") {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}

