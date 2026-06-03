import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";
import { canManageSupervisores } from "@/domain/supervisores/access";
import { getAsignacionSupervisoresZonasData } from "@/lib/supervisorZonasAsignacion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AssignMap = Record<string, string[]>;

type SupervisorRow = {
  value: string;
  label: string;
};

type ZoneRow = {
  id: string;
  nombre: string;
  familia: string;
  distritos: string[];
  ordenesTotal: number;
  ordenesGeo: number;
  cuadrillaIds: string[];
  cuadrillaNombres: string[];
};

function shortName(full: string, fallback: string) {
  const parts = String(full || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = parts[0] || "";
  const firstLast = parts.length >= 4 ? parts[2] || "" : parts[1] || "";
  return `${first} ${firstLast}`.trim() || fallback;
}

function normalizeText(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function normalizeRegion(value: unknown) {
  return normalizeText(value).replace(/^REGION\s+/, "").trim();
}

function regionFamily(value: string) {
  const raw = normalizeRegion(value);
  if (!raw) return "";
  if (raw.includes("NORTE")) return "NORTE";
  if (raw.includes("CENTRO")) return "CENTRO";
  if (raw.includes("OESTE")) return "OESTE";
  if (raw.includes("ESTE")) return "ESTE";
  if (raw.includes("SUR")) return "SUR";
  return raw.split(" ")[0] || raw;
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function normalizeAssignMap(map: unknown): AssignMap {
  const out: AssignMap = {};
  Object.entries((map || {}) as Record<string, unknown>).forEach(([uid, rawList]) => {
    const cleanUid = String(uid || "").trim();
    if (!cleanUid) return;
    const ids = Array.isArray(rawList)
      ? rawList.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    out[cleanUid] = Array.from(new Set(ids));
  });
  return out;
}

function validarDuplicados(map: AssignMap) {
  const used = new Map<string, string[]>();
  Object.entries(map || {}).forEach(([supervisor, zoneIds]) => {
    (zoneIds || []).forEach((id) => {
      const key = String(id || "").trim();
      if (!key) return;
      const arr = used.get(key) || [];
      arr.push(supervisor);
      used.set(key, arr);
    });
  });
  const dup = Array.from(used.entries()).filter(([, owners]) => owners.length > 1);
  return dup.length ? dup : null;
}

async function getActorNombre(uid: string) {
  const snap = await adminDb().collection("usuarios").doc(uid).get();
  const data = snap.exists ? (snap.data() as any) : {};
  return shortName(`${data?.nombres || ""} ${data?.apellidos || ""}`.trim(), uid);
}

async function listSupervisoresOptions() {
  const db = adminDb();
  const [accessSnap, configsSnap] = await Promise.all([
    db.collection("usuarios_access").where("roles", "array-contains", "SUPERVISOR").get(),
    db.collection("supervisores").get().catch(() => null),
  ]);

  const configByUid = new Map<string, any>();
  configsSnap?.docs.forEach((doc) => configByUid.set(doc.id, doc.data() as any));

  const rows = accessSnap.docs
    .map((doc) => ({ uid: doc.id, access: (doc.data() as any) || {}, config: configByUid.get(doc.id) }))
    .filter((row) => String(row.access?.estadoAcceso || "").toUpperCase() === "HABILITADO")
    .filter((row) => String(row.config?.estado || "HABILITADO").toUpperCase() !== "INHABILITADO")
    .filter((row) => String(row.config?.area || "INSTALACIONES").toUpperCase() === "INSTALACIONES");

  const refs = rows.map((row) => db.collection("usuarios").doc(row.uid));
  const snaps = refs.length ? await db.getAll(...refs) : [];
  const profileByUid = new Map(snaps.map((snap) => [snap.id, snap.exists ? (snap.data() as any) : {}]));

  return rows
    .map((row) => {
      const profile = profileByUid.get(row.uid) || {};
      const full = `${String(profile?.nombres || "").trim()} ${String(profile?.apellidos || "").trim()}`.trim();
      return { value: row.uid, label: shortName(full, row.uid) };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
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
    if (!canManageSupervisores(session)) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const fecha = String(searchParams.get("fecha") || "").trim();
    if (!fecha) return NextResponse.json({ ok: false, error: "MISSING_FECHA" }, { status: 400 });

    const db = adminDb();
    const [asignacion, supervisores, ordersSnap1, ordersSnap2, cuadrillasSnap] = await Promise.all([
      getAsignacionSupervisoresZonasData(fecha),
      listSupervisoresOptions(),
      db.collection("ordenes").where("fSoliYmd", "==", fecha).limit(5000).get(),
      db.collection("ordenes").where("fechaFinVisiYmd", "==", fecha).limit(5000).get(),
      db.collection("cuadrillas").where("area", "==", "INSTALACIONES").get(),
    ]);

    const cuadrillaNameMap = new Map<string, string>();
    cuadrillasSnap.docs.forEach((doc) => {
      cuadrillaNameMap.set(doc.id, String((doc.data() as any)?.nombre || doc.id));
    });

    const docsById = new Map<string, any>();
    for (const doc of [...ordersSnap1.docs, ...ordersSnap2.docs]) docsById.set(doc.id, doc.data());

    const zones = new Map<string, Omit<ZoneRow, "cuadrillaIds" | "cuadrillaNombres"> & { cuadrillaSet: Set<string> }>();
    docsById.forEach((order) => {
      if (isGarantia(order)) return;
      const fSoliYmd = String(order?.fSoliYmd || "").trim();
      const fechaFinVisiYmd = String(order?.fechaFinVisiYmd || "").trim();
      if (fSoliYmd !== fecha && fechaFinVisiYmd !== fecha) return;

      const regionLabel = String(order?.region || order?.zonaDistrito || order?.distrito || "").trim();
      const zoneId = normalizeRegion(regionLabel);
      if (!zoneId) return;

      const cuadrillaId = String(order?.cuadrillaId || "").trim();
      const existing = zones.get(zoneId);
      const distrito = String(order?.zonaDistrito || order?.distrito || "").trim();
      const lat = toNum(order?.lat);
      const lng = toNum(order?.lng);

      if (!existing) {
        const cuadrillaSet = new Set<string>();
        if (cuadrillaId) cuadrillaSet.add(cuadrillaId);
        zones.set(zoneId, {
          id: zoneId,
          nombre: regionLabel || zoneId,
          familia: regionFamily(regionLabel || zoneId),
          distritos: distrito ? [distrito] : [],
          ordenesTotal: 1,
          ordenesGeo: lat !== null && lng !== null ? 1 : 0,
          cuadrillaSet,
        });
        return;
      }

      existing.ordenesTotal += 1;
      if (lat !== null && lng !== null) existing.ordenesGeo += 1;
      if (distrito && !existing.distritos.includes(distrito)) existing.distritos.push(distrito);
      if (cuadrillaId) existing.cuadrillaSet.add(cuadrillaId);
    });

    const zonesList: ZoneRow[] = Array.from(zones.values())
      .map(({ cuadrillaSet, ...zone }) => {
        const cuadrillaIds = Array.from(cuadrillaSet).sort();
        return {
          ...zone,
          cuadrillaIds,
          cuadrillaNombres: cuadrillaIds.map((id) => cuadrillaNameMap.get(id) || id),
        };
      })
      .sort((a, b) => {
        const byFamily = a.familia.localeCompare(b.familia, "es", { sensitivity: "base" });
        if (byFamily !== 0) return byFamily;
        return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
      });

    return NextResponse.json({
      ok: true,
      fecha,
      supervisores,
      zonas: zonesList,
      day: asignacion.day,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    if (!canManageSupervisores(session)) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const fecha = String(body?.fecha || "").trim();
    const supervisoresMap = normalizeAssignMap(body?.supervisoresMap);
    if (!fecha) return NextResponse.json({ ok: false, error: "MISSING_FECHA" }, { status: 400 });

    const dup = validarDuplicados(supervisoresMap);
    if (dup) return NextResponse.json({ ok: false, error: "DUPLICATE_ZONAS" }, { status: 400 });

    const db = adminDb();
    const actorNombre = await getActorNombre(session.uid);
    const ref = db.collection("asignacion_supervisores_zona_dia").doc(fecha);
    const prev = await ref.get();
    const createdAt = prev.exists ? (prev.data() as any)?.createdAt || new Date().toISOString() : new Date().toISOString();

    await ref.set(
      {
        fecha,
        supervisoresMap,
        createdAt,
        updatedAt: new Date().toISOString(),
        updatedBy: session.uid,
        updatedByNombre: actorNombre,
      },
      { merge: true }
    );

    await db.collection("auditoria").add({
      modulo: "ASIGNACION_SUPERVISORES_ZONAS",
      accion: "DIA_UPDATE",
      fecha,
      actorUid: session.uid,
      actorNombre,
      createdAt: new Date().toISOString(),
    });

    // Derivar cuadrillas de las órdenes del día y guardar asignación de cuadrillas
    const [ordersSnap1, ordersSnap2] = await Promise.all([
      db.collection("ordenes").where("fSoliYmd", "==", fecha).limit(5000).get(),
      db.collection("ordenes").where("fechaFinVisiYmd", "==", fecha).limit(5000).get(),
    ]);

    const regionCuadrillaMap = new Map<string, Set<string>>();
    const orderDocsById = new Map<string, any>();
    for (const doc of [...ordersSnap1.docs, ...ordersSnap2.docs]) orderDocsById.set(doc.id, doc.data());

    orderDocsById.forEach((order) => {
      if (isGarantia(order)) return;
      const fSoliYmd = String(order?.fSoliYmd || "").trim();
      const fechaFinVisiYmd = String(order?.fechaFinVisiYmd || "").trim();
      if (fSoliYmd !== fecha && fechaFinVisiYmd !== fecha) return;
      const regionId = normalizeRegion(String(order?.region || "").trim());
      const cuadrillaId = String(order?.cuadrillaId || "").trim();
      if (!regionId || !cuadrillaId) return;
      const s = regionCuadrillaMap.get(regionId) || new Set<string>();
      s.add(cuadrillaId);
      regionCuadrillaMap.set(regionId, s);
    });

    const cuadrillasSupervisoresMap: Record<string, string[]> = {};
    Object.entries(supervisoresMap).forEach(([uid, regionIds]) => {
      const cuadSet = new Set<string>();
      (regionIds || []).forEach((rId) => {
        (regionCuadrillaMap.get(rId) || new Set()).forEach((cid) => cuadSet.add(cid));
      });
      cuadrillasSupervisoresMap[uid] = Array.from(cuadSet).sort();
    });

    const cuadRef = db.collection("asignacion_supervisores_dia").doc(fecha);
    const cuadPrev = await cuadRef.get();
    const cuadCreatedAt = cuadPrev.exists
      ? (cuadPrev.data() as any)?.createdAt || new Date().toISOString()
      : new Date().toISOString();

    await cuadRef.set({
      fecha,
      supervisoresMap: cuadrillasSupervisoresMap,
      derivadoDeZonas: true,
      createdAt: cuadCreatedAt,
      updatedAt: new Date().toISOString(),
      updatedBy: session.uid,
      updatedByNombre: actorNombre,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
