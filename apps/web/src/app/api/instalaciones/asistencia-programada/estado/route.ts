import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

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

    const snap = await adminDb()
      .collection("asistencia_programada")
      .where("startYmd", "<=", fecha)
      .where("endYmd", ">=", fecha)
      .limit(1)
      .get();

    if (snap.empty) return NextResponse.json({ ok: true, map: {} });
    const data = snap.docs[0].data() as any;
    const items = (data?.items || {}) as Record<string, Record<string, string>>;

    const map: Record<string, string> = {};
    Object.entries(items).forEach(([cid, row]) => {
      const v = String(row?.[fecha] || "descanso").toLowerCase();
      map[cid] = v;
    });

    return NextResponse.json({ ok: true, map });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
