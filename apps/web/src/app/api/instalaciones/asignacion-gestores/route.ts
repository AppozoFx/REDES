import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";
import { buildBaseFromCuadrillas, getAsignacionData } from "@/lib/gestorAsignacion";

export const runtime = "nodejs";

function shortName(full: string, fallback: string) {
  const parts = String(full || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = parts[0] || "";
  const firstLast = parts.length >= 4 ? parts[2] || "" : parts[1] || "";
  return `${first} ${firstLast}`.trim() || fallback;
}

function validarDuplicados(map: Record<string, string[]>) {
  const used = new Map<string, string[]>();
  Object.entries(map || {}).forEach(([gestor, cuadIds]) => {
    (cuadIds || []).forEach((cid) => {
      const key = String(cid || "").trim();
      if (!key) return;
      const arr = used.get(key) || [];
      arr.push(gestor);
      used.set(key, arr);
    });
  });
  const dup = Array.from(used.entries()).filter(([, v]) => v.length > 1);
  return dup.length ? dup : null;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
    const canAdmin = session.isAdmin || roles.includes("GERENCIA");
    if (!canAdmin) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const fecha = String(searchParams.get("fecha") || "").trim();
    if (!fecha) return NextResponse.json({ ok: false, error: "MISSING_FECHA" }, { status: 400 });

    const db = adminDb();

    const [cuadrillasSnap, accessSnap, dayData, baseTopSnap] = await Promise.all([
      db.collection("cuadrillas").where("estado", "==", "HABILITADO").get(),
      db.collection("usuarios_access").where("roles", "array-contains", "GESTOR").get(),
      getAsignacionData(fecha),
      db.collection("asignacion_gestores_config").doc("base").get(),
    ]);

    const cuadrillas = cuadrillasSnap.docs
      .map((d) => ({ id: d.id, nombre: String(d.data()?.nombre || d.id) }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));

    const gestorUids = accessSnap.docs.map((d) => d.id);
    const userRefs = gestorUids.map((uid) => db.collection("usuarios").doc(uid));
    const userSnaps = gestorUids.length ? await db.getAll(...userRefs) : [];
    const userMap = new Map(
      userSnaps.map((s) => {
        const data = s.data() as any;
        const nombres = String(data?.nombres || "").trim();
        const apellidos = String(data?.apellidos || "").trim();
        const full = `${nombres} ${apellidos}`.trim() || s.id;
        return [s.id, shortName(full, s.id)];
      })
    );

    const gestores = gestorUids
      .map((uid) => ({ value: uid, label: userMap.get(uid) || uid }))
      .sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));

    const base = await buildBaseFromCuadrillas();
    const day = dayData.day || {};
    const topBase = (baseTopSnap.data() as any)?.topGestores || [];
    const topDay = dayData.topDay ?? null;

    return NextResponse.json({
      ok: true,
      fecha,
      gestores,
      cuadrillas: cuadrillas.map((c) => ({ value: c.id, label: c.nombre })),
      base,
      day,
      topBase,
      topDay,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
    const canAdmin = session.isAdmin || roles.includes("GERENCIA");
    if (!canAdmin) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const body = await req.json();
    const tipo = String(body?.tipo || "").trim();
    const fecha = String(body?.fecha || "").trim();
    const gestoresMap = (body?.gestoresMap || {}) as Record<string, string[]>;
    const topGestores = Array.isArray(body?.topGestores) ? body.topGestores : [];

    if (!tipo || !["base", "dia"].includes(tipo)) return NextResponse.json({ ok: false, error: "INVALID_TIPO" }, { status: 400 });
    if (!fecha) return NextResponse.json({ ok: false, error: "MISSING_FECHA" }, { status: 400 });

    const dup = validarDuplicados(gestoresMap);
    if (dup) return NextResponse.json({ ok: false, error: "DUPLICATE_CUADRILLAS" }, { status: 400 });

    const db = adminDb();

    const actorSnap = await db.collection("usuarios").doc(session.uid).get();
    const actorData = actorSnap.data() as any;
    const actorNombre = shortName(`${actorData?.nombres || ""} ${actorData?.apellidos || ""}`.trim(), session.uid);

    if (tipo === "base") {
      await db.collection("asignacion_gestores_base").doc("base").set(
        {
          gestoresMap,
          updatedAt: new Date().toISOString(),
          updatedBy: session.uid,
          updatedByNombre: actorNombre,
        },
        { merge: true }
      );
      await db.collection("asignacion_gestores_config").doc("base").set(
        {
          topGestores,
          updatedAt: new Date().toISOString(),
          updatedBy: session.uid,
          updatedByNombre: actorNombre,
        },
        { merge: true }
      );

      // update cuadrillas.gestorUid according to base
      const quadSnap = await db.collection("cuadrillas").where("area", "==", "INSTALACIONES").get();
      const quadToGestor = new Map<string, string>();
      Object.entries(gestoresMap || {}).forEach(([g, list]) => {
        (list || []).forEach((cid) => quadToGestor.set(String(cid || "").trim(), g));
      });

      let batch = db.batch();
      let count = 0;
      for (const d of quadSnap.docs) {
        const gid = quadToGestor.get(d.id) || "";
        batch.update(d.ref, { gestorUid: gid });
        count++;
        if (count >= 450) {
          await batch.commit();
          batch = db.batch();
          count = 0;
        }
      }
      if (count > 0) await batch.commit();

      await db.collection("auditoria").add({
        modulo: "ASIGNACION_GESTORES",
        accion: "BASE_UPDATE",
        fecha,
        actorUid: session.uid,
        actorNombre,
        createdAt: new Date().toISOString(),
      });

      return NextResponse.json({ ok: true });
    }

    const ref = db.collection("asignacion_gestores_dia").doc(fecha);
    const prev = await ref.get();
    const createdAt = prev.exists ? (prev.data() as any)?.createdAt || new Date().toISOString() : new Date().toISOString();

    await ref.set(
      {
        fecha,
        gestoresMap,
        topGestores,
        createdAt,
        updatedAt: new Date().toISOString(),
        updatedBy: session.uid,
        updatedByNombre: actorNombre,
      },
      { merge: true }
    );

    await db.collection("auditoria").add({
      modulo: "ASIGNACION_GESTORES",
      accion: "DIA_UPDATE",
      fecha,
      actorUid: session.uid,
      actorNombre,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
