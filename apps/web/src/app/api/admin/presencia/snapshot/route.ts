import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReqBody = {
  uids?: string[];
};

function toMillis(v: any): number {
  if (!v) return 0;
  if (typeof v?.toMillis === "function") return Number(v.toMillis() || 0);
  if (typeof v?.toDate === "function") {
    const d = v.toDate();
    return d instanceof Date ? d.getTime() : 0;
  }
  if (v instanceof Date) return v.getTime();
  if (typeof v?.seconds === "number") return Number(v.seconds) * 1000;
  if (typeof v?._seconds === "number") return Number(v._seconds) * 1000;
  return 0;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (!session.isAdmin) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const uidsRaw = Array.isArray(body?.uids) ? body.uids : [];
    const uids = Array.from(
      new Set(
        uidsRaw
          .map((x) => String(x || "").trim())
          .filter(Boolean)
          .slice(0, 800)
      )
    );

    if (!uids.length) {
      return NextResponse.json({ ok: true, generatedAt: new Date().toISOString(), data: [] });
    }

    const presenceRefs = uids.map((uid) => adminDb().collection("usuarios_presencia").doc(uid));
    const snaps = await adminDb().getAll(...presenceRefs);
    const onlineGraceMs = 2 * 60 * 1000;
    const now = Date.now();

    const data = snaps.map((s) => {
      const p = (s.data() as any) || {};
      const lastSeenMs = toMillis(p?.lastSeenAt) || toMillis(p?.updatedAt);
      const online = !!p?.online && lastSeenMs > 0 && now - lastSeenMs <= onlineGraceMs;
      return {
        uid: s.id,
        online,
        lastSeenAt: lastSeenMs > 0 ? new Date(lastSeenMs).toISOString() : null,
      };
    });

    return NextResponse.json({ ok: true, generatedAt: new Date().toISOString(), data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}

