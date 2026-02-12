import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

const PERM_EDIT = "ORDENES_GARANTIAS_EDIT";

const BodySchema = z.object({
  ordenId: z.string().min(1),
  motivoGarantia: z.string().optional().default(""),
  diagnosticoGarantia: z.string().optional().default(""),
  solucionGarantia: z.string().optional().default(""),
  responsableGarantia: z.string().optional().default(""),
  casoGarantia: z.string().optional().default(""),
  imputadoGarantia: z.string().optional().default(""),
});

function jsonErr(code: string, status = 400) {
  return NextResponse.json({ ok: false, error: code }, { status });
}

function isGarantia(x: any) {
  const txt = `${String(x?.tipo || "")} ${String(x?.tipoTraba || "")} ${String(x?.idenServi || "")} ${String(x?.tipoServicio || "")} ${String(x?.estado || "")}`.toUpperCase();
  return txt.includes("GARANTIA");
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return jsonErr("UNAUTHENTICATED", 401);
    if (session.access.estadoAcceso !== "HABILITADO") return jsonErr("ACCESS_DISABLED", 403);
    const canEdit = session.isAdmin || session.permissions.includes(PERM_EDIT);
    if (!canEdit) return jsonErr("FORBIDDEN", 403);

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return jsonErr("FORM_INVALIDO");
    const data = parsed.data;

    const ref = adminDb().collection("ordenes").doc(data.ordenId);
    const snap = await ref.get();
    if (!snap.exists) return jsonErr("ORDEN_NOT_FOUND", 404);
    const ord = snap.data() as any;

    const cliente = String(ord?.cliente || "").trim();
    const codigo = String(ord?.codiSeguiClien || "").trim();
    const garantiaYmd = String(ord?.fSoliYmd || "").trim();

    let fechaInstalacionBase = "";
    let diasDesdeInstalacion: number | null = null;

    if (cliente && codigo) {
      const related = await adminDb()
        .collection("ordenes")
        .where("codiSeguiClien", "==", codigo)
        .limit(300)
        .get();

      let bestYmd = "";
      related.docs.forEach((d) => {
        const x = d.data() as any;
        const sameClient = String(x?.cliente || "").trim().toLowerCase() === cliente.toLowerCase();
        const finalizada = String(x?.estado || "").trim().toUpperCase() === "FINALIZADA";
        const notGarantia = !isGarantia(x);
        const ymd = String(x?.fSoliYmd || "").trim();
        if (!sameClient || !finalizada || !notGarantia || !ymd) return;
        if (!bestYmd || ymd > bestYmd) bestYmd = ymd;
      });

      if (bestYmd) {
        fechaInstalacionBase = bestYmd;
        if (garantiaYmd) {
          const d1 = Date.parse(`${garantiaYmd}T00:00:00Z`);
          const d0 = Date.parse(`${bestYmd}T00:00:00Z`);
          if (!Number.isNaN(d1) && !Number.isNaN(d0)) {
            const diff = Math.floor((d1 - d0) / (24 * 60 * 60 * 1000));
            diasDesdeInstalacion = Math.max(0, diff);
          }
        }
      }
    }

    const payload = {
      motivoGarantia: String(data.motivoGarantia || "").trim(),
      diagnosticoGarantia: String(data.diagnosticoGarantia || "").trim(),
      solucionGarantia: String(data.solucionGarantia || "").trim(),
      responsableGarantia: String(data.responsableGarantia || "").trim(),
      casoGarantia: String(data.casoGarantia || "").trim(),
      imputadoGarantia: String(data.imputadoGarantia || "").trim(),
      fechaInstalacionBase: fechaInstalacionBase || "",
      diasDesdeInstalacion: diasDesdeInstalacion ?? null,
      garantiaUpdatedBy: session.uid,
      garantiaUpdatedAt: FieldValue.serverTimestamp(),
      "audit.updatedAt": FieldValue.serverTimestamp(),
      "audit.updatedBy": session.uid,
    };

    await ref.set(payload, { merge: true });
    return NextResponse.json({ ok: true, ordenId: data.ordenId, payload });
  } catch (e: any) {
    return jsonErr(String(e?.message || "ERROR"), 500);
  }
}

