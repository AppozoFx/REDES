import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getMobileAuthContext } from "@/core/auth/mobile";
import { getTecnicoContext } from "@/core/auth/mobileTecnico";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function POST(req: Request) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const tecnico = await getTecnicoContext(mobile);
    const cuadrillaId = tecnico.cuadrilla.id;
    const cuadrillaNombre = tecnico.cuadrilla.nombre;

    const raw = (await req.json().catch(() => ({}))) as { tipo?: string };
    const tipo = String(raw?.tipo || "").trim().toUpperCase();
    if (!tipo) {
      return NextResponse.json({ ok: false, error: "TIPO_REQUIRED" }, { status: 400 });
    }
    const tiposPermitidos = ["CERRAR_RUTA", "REQUIERE_ATENCION"];
    if (!tiposPermitidos.includes(tipo)) {
      return NextResponse.json({ ok: false, error: "TIPO_INVALIDO" }, { status: 400 });
    }

    const db = adminDb();

    // Anti-duplicado: reutilizar alerta PENDIENTE existente del mismo tipo+cuadrilla
    const existing = await db
      .collection("alertas_app")
      .where("cuadrillaId", "==", cuadrillaId)
      .where("tipo", "==", tipo)
      .where("estado", "==", "PENDIENTE")
      .limit(1)
      .get();

    if (!existing.empty) {
      return NextResponse.json({ ok: true, alertaId: existing.docs[0].id });
    }

    const ymd = todayLimaYmd();
    const ref = db.collection("alertas_app").doc();
    await ref.set({
      tipo,
      estado: "PENDIENTE",
      cuadrillaId,
      cuadrillaNombre,
      emisorUid: mobile.uid,
      emisorNombre: tecnico.tecnicoNombre || mobile.uid,
      rolesDestino: ["GESTOR", "JEFATURA", "GERENCIA"],
      ymd,
      creadoAt: FieldValue.serverTimestamp(),
      respondidoAt: null,
      respondidoPorUid: null,
      respondidoPorNombre: null,
      respondidoPorRol: null,
    });

    return NextResponse.json({ ok: true, alertaId: ref.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
