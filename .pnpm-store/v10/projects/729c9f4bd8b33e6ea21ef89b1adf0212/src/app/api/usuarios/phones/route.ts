import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

function normalizePhone(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  const noPrefix = digits.startsWith("51") && digits.length >= 11 ? digits.slice(2) : digits;
  return noPrefix.length >= 9 ? noPrefix : "";
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const raw = searchParams.get("uids") || "";
    const uids = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (!uids.length) return NextResponse.json({ ok: true, items: [] });

    const refs = uids.map((uid) => adminDb().collection("usuarios").doc(uid));
    const snaps = await adminDb().getAll(...refs);
    const items = snaps.map((s) => {
      const data = s.data() as any;
      const celular = normalizePhone(String(data?.celular || ""));
      return { uid: s.id, celular };
    });

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
