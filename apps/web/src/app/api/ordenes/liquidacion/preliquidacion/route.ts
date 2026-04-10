import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function preliqDocId(pedido: string, ymd: string) {
  const cleanPedido = String(pedido || "").trim().replace(/[\/\\\s]+/g, "_");
  return `${cleanPedido}_${ymd}`;
}

function cleanSeries(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .slice(0, 4);
}

function cleanValue(value: unknown): string {
  return String(value || "").trim();
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });

    const allowed = session.isAdmin || session.permissions.includes("ORDENES_LIQUIDAR");
    if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const pedido = String(searchParams.get("pedido") || "").trim();
    const ymd = String(searchParams.get("ymd") || todayLimaYmd()).trim();
    if (!pedido) return NextResponse.json({ ok: false, error: "PEDIDO_REQUIRED" }, { status: 400 });

    const snap = await adminDb().collection("telegram_preliquidaciones").doc(preliqDocId(pedido, ymd)).get();
    if (!snap.exists) return NextResponse.json({ ok: true, found: false });

    const row = (snap.data() || {}) as Record<string, unknown>;
    const pre = (row.preliquidacion || {}) as Record<string, unknown>;
    return NextResponse.json({
      ok: true,
      found: true,
      item: {
        pedido: String(row.pedido || pedido),
        ymd: String(row.ymd || ymd),
        snOnt: String(pre.snOnt || "").trim(),
        snMeshes: cleanSeries(pre.snMeshes),
        snBoxes: cleanSeries(pre.snBoxes),
        snFono: cleanValue(pre.snFono),
        rotuloNapCto: cleanValue(pre.rotuloNapCto),
        receptorDocumento: cleanValue(pre.receptorDocumento),
        receptorNombres: cleanValue(pre.receptorNombres),
        receptorTelefono: cleanValue(pre.receptorTelefono),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
