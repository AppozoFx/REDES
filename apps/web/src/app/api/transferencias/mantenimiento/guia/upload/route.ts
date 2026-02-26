import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { adminStorageBucket } from "@/lib/firebase/admin";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const guiaId = searchParams.get("guiaId");
    const tipoRaw = String(searchParams.get("tipo") || "despacho").toLowerCase();
    const tipo = ["despacho", "devolucion", "ventas", "actas", "tecnicos-materiales", "reposicion"].includes(tipoRaw) ? tipoRaw : "despacho";
    const tokenParam = searchParams.get("token") || "";
    if (!guiaId) return NextResponse.json({ ok: false, error: "MISSING_GUIA_ID" }, { status: 400 });

    const buf = Buffer.from(await req.arrayBuffer());
    if (!buf.length) return NextResponse.json({ ok: false, error: "EMPTY_BODY" }, { status: 400 });

    const bucket = adminStorageBucket();
    const path = `guias/mantenimiento/${tipo}/${guiaId}.pdf`;
    const file = bucket.file(path);
    const token = tokenParam || randomUUID();
    await file.save(buf, {
      contentType: "application/pdf",
      metadata: {
        metadata: {
          uploadedBy: session.uid,
          firebaseStorageDownloadTokens: token,
        },
      },
    });

    const encodedPath = encodeURIComponent(path);
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`;
    return NextResponse.json({ ok: true, path, bucket: bucket.name, url });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}

