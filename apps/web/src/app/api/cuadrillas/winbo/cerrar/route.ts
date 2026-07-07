import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { getServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { createWinboSession } from "@/lib/winbo/client";
import {
  buscarCuadrillaWinbo,
  cerrarCuadrillaWinbo,
  diaWinboHoyLima,
  esHorarioValido,
  WINBO_MOTIVO_RETIRO_DE_CAMPO,
  ymdLima,
} from "@/lib/winbo/cuadrillasCierre";

export const runtime = "nodejs";

const PERMISO = "CUADRILLAS_CIERRE_WINBO";

const BodySchema = z.object({
  cuadrillaId: z.string().regex(/^K\d+_(MOTO|RESIDENCIAL)$/),
  dryRun: z.boolean().default(true),
  dia: z.number().int().min(1).max(7).optional(), // 1=lunes … 7=domingo; default: hoy en Lima
  observacion: z.string().max(300).optional().default(""),
});

const ERROR_STATUS: Record<string, number> = {
  CUADRILLA_NO_ENCONTRADA_WINBO: 404,
  CUADRILLA_AMBIGUA_WINBO: 409,
  CIERRE_YA_ENVIADO_HOY: 409,
  WINBO_FUERA_DE_HORARIO: 409,
  WINBO_LOGIN_FAILED: 502,
  WINBO_TERMS_FAILED: 502,
  WINBO_REQUEST_TIMEOUT: 504,
};

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    const allowed = session.isAdmin || session.permissions.includes(PERMISO);
    if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const parsedBody = BodySchema.safeParse(await req.json());
    if (!parsedBody.success) {
      return NextResponse.json({ ok: false, error: "INVALID_BODY", details: parsedBody.error.flatten() }, { status: 400 });
    }
    const { cuadrillaId, dryRun, observacion } = parsedBody.data;
    const dia = parsedBody.data.dia ?? diaWinboHoyLima();
    const ymd = ymdLima();

    // Evita reenvíos para la misma cuadrilla/día (consulta solo de igualdad, sin índice compuesto)
    if (!dryRun) {
      const previos = await adminDb()
        .collection("winbo_cierres")
        .where("cuadrillaId", "==", cuadrillaId)
        .where("ymd", "==", ymd)
        .get();
      const activo = previos.docs.some((doc) => {
        const estado = String(doc.get("estado") || "");
        return estado === "ENVIADO" || estado === "APROBADO";
      });
      if (activo) {
        return NextResponse.json({ ok: false, error: "CIERRE_YA_ENVIADO_HOY" }, { status: 409 });
      }
    }

    const winbo = await createWinboSession();
    const cuadrilla = await buscarCuadrillaWinbo(winbo, cuadrillaId);
    const horario = await esHorarioValido(winbo);

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        cuadrillaId,
        cuadriId: cuadrilla.cuadriId,
        nombreWinbo: cuadrilla.nombreWinbo,
        dia,
        ymd,
        horario,
      });
    }

    if (!horario.valido) {
      return NextResponse.json({ ok: false, error: "WINBO_FUERA_DE_HORARIO", horario }, { status: 409 });
    }

    const resultado = await cerrarCuadrillaWinbo(winbo, {
      cuadriId: cuadrilla.cuadriId,
      dia,
      observacion,
    });

    const ref = await adminDb()
      .collection("winbo_cierres")
      .add({
        cuadrillaId,
        cuadriId: cuadrilla.cuadriId,
        nombreWinbo: cuadrilla.nombreWinbo,
        dia,
        ymd,
        motivoId: WINBO_MOTIVO_RETIRO_DE_CAMPO,
        motivo: "RETIRO DE CAMPO",
        observacion,
        estado: "ENVIADO",
        nuevoEstadoWinbo: resultado.nuevoEstado,
        solicitudNum: null,
        notiId: null,
        createdBy: session.uid,
        createdAt: FieldValue.serverTimestamp(),
        resolvedAt: null,
      });

    return NextResponse.json({
      ok: true,
      dryRun: false,
      cierreId: ref.id,
      cuadrillaId,
      cuadriId: cuadrilla.cuadriId,
      nombreWinbo: cuadrilla.nombreWinbo,
      dia,
      ymd,
      estado: "ENVIADO",
    });
  } catch (error: any) {
    const message = String(error?.message || "ERROR");
    const status = ERROR_STATUS[message] ?? 500;
    const extra: Record<string, unknown> = {};
    if (Array.isArray(error?.candidatos)) extra.candidatos = error.candidatos;
    if (error?.registros) extra.registros = error.registros;
    return NextResponse.json({ ok: false, error: message, ...extra }, { status });
  }
}
