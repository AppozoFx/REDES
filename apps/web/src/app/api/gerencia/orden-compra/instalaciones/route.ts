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

function toStr(v: unknown) {
  return String(v || "").trim();
}

function toNum(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeDateYmd(value: string) {
  const v = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
}

function isResidencial(doc: any) {
  const tipoOrden = toStr(doc?.orden?.tipoOrden).toLowerCase();
  const a = toStr(doc?.residencialCondominio).toLowerCase();
  const b = toStr(doc?.r_c).toLowerCase();
  const c = toStr(doc?.tipo).toLowerCase();
  const d = toStr(doc?.orden?.residencialCondominio).toLowerCase();
  const v = `${tipoOrden} ${a} ${b} ${c} ${d}`;
  return v.includes("resid");
}

function isCondominio(doc: any) {
  const tipoOrden = toStr(doc?.orden?.tipoOrden).toLowerCase();
  const a = toStr(doc?.residencialCondominio).toLowerCase();
  const b = toStr(doc?.r_c).toLowerCase();
  const c = toStr(doc?.tipo).toLowerCase();
  const d = toStr(doc?.orden?.residencialCondominio).toLowerCase();
  const v = `${tipoOrden} ${a} ${b} ${c} ${d}`;
  return v.includes("condo");
}

function qtyCat5e(doc: any) {
  const servicios = (doc?.servicios || doc?.liquidacion?.servicios || {}) as any;
  const explicit = toNum(servicios?.cat5e ?? doc?.cat5e);
  if (explicit > 0) return explicit;
  const txt = `${toStr(servicios?.servicioCableadoMesh)} ${toStr(doc?.utp_cat)} ${toStr(doc?.material)}`.toLowerCase();
  return txt.includes("5e") || /cat ?5e/.test(txt) ? 1 : 0;
}

function qtyCat6(doc: any) {
  const servicios = (doc?.servicios || doc?.liquidacion?.servicios || {}) as any;
  const explicit = toNum(servicios?.cat6 ?? doc?.cat6);
  if (explicit > 0) return explicit;
  const txt = `${toStr(servicios?.servicioCableadoMesh)} ${toStr(doc?.utp_cat)} ${toStr(doc?.material)}`.toLowerCase();
  return /\b6\b/.test(txt) || /cat ?6/.test(txt) ? 1 : 0;
}

function coordUidOf(doc: any) {
  return toStr(doc?.orden?.coordinadorCuadrilla);
}

function cuadrillaOf(doc: any) {
  return toStr(doc?.cuadrillaNombre || doc?.cuadrilla || doc?.orden?.cuadrillaNombre || "-") || "-";
}

function fechaYmdOf(doc: any) {
  return normalizeDateYmd(
    doc?.fechaOrdenYmd ||
      doc?.fechaInstalacionYmd ||
      doc?.orden?.fechaFinVisiYmd ||
      doc?.orden?.fSoliYmd ||
      ""
  );
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

    const snap = await adminDb()
      .collection("instalaciones")
      .where("fechaOrdenYmd", ">=", desde)
      .where("fechaOrdenYmd", "<=", hasta)
      .limit(10000)
      .get();

    const docs = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .filter((row) => coordUidOf(row) === coordinadorUid)
      .filter((row) => {
        const f = fechaYmdOf(row);
        return !!f && f >= desde && f <= hasta;
      });

    const summary = {
      totalInstalaciones: docs.length,
      residencial: docs.filter(isResidencial).length,
      condominio: docs.filter(isCondominio).length,
      cat5e: docs.reduce((acc, d) => acc + qtyCat5e(d), 0),
      cat6: docs.reduce((acc, d) => acc + qtyCat6(d), 0),
    };

    const group = new Map<string, { cuadrilla: string; residencial: number; condominio: number; cat5e: number; cat6: number }>();
    for (const d of docs) {
      const key = cuadrillaOf(d);
      const row = group.get(key) || { cuadrilla: key, residencial: 0, condominio: 0, cat5e: 0, cat6: 0 };
      if (isResidencial(d)) row.residencial += 1;
      if (isCondominio(d)) row.condominio += 1;
      row.cat5e += qtyCat5e(d);
      row.cat6 += qtyCat6(d);
      group.set(key, row);
    }

    const porCuadrilla = Array.from(group.values()).sort((a, b) =>
      a.cuadrilla.localeCompare(b.cuadrilla, "es", { sensitivity: "base" })
    );

    return NextResponse.json({ ok: true, summary, porCuadrilla });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
