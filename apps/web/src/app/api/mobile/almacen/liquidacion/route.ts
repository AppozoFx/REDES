import { NextResponse } from "next/server";
import { getMobileAuthContext } from "@/core/auth/mobile";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayLimaYm() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function monthRange(ym: string): { start: string; end: string } | null {
  const m = String(ym || "").trim().match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mm) || mm < 1 || mm > 12) return null;
  const start = `${String(y).padStart(4, "0")}-${String(mm).padStart(2, "0")}-01`;
  const lastDay = new Date(y, mm, 0).getDate();
  const end = `${String(y).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export async function GET(req: Request) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

    const roles = (mobile.access.roles || []).map((r) => String(r || "").trim().toUpperCase());
    const areas = (mobile.access.areas || []).map((a) => String(a || "").trim().toUpperCase());
    const allowed =
      mobile.access.isAdmin ||
      roles.includes("ALMACEN") ||
      roles.includes("ADMIN") ||
      areas.includes("ALMACEN") ||
      areas.includes("INSTALACIONES");
    if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const ymParam = String(searchParams.get("ym") || "").trim() || todayLimaYm();
    const range = monthRange(ymParam);
    if (!range) return NextResponse.json({ ok: false, error: "INVALID_YM" }, { status: 400 });

    const db = adminDb();
    const snap = await db
      .collection("ordenes")
      .where("fechaFinVisiYmd", ">=", range.start)
      .where("fechaFinVisiYmd", "<=", range.end)
      .where("estado", "==", "FINALIZADA")
      .orderBy("fechaFinVisiYmd", "desc")
      .limit(500)
      .get();

    const items = snap.docs.map((doc) => {
      const d = doc.data() as any;
      return {
        id: doc.id,
        ordenId: String(d?.ordenId || d?.id || doc.id).trim(),
        cliente: String(d?.cliente || d?.nombreCliente || "").trim(),
        cuadrillaId: String(d?.cuadrillaId || "").trim(),
        cuadrillaNombre: String(d?.cuadrillaNombre || d?.cuadrillaId || "").trim(),
        fechaYmd: String(d?.fechaFinVisiYmd || "").trim(),
        fechaHm: String(d?.fechaFinVisiHm || "").trim(),
        tipo: String(d?.tipoTraba || d?.tipo || "").trim(),
        liquidado: Boolean(d?.liquidado),
        cantMesh: String(d?.cantMESHwin || "0").trim(),
        cantFono: String(d?.cantFONOwin || "0").trim(),
        cantBox: String(d?.cantBOXwin || "0").trim(),
      };
    });

    const finalizadas = items.length;
    const liquidadas = items.filter((i) => i.liquidado).length;
    const pendientes = finalizadas - liquidadas;

    return NextResponse.json({
      ok: true,
      ym: ymParam,
      items,
      kpi: { finalizadas, liquidadas, pendientes },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
