import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

type Row = {
  id: string;
  ordenId: string;
  cliente: string;
  direccion: string;
  plan: string;
  codiSeguiClien: string;
  coordinador: string;
  cuadrillaId: string;
  cuadrillaNombre: string;
  fechaFinVisiYmd: string;
  fechaFinVisiHm: string;
  tipo: string;
  tipoTraba: string;
  estado: string;
  idenServi: string;
  cantMESHwin: string;
  cantFONOwin: string;
  cantBOXwin: string;
  liquidado: boolean;
};

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function cuadrillaSegmentPriority(cuadrillaId: string, cuadrillaNombre: string) {
  const raw = `${cuadrillaId} ${cuadrillaNombre}`.toUpperCase();
  if (raw.includes("RESIDENCIAL")) return 0;
  if (raw.includes("MOTO")) return 1;
  return 2;
}

function cuadrillaNumber(cuadrillaId: string, cuadrillaNombre: string) {
  const raw = `${cuadrillaId} ${cuadrillaNombre}`.toUpperCase();
  const m = raw.match(/K\s*(\d+)/i);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

function tramoFromHm(hm: string) {
  const hour = Number(String(hm || "").split(":")[0]);
  if (!Number.isFinite(hour)) return 99;
  if (hour < 10) return 8;
  if (hour < 14) return 12;
  return 16;
}

function tramoPriority(tramo: number) {
  if (tramo === 8) return 0;
  if (tramo === 12) return 1;
  if (tramo === 16) return 2;
  return 3;
}

function sortRows(rows: Row[]) {
  return rows.sort((a, b) => {
    const segA = cuadrillaSegmentPriority(a.cuadrillaId, a.cuadrillaNombre);
    const segB = cuadrillaSegmentPriority(b.cuadrillaId, b.cuadrillaNombre);
    if (segA !== segB) return segA - segB;

    const nA = cuadrillaNumber(a.cuadrillaId, a.cuadrillaNombre);
    const nB = cuadrillaNumber(b.cuadrillaId, b.cuadrillaNombre);
    if (nA !== nB) return nA - nB;

    const tA = tramoPriority(tramoFromHm(a.fechaFinVisiHm));
    const tB = tramoPriority(tramoFromHm(b.fechaFinVisiHm));
    if (tA !== tB) return tA - tB;

    const hmCmp = String(a.fechaFinVisiHm || "").localeCompare(String(b.fechaFinVisiHm || ""));
    if (hmCmp !== 0) return hmCmp;

    return a.ordenId.localeCompare(b.ordenId);
  });
}

function isFinalizada(estado: string) {
  const e = String(estado || "").trim().toUpperCase();
  return e === "FINALIZADA";
}

function shortName(name: string) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  const first = parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  return last ? `${first} ${last}` : first;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });

    const allowed = session.isAdmin || session.permissions.includes("ORDENES_LIQUIDAR");
    if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const ymd = String(searchParams.get("ymd") || todayLimaYmd());

    const snap = await adminDb()
      .collection("ordenes")
      .where("fechaFinVisiYmd", "==", ymd)
      .limit(400)
      .get();

    const allRows: Row[] = snap.docs
      .map((d) => {
        const x = d.data() as any;
        return {
          id: d.id,
          ordenId: String(x.ordenId || d.id),
          cliente: String(x.cliente || ""),
          direccion: String(x.direccion || x.direccion1 || ""),
          plan: String(x.plan || x.idenServi || ""),
          codiSeguiClien: String(x.codiSeguiClien || ""),
          coordinador: String(
            x.coordinadorCuadrilla || x.coordinador || x.gestorCuadrilla || ""
          ),
          cuadrillaId: String(x.cuadrillaId || ""),
          cuadrillaNombre: String(x.cuadrillaNombre || ""),
          fechaFinVisiYmd: String(x.fechaFinVisiYmd || ""),
          fechaFinVisiHm: String(x.fechaFinVisiHm || ""),
          tipo: String(x.tipo || ""),
          tipoTraba: String(x.tipoTraba || ""),
          estado: String(x.estado || ""),
          idenServi: String(x.idenServi || ""),
          cantMESHwin: String(x.cantMESHwin || "0"),
          cantFONOwin: String(x.cantFONOwin || "0"),
          cantBOXwin: String(x.cantBOXwin || "0"),
          liquidado: String(x?.liquidacion?.estado || "").toUpperCase() === "LIQUIDADO" || !!x?.liquidadoAt,
        };
      })
      .filter((r) => !!r.cuadrillaId)
      .filter((r) => {
        const hayGarantia = `${r.tipo} ${r.tipoTraba} ${r.idenServi} ${r.estado}`.toUpperCase().includes("GARANTIA");
        return !hayGarantia;
      })
      .filter((r) => isFinalizada(r.estado));

    const coordinatorKeys = Array.from(new Set(allRows.map((r) => String(r.coordinador || "").trim()).filter(Boolean)));
    const userRefs = coordinatorKeys.map((uid) => adminDb().collection("usuarios").doc(uid));
    const userSnaps = coordinatorKeys.length ? await adminDb().getAll(...userRefs) : [];
    const coordinatorMap = new Map(
      userSnaps.map((s, i) => {
        const fallback = coordinatorKeys[i] || s.id;
        const data = s.data() as any;
        const nombres = String(data?.nombres || "").trim();
        const apellidos = String(data?.apellidos || "").trim();
        const full = `${nombres} ${apellidos}`.trim();
        const label = shortName(full || fallback);
        return [fallback, label || fallback];
      })
    );

    const rowsWithCoordinator = allRows.map((r) => ({
      ...r,
      coordinador: coordinatorMap.get(r.coordinador) || shortName(r.coordinador) || r.coordinador,
    }));

    const finalizadas = rowsWithCoordinator.length;
    const liquidadas = rowsWithCoordinator.filter((r) => r.liquidado).length;
    const pendientes = rowsWithCoordinator.filter((r) => !r.liquidado).length;

    return NextResponse.json({
      ok: true,
      items: sortRows(rowsWithCoordinator),
      kpi: { finalizadas, liquidadas, pendientes },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
