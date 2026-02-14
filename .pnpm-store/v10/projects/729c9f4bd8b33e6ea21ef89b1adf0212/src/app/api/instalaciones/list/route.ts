import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

function todayLimaYm() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    const canUse =
      session.isAdmin ||
      session.permissions.includes("ORDENES_LIQUIDAR") ||
      (session.access.areas || []).includes("INSTALACIONES");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const ymd = String(searchParams.get("ymd") || "").trim();
    const ym = String(searchParams.get("ym") || (ymd ? "" : todayLimaYm()));

    let q: FirebaseFirestore.Query = adminDb().collection("instalaciones");

    if (ymd) {
      q = q.where("fechaInstalacionYmd", "==", ymd);
    } else {
      const ymEff = ym || todayLimaYm();
      const start = `${ymEff}-01`;
      const end = `${ymEff}-31`;
      q = q.where("fechaInstalacionYmd", ">=", start).where("fechaInstalacionYmd", "<=", end);
    }

    const snap = await q.orderBy("fechaInstalacionYmd", "desc").limit(2000).get();
    const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    return NextResponse.json({
      ok: true,
      items,
      ymd: ymd || null,
      ym: ymd ? null : (ym || todayLimaYm()),
      today: todayLimaYmd(),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}