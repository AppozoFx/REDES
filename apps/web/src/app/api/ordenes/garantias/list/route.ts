import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";
import { resolveTramoNombre } from "@/domain/ordenes/tramo";

export const runtime = "nodejs";

const PERM_VIEW = "ORDENES_GARANTIAS_VIEW";
const PERM_EDIT = "ORDENES_GARANTIAS_EDIT";

type Row = {
  id: string;
  ordenId: string;
  fechaGarantiaYmd: string;
  cliente: string;
  codigoCliente: string;
  plan: string;
  direccion: string;
  cuadrilla: string;
  tipoServicio: string;
  tramo: string;
  estado: string;
  horaInicio: string;
  horaFin: string;
  motivoCancelacion: string;
  coordinadorUid: string;
  coordinadorNombre: string;
  motivoGarantia: string;
  diagnosticoGarantia: string;
  solucionGarantia: string;
  responsableGarantia: string;
  casoGarantia: string;
  imputadoGarantia: string;
  fechaInstalacionBase: string;
  diasDesdeInstalacion: number | null;
};

function todayLimaYm() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function shortName(name: string) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  const first = parts[0];
  const firstLast = parts.length >= 4 ? parts[2] || "" : parts[1] || "";
  return `${first} ${firstLast}`.trim() || first;
}

function isGarantia(x: any) {
  const txt = `${String(x?.tipo || "")} ${String(x?.tipoTraba || "")} ${String(x?.idenServi || "")} ${String(x?.tipoServicio || "")} ${String(x?.estado || "")}`.toUpperCase();
  return txt.includes("GARANTIA");
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }

    const canEdit = session.isAdmin || session.permissions.includes(PERM_EDIT);
    const canView = canEdit || session.permissions.includes(PERM_VIEW);
    if (!canView) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
    const isPriv = session.isAdmin || roles.includes("GERENCIA") || roles.includes("ALMACEN") || roles.includes("RRHH");

    const { searchParams } = new URL(req.url);
    const ym = String(searchParams.get("ym") || todayLimaYm()); // YYYY-MM
    const startYmd = `${ym}-01`;
    const endYmd = `${ym}-31`;

    const snap = await adminDb()
      .collection("ordenes")
      .where("fSoliYmd", ">=", startYmd)
      .where("fSoliYmd", "<=", endYmd)
      .limit(1500)
      .get();

    let docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));


    const onlyGarantias = docs.filter((x) => isGarantia(x));
    const finalizadasSinGarantia = docs.filter((x) => !isGarantia(x) && String(x?.estado || "").trim().toUpperCase() === "FINALIZADA").length;

    const coordUids = Array.from(new Set(onlyGarantias.map((x) => String(x.coordinadorCuadrilla || "")).filter(Boolean)));
    const coordRefs = coordUids.map((uid) => adminDb().collection("usuarios").doc(uid));
    const coordSnaps = coordUids.length ? await adminDb().getAll(...coordRefs) : [];
    const coordMap = new Map(
      coordSnaps.map((s) => {
        const d = s.data() as any;
        const full = `${String(d?.nombres || "").trim()} ${String(d?.apellidos || "").trim()}`.trim() || s.id;
        return [s.id, shortName(full)];
      })
    );

    const items: Row[] = onlyGarantias.map((x: any) => ({
      id: String(x.id || x.ordenId || ""),
      ordenId: String(x.ordenId || x.id || ""),
      fechaGarantiaYmd: String(x.fSoliYmd || ""),
      cliente: String(x.cliente || ""),
      codigoCliente: String(x.codiSeguiClien || ""),
      plan: String(x.idenServi || ""),
      direccion: String(x.direccion || x.direccion1 || ""),
      cuadrilla: String(x.cuadrillaNombre || x.cuadrillaId || ""),
      tipoServicio: String(x.tipoTraba || x.tipoOrden || ""),
      tramo: resolveTramoNombre(String(x.fSoliHm || ""), String(x.fechaFinVisiHm || "")),
      estado: String(x.estado || ""),
      horaInicio: String(x.horaInicio || ""),
      horaFin: String(x.horaFin || ""),
      motivoCancelacion: String(x.motivoCancelacion || ""),
      coordinadorUid: String(x.coordinadorCuadrilla || ""),
      coordinadorNombre: coordMap.get(String(x.coordinadorCuadrilla || "")) || String(x.coordinadorCuadrilla || "-"),
      motivoGarantia: String(x.motivoGarantia || ""),
      diagnosticoGarantia: String(x.diagnosticoGarantia || ""),
      solucionGarantia: String(x.solucionGarantia || ""),
      responsableGarantia: String(x.responsableGarantia || ""),
      casoGarantia: String(x.casoGarantia || ""),
      imputadoGarantia: String(x.imputadoGarantia || ""),
      fechaInstalacionBase: String(x.fechaInstalacionBase || ""),
      diasDesdeInstalacion: typeof x.diasDesdeInstalacion === "number" ? x.diasDesdeInstalacion : null,
    }));

    const coordinadores = Array.from(new Map(items.filter((i) => i.coordinadorUid).map((i) => [i.coordinadorUid, i.coordinadorNombre])))
      .map(([uid, nombre]) => ({ uid, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    return NextResponse.json({
      ok: true,
      ym,
      canEdit,
      items,
      options: { coordinadores },
      stats: { finalizadasSinGarantia },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
