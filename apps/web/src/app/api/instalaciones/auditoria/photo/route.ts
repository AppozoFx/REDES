import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getServerSession } from "@/core/auth/session";
import { adminDb, adminStorageBucket } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

function asStr(v: any) {
  return String(v || "").trim();
}

function rolesOf(session: any) {
  return (session.access.roles || []).map((r: any) => String(r || "").toUpperCase());
}

function canUse(session: any) {
  const roles = rolesOf(session);
  return (
    session.isAdmin ||
    (session.access.areas || []).includes("INSTALACIONES") ||
    roles.includes("COORDINADOR") ||
    roles.includes("TECNICO") ||
    session.permissions.includes("EQUIPOS_VIEW") ||
    session.permissions.includes("EQUIPOS_EDIT")
  );
}

function canEdit(session: any) {
  if (session.isAdmin) return true;
  const roles = rolesOf(session);
  if (roles.includes("COORDINADOR") || roles.includes("TECNICO")) return false;
  return (session.access.areas || []).includes("INSTALACIONES") || session.permissions.includes("EQUIPOS_EDIT");
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    if (!canUse(session)) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    if (!canEdit(session)) return NextResponse.json({ ok: false, error: "READ_ONLY_ROLE" }, { status: 403 });

    const form = await req.formData();
    const equipoId = asStr(form.get("equipoId"));
    const marcarSustentado = String(form.get("marcarSustentado") || "true") === "true";
    const file = form.get("file");
    if (!equipoId) return NextResponse.json({ ok: false, error: "MISSING_EQUIPO_ID" }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "MISSING_FILE" }, { status: 400 });

    const db = adminDb();
    const ref = db.collection("equipos").doc(equipoId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    const eq = snap.data() as any;
    const sn = asStr(eq?.SN || equipoId).toUpperCase();

    const mime = asStr(file.type).toLowerCase();
    const ext = mime.includes("png") ? "png" : mime.includes("jpeg") || mime.includes("jpg") ? "jpg" : "jpg";
    const path = `auditoria/${sn}.${ext}`;
    const token = randomUUID();
    const bucket = adminStorageBucket();
    const buffer = Buffer.from(await file.arrayBuffer());
    await bucket.file(path).save(buffer, {
      contentType: ext === "png" ? "image/png" : "image/jpeg",
      metadata: {
        metadata: {
          firebaseStorageDownloadTokens: token,
          uploadedBy: session.uid,
        },
      },
    });
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;

    const prev = (eq?.auditoria || {}) as any;
    const auditoria: any = {
      ...prev,
      requiere: true,
      fotoPath: path,
      fotoURL: url,
      actualizadoEn: FieldValue.serverTimestamp(),
      actualizadoPor: session.uid,
    };
    if (marcarSustentado) auditoria.estado = "sustentada";
    await ref.set({ auditoria }, { merge: true });

    return NextResponse.json({ ok: true, fotoPath: path, fotoURL: url, estado: auditoria.estado || "pendiente" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}

