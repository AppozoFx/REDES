import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";
import { resolveTramoBase, tramoNombreFromBase } from "@/domain/ordenes/tramo";
import { getAsignacionData } from "@/lib/gestorAsignacion";

export const runtime = "nodejs";
const PERM_VIEW = "ORDENES_LLAMADAS_VIEW";
const PERM_EDIT = "ORDENES_LLAMADAS_EDIT";

type Row = {
  id: string;
  ordenId: string;
  cliente: string;
  codigoCliente: string;
  documento: string;
  plan: string;
  direccion: string;
  telefono: string;
  cuadrillaId: string;
  cuadrillaNombre: string;
  gestorUid: string;
  gestorNombre: string;
  coordinadorUid: string;
  coordinadorNombre: string;
  tipoServicio: string;
  tramoBase: string;
  tramoNombre: string;
  estado: string;
  fechaFinVisiYmd: string;
  fechaFinVisiHm: string;
  horaInicioLlamada: string;
  horaFinLlamada: string;
  estadoLlamada: string;
  observacionLlamada: string;
};
type RawRow = Omit<Row, "gestorNombre" | "coordinadorNombre" | "tramoBase" | "tramoNombre"> & {
  _tipo: string;
  _tipoTraba: string;
  _idenServi: string;
  _estado: string;
};

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
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

function buildCuadrillaToGestorMap(map: Record<string, string[]>): Map<string, string> {
  const out = new Map<string, string>();
  Object.entries(map || {}).forEach(([gestorUid, cuadrillas]) => {
    (cuadrillas || []).forEach((cuadrillaId) => {
      const cid = String(cuadrillaId || "").trim();
      if (!cid) return;
      out.set(cid, String(gestorUid || "").trim());
    });
  });
  return out;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
    const isCoordinatorScope =
      !session.isAdmin && roles.includes("COORDINADOR") && !roles.includes("GESTOR");
    const canEdit =
      !isCoordinatorScope &&
      (session.isAdmin ||
      session.access.roles.includes("GESTOR") ||
      session.permissions.includes(PERM_EDIT));
    const canView =
      canEdit ||
      isCoordinatorScope ||
      session.permissions.includes(PERM_VIEW);
    if (!canView) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    const isPriv = session.isAdmin || roles.includes("GERENCIA") || roles.includes("ALMACEN") || roles.includes("RRHH");

    const { searchParams } = new URL(req.url);
    const ymd = String(searchParams.get("ymd") || todayLimaYmd());
    const asignacion = await getAsignacionData(ymd);
    const hasDayMap = Object.keys(asignacion.day || {}).length > 0;
    const gestorByCuadrilla = buildCuadrillaToGestorMap(hasDayMap ? asignacion.day : asignacion.base);

    const snap = await adminDb()
      .collection("ordenes")
      .where("fSoliYmd", "==", ymd)
      .limit(700)
      .get();

    const rawRows: RawRow[] = snap.docs.map((d) => {
      const x = d.data() as any;
      return {
        id: d.id,
        ordenId: String(x.ordenId || d.id),
        cliente: String(x.cliente || ""),
        codigoCliente: String(x.codiSeguiClien || ""),
        documento: String(x.numeroDocumento || ""),
        plan: String(x.idenServi || ""),
        direccion: String(x.direccion || x.direccion1 || ""),
        telefono: String(x.telefono || ""),
        cuadrillaId: String(x.cuadrillaId || ""),
        cuadrillaNombre: String(x.cuadrillaNombre || ""),
        gestorUid: String(x.gestorCuadrilla || ""),
        coordinadorUid: String(x.coordinadorCuadrilla || ""),
        tipoServicio: String(x.tipoTraba || x.tipoOrden || ""),
        estado: String(x.estado || ""),
        fechaFinVisiYmd: String(x.fSoliYmd || ""),
        fechaFinVisiHm: String(x.fSoliHm || x.fechaFinVisiHm || ""),
        horaInicioLlamada: String(x.horaInicioLlamada || ""),
        horaFinLlamada: String(x.horaFinLlamada || ""),
        estadoLlamada: String(x.estadoLlamada || ""),
        observacionLlamada: String(x.observacionLlamada || ""),
        _tipo: String(x.tipo || ""),
        _tipoTraba: String(x.tipoTraba || ""),
        _idenServi: String(x.idenServi || ""),
        _estado: String(x.estado || ""),
      };
    }).filter((r) => {
      const hayGarantia = `${r._tipo} ${r._tipoTraba} ${r._idenServi} ${r._estado}`.toUpperCase().includes("GARANTIA");
      return !hayGarantia;
    });

    const cuadrillaIds = Array.from(new Set(rawRows.map((r) => r.cuadrillaId).filter(Boolean)));
    const cuadrillaRefs = cuadrillaIds.map((id) => adminDb().collection("cuadrillas").doc(id));
    const cuadrillaSnaps = cuadrillaIds.length ? await adminDb().getAll(...cuadrillaRefs) : [];
    const cuadrillaMap = new Map(
      cuadrillaSnaps.map((s) => {
        const c = s.data() as any;
        return [
          s.id,
          {
            gestorUid: String(c?.gestorUid || ""),
            coordinadorUid: String(c?.coordinadorUid || ""),
            nombre: String(c?.nombre || ""),
          },
        ];
      })
    );

    const resolvedRows = rawRows.map((r) => {
      const cMeta = cuadrillaMap.get(r.cuadrillaId);
      const gestorAsignadoDia = gestorByCuadrilla.get(r.cuadrillaId || "");
      return {
        ...r,
        cuadrillaNombre: cMeta?.nombre || r.cuadrillaNombre || "",
        gestorUid: gestorAsignadoDia || cMeta?.gestorUid || r.gestorUid || "",
        coordinadorUid: cMeta?.coordinadorUid || r.coordinadorUid || "",
      };
    });

    const userUids = Array.from(
      new Set(resolvedRows.flatMap((r) => [r.gestorUid, r.coordinadorUid]).filter(Boolean))
    );
    const userRefs = userUids.map((uid) => adminDb().collection("usuarios").doc(uid));
    const userSnaps = userUids.length ? await adminDb().getAll(...userRefs) : [];
    const userMap = new Map(
      userSnaps.map((s) => {
        const data = s.data() as any;
        const nombres = String(data?.nombres || "").trim();
        const apellidos = String(data?.apellidos || "").trim();
        const full = `${nombres} ${apellidos}`.trim() || s.id;
        return [s.id, shortName(full)];
      })
    );

    const itemsBase: Row[] = resolvedRows.map((r: any) => {
      const { _tipo, _tipoTraba, _idenServi, _estado, ...clean } = r;
      const tramoBase = resolveTramoBase(r.fechaFinVisiHm);
      return {
        ...clean,
        gestorNombre: userMap.get(r.gestorUid) || r.gestorUid || "-",
        coordinadorNombre: userMap.get(r.coordinadorUid) || r.coordinadorUid || "-",
        tramoBase,
        tramoNombre: tramoNombreFromBase(tramoBase),
      };
    });
    const items = isCoordinatorScope
      ? itemsBase.filter((item) => item.coordinadorUid === session.uid)
      : itemsBase;

    const gestores = Array.from(new Map(items.filter((i) => i.gestorUid).map((i) => [i.gestorUid, i.gestorNombre])))
      .map(([uid, nombre]) => ({ uid, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    const coordinadores = Array.from(
      new Map(items.filter((i) => i.coordinadorUid).map((i) => [i.coordinadorUid, i.coordinadorNombre]))
    )
      .map(([uid, nombre]) => ({ uid, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    return NextResponse.json({
      ok: true,
      ymd,
      items,
      options: { gestores, coordinadores },
      canEdit,
      scope: {
        isCoordinatorScope,
        viewerCoordinatorUid: isCoordinatorScope ? session.uid : null,
        viewerCoordinatorNombre:
          isCoordinatorScope ? coordinadores.find((item) => item.uid === session.uid)?.nombre || session.uid : null,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
