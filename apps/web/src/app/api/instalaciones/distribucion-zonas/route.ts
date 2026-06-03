import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";
import {
  PERM_SUPERVISORES_MANAGE,
  PERM_SUPERVISORES_VIEW,
} from "@/domain/supervisores/access";
import { resolveTramoBase } from "@/domain/ordenes/tramo";
import { getAsignacionSupervisoresData } from "@/lib/supervisorAsignacion";
import { getAsignacionSupervisoresZonasData } from "@/lib/supervisorZonasAsignacion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SupervisorZoneRow = {
  uid: string;
  nombre: string;
  cuadrillaIds: string[];
  zonasIds: string[];
  ordenesTotal: number;
  ordenesGeo: number;
};

type ZoneRow = {
  id: string;
  nombre: string;
  zona: string;
  tipo: string;
  distritos: string[];
  supervisorUids: string[];
  supervisorNombres: string[];
  cuadrillaIds: string[];
  cuadrillaNombres: string[];
  ordenesTotal: number;
  ordenesGeo: number;
};

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function normalizeText(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function firstShortName(full: string, fallback: string) {
  const parts = String(full || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = parts[0] || "";
  const firstLast = parts.length >= 4 ? parts[2] || "" : parts[1] || "";
  return `${first} ${firstLast}`.trim() || fallback;
}

function isGarantia(x: any) {
  const txt = `${String(x?.tipo || "")} ${String(x?.tipoTraba || "")} ${String(x?.idenServi || "")} ${String(x?.tipoServicio || "")} ${String(x?.estado || "")}`.toUpperCase();
  return txt.includes("GARANTIA");
}

function normalizedEstado(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeZoneKey(value: unknown) {
  return normalizeText(value).replace(/^REGION\s+/, "");
}

function buildZoneAliases(zone: any) {
  const aliases = new Set<string>();
  const zona = normalizeZoneKey(zone?.zona);
  const nombre = normalizeZoneKey(zone?.nombre);
  if (zona) aliases.add(zona);
  if (nombre) aliases.add(nombre);
  return Array.from(aliases);
}

function resolveZoneByRegion(order: any, zonasByRegion: Map<string, string[]>) {
  const region = normalizeZoneKey(order?.region || "");
  if (!region) return { zonaId: "", source: "" };

  const exact = zonasByRegion.get(region) || [];
  if (exact.length === 1) return { zonaId: exact[0], source: "REGION" };
  if (exact.length > 1) return { zonaId: "", source: "REGION_AMBIGUA" };

  const partialMatches = Array.from(zonasByRegion.keys()).filter((key) => key && region.includes(key));
  if (partialMatches.length === 1) {
    const zoneId = (zonasByRegion.get(partialMatches[0]) || [])[0] || "";
    return { zonaId: zoneId, source: "REGION" };
  }
  if (partialMatches.length > 1) return { zonaId: "", source: "REGION_AMBIGUA" };
  return { zonaId: "", source: "" };
}

function canUsePage(session: NonNullable<Awaited<ReturnType<typeof getServerSession>>>) {
  const roles = (session.access.roles || []).map((role) => String(role || "").toUpperCase());
  return (
    session.isAdmin ||
    roles.includes("GERENCIA") ||
    roles.includes("JEFATURA") ||
    roles.includes("SUPERVISOR") ||
    session.permissions.includes(PERM_SUPERVISORES_VIEW) ||
    session.permissions.includes(PERM_SUPERVISORES_MANAGE)
  );
}

function canViewAll(session: NonNullable<Awaited<ReturnType<typeof getServerSession>>>) {
  const roles = (session.access.roles || []).map((role) => String(role || "").toUpperCase());
  return (
    session.isAdmin ||
    roles.includes("GERENCIA") ||
    roles.includes("JEFATURA") ||
    session.permissions.includes(PERM_SUPERVISORES_MANAGE)
  );
}

async function getProfileNames(uids: string[]) {
  const unique = Array.from(new Set(uids.filter(Boolean)));
  const refs = unique.map((uid) => adminDb().collection("usuarios").doc(uid));
  const snaps = refs.length ? await adminDb().getAll(...refs) : [];
  const out = new Map<string, string>();
  snaps.forEach((snap) => {
    const data = snap.exists ? (snap.data() as any) : {};
    const full = `${String(data?.nombres || "").trim()} ${String(data?.apellidos || "").trim()}`.trim();
    out.set(snap.id, firstShortName(full, snap.id));
  });
  return out;
}

function resolveOrderZoneId(
  order: any
) {
  const region = normalizeZoneKey(order?.region || "");
  if (region) return { zonaId: region, source: "REGION" };

  const distrito = normalizeText(order?.zonaDistrito || order?.distrito || "");
  if (distrito) return { zonaId: distrito, source: "DISTRITO" };

  return { zonaId: "", source: "SIN_ZONA" };
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    if (!canUsePage(session)) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const ymd = String(searchParams.get("ymd") || todayLimaYmd()).trim();
    const db = adminDb();

    const [legacyAsignacion, zonasAsignacion, cuadrillasSnap, ordersSnap1, ordersSnap2] = await Promise.all([
      getAsignacionSupervisoresData(ymd),
      getAsignacionSupervisoresZonasData(ymd),
      db.collection("cuadrillas").where("area", "==", "INSTALACIONES").get(),
      db.collection("ordenes").where("fSoliYmd", "==", ymd).limit(5000).get(),
      db.collection("ordenes").where("fechaFinVisiYmd", "==", ymd).limit(5000).get(),
    ]);

    const zoneAssignmentActive = Object.keys(zonasAsignacion.day || {}).length > 0;
    const legacyMode = Object.keys(legacyAsignacion.day || {}).length ? "DIA" : "BASE";
    const mode = zoneAssignmentActive ? "ZONA" : legacyMode;

    let selectedLegacyMap = legacyMode === "DIA" ? legacyAsignacion.day : legacyAsignacion.base;
    let selectedZonaMap = zoneAssignmentActive ? zonasAsignacion.day : {};
    if (!canViewAll(session)) {
      selectedLegacyMap = { [session.uid]: selectedLegacyMap[session.uid] || [] };
      selectedZonaMap = { [session.uid]: selectedZonaMap[session.uid] || [] };
    }

    const supervisorUids = Array.from(
      new Set([...Object.keys(selectedLegacyMap || {}), ...Object.keys(selectedZonaMap || {})].filter(Boolean))
    );
    const profileNames = await getProfileNames(supervisorUids);

    const cuadrillaById = new Map<string, any>();
    cuadrillasSnap.docs.forEach((doc) => {
      cuadrillaById.set(doc.id, { id: doc.id, ...(doc.data() as any) });
    });

    const supervisorByCuadrilla = new Map<string, string>();
    const supervisorsByZona = new Map<string, Set<string>>();
    const supervisorRows = new Map<string, SupervisorZoneRow>();

    supervisorUids.forEach((uid) => {
      const cuadrillaIds = Array.from(new Set((selectedLegacyMap[uid] || []).map((id) => String(id || "").trim()).filter(Boolean)));
      const zonasIds = Array.from(new Set((selectedZonaMap[uid] || []).map((id) => String(id || "").trim()).filter(Boolean)));
      cuadrillaIds.forEach((cuadrillaId) => {
        supervisorByCuadrilla.set(cuadrillaId, uid);
      });
      zonasIds.forEach((zonaId) => {
        const supervisors = supervisorsByZona.get(zonaId) || new Set<string>();
        supervisors.add(uid);
        supervisorsByZona.set(zonaId, supervisors);
      });
      supervisorRows.set(uid, {
        uid,
        nombre: profileNames.get(uid) || uid,
        cuadrillaIds,
        zonasIds,
        ordenesTotal: 0,
        ordenesGeo: 0,
      });
    });

    const docsById = new Map<string, any>();
    for (const doc of [...ordersSnap1.docs, ...ordersSnap2.docs]) docsById.set(doc.id, doc.data());

    const zonasRows = new Map<string, ZoneRow>();
    const zonaDetails = new Map<
      string,
      {
        id: string;
        nombre: string;
        zona: string;
        tipo: string;
        distritos: Set<string>;
        supervisorUids: Set<string>;
        cuadrillaIds: Set<string>;
        ordenesTotal: number;
        ordenesGeo: number;
      }
    >();

    function getZonaDetail(id: string, displayName: string) {
      const existing = zonaDetails.get(id);
      if (existing) {
        if (!existing.nombre && displayName) existing.nombre = displayName;
        return existing;
      }
      const created = {
        id,
        nombre: displayName || id,
        zona: displayName || id,
        tipo: "REGION",
        distritos: new Set<string>(),
        supervisorUids: new Set<string>(),
        cuadrillaIds: new Set<string>(),
        ordenesTotal: 0,
        ordenesGeo: 0,
      };
      zonaDetails.set(id, created);
      return created;
    }

    const orders = Array.from(docsById.entries())
      .map(([id, order]) => {
        if (isGarantia(order)) return null;
        const fSoliYmd = String(order?.fSoliYmd || "").trim();
        const fechaFinVisiYmd = String(order?.fechaFinVisiYmd || "").trim();
        if (fSoliYmd !== ymd && fechaFinVisiYmd !== ymd) return null;

        const cuadrillaId = String(order?.cuadrillaId || "").trim();
        const cuadrilla = cuadrillaId ? cuadrillaById.get(cuadrillaId) : null;
        const zonaResolved = resolveOrderZoneId(order);
        const zonaId = zonaResolved.zonaId;
        const regionLabel = String(order?.region || "").trim() || zonaId;
        const distritoLabel = String(order?.zonaDistrito || order?.distrito || "").trim();
        const zonaSource = zonaResolved.source;

        let supervisorUid = "";
        let supervisorStatus = "SIN_SUPERVISOR";

        if (zonaId) {
          const zoneSupervisors = Array.from(supervisorsByZona.get(zonaId) || []);
          if (zoneSupervisors.length === 1) {
            supervisorUid = zoneSupervisors[0];
            supervisorStatus = "ASIGNADO_REGION";
          } else if (zoneSupervisors.length > 1) {
            supervisorStatus = "CONFLICTO_REGION";
          }
        }

        if (!supervisorUid && cuadrillaId) {
          supervisorUid = supervisorByCuadrilla.get(cuadrillaId) || "";
          if (supervisorUid) supervisorStatus = "ASIGNADO_CUADRILLA";
        }

        if (!canViewAll(session) && supervisorUid !== session.uid) return null;

        const lat = toNum(order?.lat);
        const lng = toNum(order?.lng);
        const hasGeo = lat !== null && lng !== null;
        const supervisor = supervisorUid ? supervisorRows.get(supervisorUid) : null;
        if (supervisor) {
          supervisor.ordenesTotal += 1;
          if (hasGeo) supervisor.ordenesGeo += 1;
        }
        if (zonaId) {
          const z = getZonaDetail(zonaId, regionLabel);
          if (distritoLabel) z.distritos.add(distritoLabel);
          if (supervisorUid) z.supervisorUids.add(supervisorUid);
          if (cuadrillaId) z.cuadrillaIds.add(cuadrillaId);
          z.ordenesTotal += 1;
          if (hasGeo) z.ordenesGeo += 1;
        }

        return {
          id,
          ordenId: String(order?.ordenId || id),
          cliente: String(order?.cliente || "").trim(),
          codigoCliente: String(order?.codiSeguiClien || "").trim(),
          estado: String(order?.estado || "").trim(),
          estadoNorm: normalizedEstado(order?.estado),
          direccion: String(order?.direccion || order?.direccion1 || "").trim(),
          plan: String(order?.idenServi || "").trim(),
          tramo: resolveTramoBase(String(order?.fSoliHm || "")),
          horaEnCamino: String(order?.horaEnCamino || "").trim(),
          horaInicio: String(order?.fechaIniVisiHm || order?.horaInicio || "").trim(),
          horaFin: String(order?.fechaFinVisiHm || order?.horaFin || "").trim(),
          tipoServicio: String(order?.tipoTraba || order?.tipoOrden || "").trim(),
          region: String(order?.region || "").trim(),
          distrito: distritoLabel,
          hora: String(order?.fSoliHm || order?.fechaFinVisiHm || "").trim(),
          cuadrillaId,
          cuadrillaNombre: String(order?.cuadrillaNombre || cuadrilla?.nombre || cuadrillaId || "").trim(),
          zonaId,
          zonaNombre: String(regionLabel || zonaId || "").trim(),
          zonaSource,
          supervisorUid,
          supervisorNombre: supervisorUid ? profileNames.get(supervisorUid) || supervisorUid : "",
          supervisorStatus,
          lat,
          lng,
        };
      })
      .filter(Boolean);

    const statusCounts = orders.reduce<Record<string, number>>((acc, row: any) => {
      const key = String(row.supervisorStatus || "SIN_SUPERVISOR");
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    zonaDetails.forEach((row) => {
      const supervisorUidsForZona = Array.from(row.supervisorUids || []);
      const cuadrillaIds = Array.from(row.cuadrillaIds || []);
      zonasRows.set(row.id, {
        id: row.id,
        nombre: row.nombre,
        zona: row.zona,
        tipo: row.tipo,
        distritos: Array.from(row.distritos).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" })),
        supervisorUids: supervisorUidsForZona,
        supervisorNombres: supervisorUidsForZona.map((uid) => profileNames.get(uid) || uid),
        cuadrillaIds,
        cuadrillaNombres: cuadrillaIds.map((cid) => String(cuadrillaById.get(cid)?.nombre || cid)),
        ordenesTotal: row.ordenesTotal,
        ordenesGeo: row.ordenesGeo,
      });
    });

    return NextResponse.json({
      ok: true,
      ymd,
      mode,
      supervisores: Array.from(supervisorRows.values()).sort((a, b) =>
        a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })
      ),
      zonas: Array.from(zonasRows.values())
        .filter((row) => row.supervisorUids.length > 0 || row.ordenesTotal > 0)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })),
      ordenes: orders,
      statusCounts,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
