import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";
import { canManageSupervisores } from "@/domain/supervisores/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOC_REF = () => adminDb().collection("configuracion_app").doc("supervisor_jornada");

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (!canManageSupervisores(session)) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const snap = await DOC_REF().get();
    const data = snap.exists ? (snap.data() as any) : {};
    const oficina = data?.oficina || null;

    return NextResponse.json({ ok: true, oficina });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (!canManageSupervisores(session)) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    const radioMetros = Number(body?.radioMetros || 500);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ ok: false, error: "LAT_LNG_INVALIDOS" }, { status: 400 });
    }
    if (radioMetros < 50 || radioMetros > 5000) {
      return NextResponse.json({ ok: false, error: "RADIO_INVALIDO (50-5000m)" }, { status: 400 });
    }

    const oficina = { lat, lng, radioMetros };
    await DOC_REF().set({ oficina, updatedAt: new Date().toISOString(), updatedBy: session.uid }, { merge: true });

    return NextResponse.json({ ok: true, oficina });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
