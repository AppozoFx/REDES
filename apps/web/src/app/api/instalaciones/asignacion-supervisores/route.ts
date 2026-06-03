import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";
import { canManageSupervisores } from "@/domain/supervisores/access";
import { getAsignacionSupervisoresData } from "@/lib/supervisorAsignacion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AssignMap = Record<string, string[]>;

function shortName(full: string, fallback: string) {
  const parts = String(full || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = parts[0] || "";
  const firstLast = parts.length >= 4 ? parts[2] || "" : parts[1] || "";
  return `${first} ${firstLast}`.trim() || fallback;
}

function normalizeUpperList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.map((value) => String(value || "").toUpperCase()).filter(Boolean);
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
  Object.entries(map || {}).forEach(([supervisor, cuadIds]) => {
    (cuadIds || []).forEach((cid) => {
      const key = String(cid || "").trim();
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
    .filter((row) => normalizeUpperList(row.access?.areas).includes("INSTALACIONES"))
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

async function listCuadrillasOptions() {
  const snap = await adminDb()
    .collection("cuadrillas")
    .where("area", "==", "INSTALACIONES")
    .where("estado", "==", "HABILITADO")
    .get();

  return snap.docs
    .map((doc) => ({ value: doc.id, label: String((doc.data() as any)?.nombre || doc.id) }))
    .sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
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

    const [asignacion, supervisores, cuadrillas] = await Promise.all([
      getAsignacionSupervisoresData(fecha),
      listSupervisoresOptions(),
      listCuadrillasOptions(),
    ]);

    return NextResponse.json({
      ok: true,
      fecha,
      supervisores,
      cuadrillas,
      base: asignacion.base,
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
    const tipo = String(body?.tipo || "").trim();
    const fecha = String(body?.fecha || "").trim();
    const supervisoresMap = normalizeAssignMap(body?.supervisoresMap);

    if (!["base", "dia"].includes(tipo)) {
      return NextResponse.json({ ok: false, error: "INVALID_TIPO" }, { status: 400 });
    }
    if (!fecha) return NextResponse.json({ ok: false, error: "MISSING_FECHA" }, { status: 400 });

    const dup = validarDuplicados(supervisoresMap);
    if (dup) return NextResponse.json({ ok: false, error: "DUPLICATE_CUADRILLAS" }, { status: 400 });

    const db = adminDb();
    const actorNombre = await getActorNombre(session.uid);

    if (tipo === "base") {
      await db.collection("asignacion_supervisores_base").doc("base").set(
        {
          supervisoresMap,
          updatedAt: new Date().toISOString(),
          updatedBy: session.uid,
          updatedByNombre: actorNombre,
        },
        { merge: true }
      );

      await db.collection("auditoria").add({
        modulo: "ASIGNACION_SUPERVISORES",
        accion: "BASE_UPDATE",
        fecha,
        actorUid: session.uid,
        actorNombre,
        createdAt: new Date().toISOString(),
      });

      return NextResponse.json({ ok: true });
    }

    const ref = db.collection("asignacion_supervisores_dia").doc(fecha);
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
      modulo: "ASIGNACION_SUPERVISORES",
      accion: "DIA_UPDATE",
      fecha,
      actorUid: session.uid,
      actorNombre,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
