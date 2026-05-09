import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { loadPendingInstallations } from "@/core/gerencia/ordenCompraLedger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERM_GERENCIA_ORDEN_COMPRA = "GERENCIA_ORDEN_COMPRA";

function hasGerenciaOcAccess(session: NonNullable<Awaited<ReturnType<typeof getServerSession>>>) {
  const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
  return session.isAdmin || (roles.includes("GERENCIA") && session.permissions.includes(PERM_GERENCIA_ORDEN_COMPRA));
}

function toStr(v: unknown) {
  return String(v || "").trim();
}

function normalizeDateYmd(value: string) {
  const v = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
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
    const coordinadorUid = toStr(searchParams.get("coordinadorUid"));
    const desde = normalizeDateYmd(searchParams.get("desde") || "");
    const hasta = normalizeDateYmd(searchParams.get("hasta") || "");
    if (!coordinadorUid) return NextResponse.json({ ok: false, error: "COORDINADOR_REQUIRED" }, { status: 400 });
    if (!desde || !hasta) return NextResponse.json({ ok: false, error: "RANGO_REQUIRED" }, { status: 400 });
    if (desde > hasta) return NextResponse.json({ ok: false, error: "RANGO_INVALID" }, { status: 400 });

    const { summary, porCuadrilla } = await loadPendingInstallations({ coordinadorUid, desde, hasta });

    return NextResponse.json({ ok: true, summary, porCuadrilla });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
