import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERM_GERENCIA_ORDEN_COMPRA = "GERENCIA_ORDEN_COMPRA";

function hasGerenciaOcAccess(session: NonNullable<Awaited<ReturnType<typeof getServerSession>>>) {
  const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
  return session.isAdmin || (roles.includes("GERENCIA") && session.permissions.includes(PERM_GERENCIA_ORDEN_COMPRA));
}

function isYm(v: string) {
  return /^\d{4}-\d{2}$/.test(v);
}

function currentYm() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function rangeFromYm(ym: string) {
  const [yStr, mStr] = ym.split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return { from, to };
}

function ymLimaFromDate(date: Date) {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return String(ymd).slice(0, 7);
}

function toIso(v: any) {
  try {
    if (!v) return "";
    if (typeof v?.toDate === "function") return v.toDate().toISOString();
    if (v instanceof Date) return v.toISOString();
    return "";
  } catch {
    return "";
  }
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    if (!hasGerenciaOcAccess(session)) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const ym = String(searchParams.get("ym") || "").trim() || currentYm();
    if (!isYm(ym)) return NextResponse.json({ ok: false, error: "YM_INVALID" }, { status: 400 });

    const { from } = rangeFromYm(ym);
    const year = from.getUTCFullYear();
    const snap = await adminDb()
      .collection("ordenes_compra")
      .where("year", "==", year)
      .limit(3000)
      .get();

    const items = snap.docs.map((d) => {
      const x = d.data() as any;
      const createdAtDate = typeof x?.audit?.createdAt?.toDate === "function" ? x.audit.createdAt.toDate() : null;
      return {
        id: d.id,
        codigo: String(x?.codigo || d.id),
        correlativo: Number(x?.correlativo || 0),
        estado: String(x?.estado || "-"),
        coordinadorNombre: String(x?.coordinadorNombre || "-"),
        proveedor: {
          razonSocial: String(x?.proveedor?.razonSocial || "-"),
          ruc: String(x?.proveedor?.ruc || ""),
        },
        periodo: {
          desde: String(x?.periodo?.desde || ""),
          hasta: String(x?.periodo?.hasta || ""),
        },
        totales: {
          subtotal: Number(x?.totales?.subtotal || 0),
          igv: Number(x?.totales?.igv || 0),
          total: Number(x?.totales?.total || 0),
        },
        pdfUrl: String(x?.pdf?.url || ""),
        createdAt: toIso(createdAtDate),
      };
    })
      .filter((x) => (x.createdAt ? ymLimaFromDate(new Date(x.createdAt)) === ym : false))
      .sort((a, b) => b.correlativo - a.correlativo);

    const totalMonto = Number(items.reduce((acc, it) => acc + Number(it?.totales?.total || 0), 0).toFixed(2));
    return NextResponse.json({
      ok: true,
      ym,
      summary: {
        totalOrdenes: items.length,
        totalMonto,
      },
      items,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
