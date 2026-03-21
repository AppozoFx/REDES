import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

function isSundayYmd(ymd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  return new Date(`${ymd}T00:00:00`).getDay() === 0;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const fecha = String(searchParams.get("fecha") || "").trim();
    if (!fecha) return NextResponse.json({ ok: false, error: "MISSING_FECHA" }, { status: 400 });

    const db = adminDb();
    const [snap, cuadrillasSnap] = await Promise.all([
      db
        .collection("asistencia_programada")
        .where("startYmd", "<=", fecha)
        .orderBy("startYmd", "desc")
        .limit(5)
        .get(),
      db
        .collection("cuadrillas")
        .where("area", "==", "INSTALACIONES")
        .where("estado", "==", "HABILITADO")
        .get(),
    ]);

    if (snap.empty) {
      const defaultValue = isSundayYmd(fecha) ? "descanso" : "asistencia";
      const map = Object.fromEntries(cuadrillasSnap.docs.map((d) => [d.id, defaultValue]));
      return NextResponse.json({ ok: true, map });
    }
    const doc = snap.docs.find((d) => {
      const data = d.data() as any;
      const endYmd = String(data?.endYmd || "");
      return endYmd && endYmd >= fecha;
    });
    if (!doc) {
      const defaultValue = isSundayYmd(fecha) ? "descanso" : "asistencia";
      const map = Object.fromEntries(cuadrillasSnap.docs.map((d) => [d.id, defaultValue]));
      return NextResponse.json({ ok: true, map });
    }
    const data = doc.data() as any;
    const items = (data?.items || {}) as Record<string, Record<string, string>>;

    const map: Record<string, string> = {};
    const defaultValue = isSundayYmd(fecha) ? "descanso" : "asistencia";
    cuadrillasSnap.docs.forEach((d) => {
      const cid = d.id;
      const row = items[cid] || {};
      const v = String(row?.[fecha] || defaultValue).toLowerCase();
      map[cid] = v;
    });

    return NextResponse.json({ ok: true, map });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
