import { NextResponse } from "next/server";

import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";
import { resolveTramoBase } from "@/domain/ordenes/tramo";

export const runtime = "nodejs";

const PERM_VIEW = "ORDENES_MAPA_VIEW";

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function isGarantia(x: any) {
  const txt = `${String(x?.tipo || "")} ${String(x?.tipoTraba || "")} ${String(x?.idenServi || "")} ${String(x?.tipoServicio || "")} ${String(x?.estado || "")}`.toUpperCase();
  return txt.includes("GARANTIA");
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
    const canView =
      session.isAdmin ||
      session.permissions.includes(PERM_VIEW);
    if (!canView) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const ymd = String(searchParams.get("ymd") || todayLimaYmd());

    const snap = await adminDb()
      .collection("ordenes")
      .where("fSoliYmd", "==", ymd)
      .limit(3000)
      .get();

    const rows = snap.docs
      .map((d) => {
        const x = d.data() as any;
        const lat = toNum(x.lat);
        const lng = toNum(x.lng);
        return {
          id: d.id,
          ordenId: String(x.ordenId || d.id),
          cliente: String(x.cliente || ""),
          codigoCliente: String(x.codiSeguiClien || ""),
          cuadrillaNombre: String(x.cuadrillaNombre || x.cuadrillaId || ""),
          plan: String(x.idenServi || ""),
          direccion: String(x.direccion || x.direccion1 || ""),
          estado: String(x.estado || ""),
          tramo: resolveTramoBase(String(x.fSoliHm || ""), String(x.fechaFinVisiHm || "")),
          horaEnCamino: String(x.horaEnCamino || ""),
          horaInicio: String(x.fechaIniVisiHm || x.horaInicio || ""),
          horaFin: String(x.fechaFinVisiHm || x.horaFin || ""),
          tipoServicio: String(x.tipoTraba || x.tipoOrden || ""),
          lat,
          lng,
          _raw: x,
        };
      })
      .filter((r) => !isGarantia(r._raw))
      .filter((r) => r.lat !== null && r.lng !== null)
      .map(({ _raw, ...clean }) => clean);

    return NextResponse.json({ ok: true, ymd, items: rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
