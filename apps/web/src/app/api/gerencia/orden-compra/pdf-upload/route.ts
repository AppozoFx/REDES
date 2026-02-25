import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getServerSession } from "@/core/auth/session";
import { adminDb, adminStorageBucket } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERM_GERENCIA_ORDEN_COMPRA = "GERENCIA_ORDEN_COMPRA";

function hasGerenciaOcAccess(session: NonNullable<Awaited<ReturnType<typeof getServerSession>>>) {
  const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
  return session.isAdmin || (roles.includes("GERENCIA") && session.permissions.includes(PERM_GERENCIA_ORDEN_COMPRA));
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    if (!hasGerenciaOcAccess(session)) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const ordenId = String(searchParams.get("ordenId") || "").trim();
    if (!ordenId) return NextResponse.json({ ok: false, error: "ORDEN_REQUIRED" }, { status: 400 });

    const ordenRef = adminDb().collection("ordenes_compra").doc(ordenId);
    const ordenSnap = await ordenRef.get();
    if (!ordenSnap.exists) return NextResponse.json({ ok: false, error: "ORDEN_NOT_FOUND" }, { status: 404 });

    const buf = Buffer.from(await req.arrayBuffer());
    if (!buf.length) return NextResponse.json({ ok: false, error: "EMPTY_BODY" }, { status: 400 });

    const data = ordenSnap.data() as any;
    const code = String(data?.codigo || ordenId);
    const year = Number(data?.year || new Date().getFullYear());

    const bucket = adminStorageBucket();
    const safeCode = code.replace(/[^A-Za-z0-9\-_]/g, "_");
    const path = `ordenes_compra/${year}/${safeCode}.pdf`;
    const token = randomUUID();

    await bucket.file(path).save(buf, {
      contentType: "application/pdf",
      metadata: {
        metadata: {
          uploadedBy: session.uid,
          firebaseStorageDownloadTokens: token,
          ordenId,
        },
      },
    });

    const encodedPath = encodeURIComponent(path);
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`;

    await ordenRef.set(
      {
        estado: "GENERADA",
        pdf: {
          path,
          url,
          uploadedAt: FieldValue.serverTimestamp(),
        },
        audit: {
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: session.uid,
        },
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, path, url });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}

