import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";
import { addGlobalNotification } from "@/domain/notificaciones/service";
import { toDatePartsLima } from "@/domain/equipos/repo";
import { resolveTramoNombre } from "@/domain/ordenes/tramo";

export const runtime = "nodejs";
const PERM_EDIT = "ORDENES_LLAMADAS_EDIT";

const BodySchema = z.object({
  ordenId: z.string().min(1),
  telefono: z.string().optional().default(""),
  horaInicioLlamada: z.string().optional().default(""),
  horaFinLlamada: z.string().optional().default(""),
  estadoLlamada: z.enum(["Contesto", "No Contesto", "No se Registro"]),
  observacionLlamada: z.string().optional().default(""),
});

function jsonErr(code: string, status = 400) {
  return NextResponse.json({ ok: false, error: code }, { status });
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return jsonErr("UNAUTHENTICATED", 401);
    if (session.access.estadoAcceso !== "HABILITADO") return jsonErr("ACCESS_DISABLED", 403);
    const canEdit =
      session.isAdmin ||
      session.access.roles.includes("GESTOR") ||
      session.permissions.includes(PERM_EDIT);
    if (!canEdit) return jsonErr("FORBIDDEN", 403);

    const raw = await req.json();
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) return jsonErr("FORM_INVALIDO");

    const data = parsed.data;
    const ordenRef = adminDb().collection("ordenes").doc(data.ordenId);
    const snap = await ordenRef.get();
    if (!snap.exists) return jsonErr("ORDEN_NOT_FOUND", 404);

    const now = toDatePartsLima(new Date());
    const payload = {
      telefono: String(data.telefono || "").trim(),
      horaInicioLlamada: String(data.horaInicioLlamada || "").trim(),
      horaFinLlamada: String(data.horaFinLlamada || "").trim(),
      estadoLlamada: data.estadoLlamada,
      observacionLlamada: String(data.observacionLlamada || "").trim(),
      llamadaUpdatedAt: now.at,
      llamadaUpdatedYmd: now.ymd,
      llamadaUpdatedHm: now.hm,
      llamadaUpdatedBy: session.uid,
      "audit.updatedAt": FieldValue.serverTimestamp(),
      "audit.updatedBy": session.uid,
    };

    await ordenRef.set(payload, { merge: true });

    try {
      const x = snap.data() as any;
      const actorSnap = await adminDb().collection("usuarios").doc(session.uid).get();
      const actor = actorSnap.data() as any;
      const usuarioTxt = `${String(actor?.nombres || "").trim()} ${String(actor?.apellidos || "").trim()}`
        .trim() || session.uid;
      const cliente = String(x?.cliente || "").trim();
      const codigo = String(x?.codiSeguiClien || "").trim();
      const estadoInstalacion = String(x?.estado || "").trim() || "-";
      const telefono = String(data.telefono || x?.telefono || "").trim() || "-";
      const tramo = resolveTramoNombre(String(x?.fSoliHm || ""), String(x?.fechaFinVisiHm || ""));
      const cuadrilla = String(x?.cuadrillaNombre || x?.cuadrillaId || "").trim() || "-";
      const obs = String(data.observacionLlamada || "").trim() || "-";
      await addGlobalNotification({
        title: "Gestion de llamada",
        message: `${usuarioTxt} gestiono al cliente ${cliente || "-"} | Estado Llamada: ${data.estadoLlamada} | Estado Instalacion: ${estadoInstalacion} | Codigo Cliente: ${codigo || "-"} | Telefono: ${telefono} | Tramo: ${tramo} | Cuadrilla: ${cuadrilla} | Obs: ${obs}`,
        type: "info",
        scope: "ALL",
        createdBy: session.uid,
        entityType: "ORDENES",
        entityId: data.ordenId,
        action: "UPDATE",
        estado: "ACTIVO",
      });
    } catch {}

    return NextResponse.json({ ok: true, ordenId: data.ordenId, payload });
  } catch (e: any) {
    return jsonErr(String(e?.message || "ERROR"), 500);
  }
}
