import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";
import { Timestamp } from "firebase-admin/firestore";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });

    const canViewAll = session.isAdmin || session.permissions.includes("VENTAS_VER_ALL");
    const canView = canViewAll || session.permissions.includes("VENTAS_VER");
    if (!canView) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const coordinadorUid = searchParams.get("coordinadorUid");
    const year = Number(searchParams.get("year") || "");
    const month = Number(searchParams.get("month") || "");
    const limitParam = Math.min(500, Math.max(1, Number(searchParams.get("limit") || 100)));
    const startAfterMs = Number(searchParams.get("startAfterMs") || "");
    const startAfterId = String(searchParams.get("startAfterId") || "");

    let q: FirebaseFirestore.Query = adminDb().collection("ventas");

    if (!canViewAll) {
      const isCoord = (session.access.roles || []).includes("COORDINADOR");
      if (isCoord) {
        q = q.where("coordinadorUid", "==", session.uid);
      } else {
        // Sin permiso global ni rol coordinador: no ver nada
        return NextResponse.json({ ok: true, items: [] });
      }
    }

    if (year && month >= 1 && month <= 12) {
      const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
      const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));
      q = q.where("createdAt", ">=", Timestamp.fromDate(start));
      q = q.where("createdAt", "<", Timestamp.fromDate(end));
    } else if (year && !month) {
      const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
      const end = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));
      q = q.where("createdAt", ">=", Timestamp.fromDate(start));
      q = q.where("createdAt", "<", Timestamp.fromDate(end));
    }

    q = q.orderBy("createdAt", "desc").orderBy("__name__", "desc");

    if (startAfterMs && startAfterId) {
      q = q.startAfter(Timestamp.fromMillis(startAfterMs), startAfterId);
    }

    const snap = await q.limit(limitParam + 1).get();
    const docs = snap.docs;
    const hasMore = docs.length > limitParam;
    const pageDocs = docs.slice(0, limitParam);

    const items = pageDocs.map((d) => {
      const data = d.data() as any;
      const createdAt = data?.createdAt?.toDate?.();
      return {
        id: d.id,
        ...data,
        createdAtStr: createdAt ? createdAt.toISOString() : "",
        createdAtMs: createdAt ? createdAt.getTime() : 0,
      };
    });

    const last = pageDocs[pageDocs.length - 1];
    const lastCreatedAt = last?.data()?.createdAt?.toDate?.();
    return NextResponse.json({
      ok: true,
      items,
      pageInfo: {
        hasMore,
        lastId: last?.id || "",
        lastCreatedAtMs: lastCreatedAt ? lastCreatedAt.getTime() : 0,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
