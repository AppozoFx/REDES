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

    const ymd = todayLimaYmd();
    const docId = `${ymd}_${cuadrillaId}`;
    const db = adminDb();
    const ref = db.collection("cuadrilla_estado_diario").doc(docId);
    const snap = await ref.get();

    let estadoRuta: string;

    if (snap.exists) {
      estadoRuta = String((snap.data() as any)?.estadoRuta || "OPERATIVA");
      // Solo actualiza a EN_CAMPO si estaba OPERATIVA (no sobreescribe RUTA_CERRADA ni EN_CAMPO)
      if (estadoRuta === "OPERATIVA") {
        await ref.set(
          {
            estadoRuta: "EN_CAMPO",
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: mobile.uid,
          },
          { merge: true }
        );
        estadoRuta = "EN_CAMPO";
      }
    } else {
      // Primer registro del día: crear en EN_CAMPO
      await ref.set({
        ymd,
        cuadrillaId,
        cuadrillaNombre,
        gestorUid: "",
        estadoRuta: "EN_CAMPO",
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: mobile.uid,
      });
      estadoRuta = "EN_CAMPO";
    }

    return NextResponse.json({ ok: true, estadoRuta });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
