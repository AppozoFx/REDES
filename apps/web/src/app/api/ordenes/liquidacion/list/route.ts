import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";
import { resolveTramoBase } from "@/domain/ordenes/tramo";

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
  fSoliHm: string;
  tipo: string;
  tipoTraba: string;
  estado: string;
  idenServi: string;
  cantMESHwin: string;
  cantFONOwin: string;
  cantBOXwin: string;
  liquidado: boolean;
  correccionPendiente?: boolean;
  correccionBy?: string;
  correccionYmd?: string;
  rotuloNapCto?: string;
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

function tramoPriority(tramoBase: string) {
  if (tramoBase === "08:00") return 0;
  if (tramoBase === "12:00") return 1;
  if (tramoBase === "16:00") return 2;
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

    const tA = tramoPriority(resolveTramoBase(a.fSoliHm, a.fechaFinVisiHm));
    const tB = tramoPriority(resolveTramoBase(b.fSoliHm, b.fechaFinVisiHm));
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
  const firstLast = parts.length >= 4 ? parts[2] || "" : parts[1] || "";
  return `${first} ${firstLast}`.trim() || first;
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

    const allRowsBase: Row[] = snap.docs
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
          fechaFinVisiHm: String(x.fechaFinVisiHm || x.fSoliHm || ""),
          fSoliHm: String(x.fSoliHm || ""),
          tipo: String(x.tipo || ""),
          tipoTraba: String(x.tipoTraba || ""),
          estado: String(x.estado || ""),
          idenServi: String(x.idenServi || ""),
          cantMESHwin: String(x.cantMESHwin || "0"),
          cantFONOwin: String(x.cantFONOwin || "0"),
          cantBOXwin: String(x.cantBOXwin || "0"),
          correccionPendiente: !!x?.correccionPendiente,
          correccionBy: String(x?.correccionBy || ""),
          correccionYmd: String(x?.correccionYmd || ""),
          rotuloNapCto: String(x?.liquidacion?.rotuloNapCto || ""),
          liquidado:
            (String(x?.liquidacion?.estado || "").toUpperCase() === "LIQUIDADO" || !!x?.liquidadoAt) &&
            !x?.correccionPendiente,
        };
      })
      .filter((r) => !!r.cuadrillaId)
      .filter((r) => {
        const hayGarantia = `${r.tipo} ${r.tipoTraba} ${r.idenServi} ${r.estado}`.toUpperCase().includes("GARANTIA");
        return !hayGarantia;
      })
      .filter((r) => isFinalizada(r.estado));

    // En migraciones historicas se liquida en `instalaciones` sin tocar `ordenes`.
    // Cruzamos por codigo de cliente para reflejar estado liquidado/correccion en esta vista.
    const codigos = Array.from(
      new Set(
        allRowsBase
          .map((r) => String(r.codiSeguiClien || "").trim())
          .filter(Boolean)
      )
    );
    const instRefs = codigos.map((c) => adminDb().collection("instalaciones").doc(c));
    const instSnaps = codigos.length ? await adminDb().getAll(...instRefs) : [];
    const instMap = new Map(
      instSnaps
        .filter((s) => s.exists)
        .map((s) => [s.id, (s.data() as any) || {}])
    );

    const allRows: Row[] = allRowsBase.map((r) => {
      const key = String(r.codiSeguiClien || "").trim();
      const inst = key ? instMap.get(key) : null;
      if (!inst) return r;

      const instCorr = !!inst?.correccionPendiente;
      const instLiqEstado = String(inst?.liquidacion?.estado || "").toUpperCase();
      const instLiqAt = !!inst?.liquidacion?.at;
      const instLiquidado = (instLiqEstado === "LIQUIDADO" || instLiqAt) && !instCorr;

      return {
        ...r,
        correccionPendiente: r.correccionPendiente || instCorr,
        correccionBy: r.correccionBy || String(inst?.correccionBy || ""),
        correccionYmd: r.correccionYmd || String(inst?.correccionYmd || ""),
        rotuloNapCto:
          r.rotuloNapCto ||
          String(inst?.liquidacion?.rotuloNapCto || ""),
        liquidado: r.liquidado || instLiquidado,
      };
    });

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

    const corrKeys = Array.from(new Set(allRows.map((r) => String(r.correccionBy || "").trim()).filter(Boolean)));
    const corrRefs = corrKeys.map((uid) => adminDb().collection("usuarios").doc(uid));
    const corrSnaps = corrKeys.length ? await adminDb().getAll(...corrRefs) : [];
    const corrMap = new Map(
      corrSnaps.map((s, i) => {
        const fallback = corrKeys[i] || s.id;
        const data = s.data() as any;
        const nombres = String(data?.nombres || "").trim();
        const apellidos = String(data?.apellidos || "").trim();
        const full = `${nombres} ${apellidos}`.trim();
        const label = shortName(full || fallback);
        return [fallback, label || fallback];
      })
    );

    const rowsWithCorreccion = rowsWithCoordinator.map((r) => ({
      ...r,
      correccionBy: r.correccionBy ? corrMap.get(r.correccionBy) || r.correccionBy : "",
    }));

    const finalizadas = rowsWithCorreccion.length;
    const liquidadas = rowsWithCorreccion.filter((r) => r.liquidado).length;
    const pendientes = rowsWithCorreccion.filter((r) => !r.liquidado).length;

    return NextResponse.json({
      ok: true,
      items: sortRows(rowsWithCorreccion),
      kpi: { finalizadas, liquidadas, pendientes },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
