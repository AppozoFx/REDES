import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { adminStorageBucket } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const guiaId = searchParams.get("guiaId");
    if (!guiaId) return NextResponse.json({ ok: false, error: "MISSING_GUIA_ID" }, { status: 400 });
    const tipoRaw = String(searchParams.get("tipo") || "despacho").toLowerCase();
    const tipo = ["despacho", "devolucion", "ventas", "actas"].includes(tipoRaw) ? tipoRaw : "despacho";

    const bucket = adminStorageBucket();
    const path = `guias/instalaciones/${tipo}/${guiaId}.pdf`;
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
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
