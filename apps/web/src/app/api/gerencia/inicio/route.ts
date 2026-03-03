import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteState = "OPERATIVA" | "EN_CAMPO" | "RUTA_CERRADA";

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function tsToIso(v: any): string | null {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate().toISOString();
  if (typeof v?.seconds === "number") return new Date(v.seconds * 1000).toISOString();
  if (typeof v?._seconds === "number") return new Date(v._seconds * 1000).toISOString();
  return typeof v === "string" ? v : null;
}

function toMillis(v: any): number {
  if (!v) return 0;
  if (typeof v?.toMillis === "function") return Number(v.toMillis() || 0);
  if (typeof v?.toDate === "function") {
    const d = v.toDate();
    return d instanceof Date ? d.getTime() : 0;
  }
  if (typeof v?.seconds === "number") return Number(v.seconds) * 1000;
  if (typeof v?._seconds === "number") return Number(v._seconds) * 1000;
  if (v instanceof Date) return v.getTime();
  return 0;
}

function normalizeOrderState(raw: string): "AGENDADA" | "INICIADA" | "FINALIZADA" | "OTROS" {
  const s = String(raw || "").toUpperCase();
  if (s.includes("FINAL")) return "FINALIZADA";
  if (s.includes("INIC")) return "INICIADA";
  if (s.includes("CAMINO")) return "INICIADA";
  if (s.includes("AGEN")) return "AGENDADA";
  return "OTROS";
}

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }

    const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
    const canUse = session.isAdmin || roles.includes("GERENCIA");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const db = adminDb();
    const ymd = todayLimaYmd();

    const [accessSnap, cuadrillasSnap, ordenesSnap, notifsSnap, jornadasSnap] = await Promise.all([
      db.collection("usuarios_access").where("roles", "array-contains", "GESTOR").get(),
      db.collection("cuadrillas").where("estado", "==", "HABILITADO").get(),
      db.collection("ordenes").where("fSoliYmd", "==", ymd).limit(5000).get(),
      db.collection("notificaciones").orderBy("createdAt", "desc").limit(40).get(),
      db.collection("gestor_jornadas").where("ymd", "==", ymd).get(),
    ]);

    const gestorUids = accessSnap.docs.map((d) => d.id);
    const userRefs = gestorUids.map((uid) => db.collection("usuarios").doc(uid));
    const presenciaRefs = gestorUids.map((uid) => db.collection("usuarios_presencia").doc(uid));
    const [userSnaps, presenciaSnaps] = await Promise.all([
      gestorUids.length ? db.getAll(...userRefs) : Promise.resolve([] as any[]),
      gestorUids.length ? db.getAll(...presenciaRefs) : Promise.resolve([] as any[]),
    ]);

    const userMap = new Map<string, string>();
    for (const u of userSnaps as any[]) {
      const data = (u.data?.() || {}) as any;
      const nombres = String(data?.nombres || "").trim();
      const apellidos = String(data?.apellidos || "").trim();
      userMap.set(u.id, `${nombres} ${apellidos}`.trim() || String(data?.displayName || u.id));
    }

    const onlineGraceMs = 2 * 60 * 1000;
    const now = Date.now();
    const presenciaMap = new Map<string, { online: boolean; lastSeenAt: string | null }>();
    for (const p of presenciaSnaps as any[]) {
      const data = (p.data?.() || {}) as any;
      const lastSeenMs = toMillis(data?.lastSeenAt) || toMillis(data?.updatedAt);
      const online = !!data?.online && lastSeenMs > 0 && now - lastSeenMs <= onlineGraceMs;
      presenciaMap.set(p.id, {
        online,
        lastSeenAt: lastSeenMs > 0 ? new Date(lastSeenMs).toISOString() : null,
      });
    }

    const jornadaMap = new Map<string, any>();
    for (const j of jornadasSnap.docs) {
      const data = j.data() as any;
      const uid = String(data?.uid || "");
      if (!uid) continue;
      jornadaMap.set(uid, data);
    }

    const cuadrillas = cuadrillasSnap.docs.map((d) => ({
      id: d.id,
      nombre: String((d.data() as any)?.nombre || d.id),
      gestorUid: String((d.data() as any)?.gestorUid || ""),
    }));
    const cuadrillaIds = cuadrillas.map((c) => c.id);

    const stateRefs = cuadrillaIds.map((id) => db.collection("cuadrilla_estado_diario").doc(`${ymd}_${id}`));
    const stateSnaps = stateRefs.length ? await db.getAll(...stateRefs) : [];
    const stateMap = new Map<string, RouteState>();
    for (const s of stateSnaps as any[]) {
      const data = s.data?.() as any;
      const cuadrillaId = String(data?.cuadrillaId || "");
      if (!cuadrillaId) continue;
      const estado = String(data?.estadoRuta || "OPERATIVA").toUpperCase();
      const safe = estado === "EN_CAMPO" || estado === "RUTA_CERRADA" ? estado : "OPERATIVA";
      stateMap.set(cuadrillaId, safe as RouteState);
    }

    const statsByCuadrilla = new Map<
      string,
      { total: number; agendada: number; iniciada: number; finalizada: number; otros: number; llamadasTotal: number; llamadasRealizadas: number }
    >();
    for (const c of cuadrillas) {
      statsByCuadrilla.set(c.id, {
        total: 0,
        agendada: 0,
        iniciada: 0,
        finalizada: 0,
        otros: 0,
        llamadasTotal: 0,
        llamadasRealizadas: 0,
      });
    }

    for (const doc of ordenesSnap.docs) {
      const x = doc.data() as any;
      const cuadrillaId = String(x?.cuadrillaId || "").trim();
      if (!cuadrillaId || !statsByCuadrilla.has(cuadrillaId)) continue;
      const st = statsByCuadrilla.get(cuadrillaId)!;
      st.total += 1;
      const bucket = normalizeOrderState(String(x?.estado || ""));
      if (bucket === "AGENDADA") st.agendada += 1;
      else if (bucket === "INICIADA") st.iniciada += 1;
      else if (bucket === "FINALIZADA") st.finalizada += 1;
      else st.otros += 1;

      st.llamadasTotal += 1;
      const llamada = String(x?.estadoLlamada || "").trim();
      if (llamada) st.llamadasRealizadas += 1;
    }

    const summary = {
      gestoresTotal: gestorUids.length,
      gestoresOnline: 0,
      gestoresEnTurno: 0,
      gestoresEnRefrigerio: 0,
      gestoresFinalizados: 0,
      gestoresSinIngreso: 0,
      cuadrillasTotal: cuadrillas.length,
      cuadrillasOperativa: 0,
      cuadrillasEnCampo: 0,
      cuadrillasRutaCerrada: 0,
      ordenesTotal: 0,
      ordenesAgendada: 0,
      ordenesIniciada: 0,
      ordenesFinalizada: 0,
      ordenesOtros: 0,
      llamadasTotal: 0,
      llamadasRealizadas: 0,
    };

    const statsByGestor = new Map<
      string,
      {
        cuadrillas: number;
        operativa: number;
        enCampo: number;
        rutaCerrada: number;
        ordenesTotal: number;
        agendada: number;
        iniciada: number;
        finalizada: number;
        llamadasTotal: number;
        llamadasRealizadas: number;
      }
    >();
    for (const uid of gestorUids) {
      statsByGestor.set(uid, {
        cuadrillas: 0,
        operativa: 0,
        enCampo: 0,
        rutaCerrada: 0,
        ordenesTotal: 0,
        agendada: 0,
        iniciada: 0,
        finalizada: 0,
        llamadasTotal: 0,
        llamadasRealizadas: 0,
      });
    }

    for (const c of cuadrillas) {
      const estadoRuta = stateMap.get(c.id) || "OPERATIVA";
      if (estadoRuta === "OPERATIVA") summary.cuadrillasOperativa += 1;
      else if (estadoRuta === "EN_CAMPO") summary.cuadrillasEnCampo += 1;
      else summary.cuadrillasRutaCerrada += 1;

      const st = statsByCuadrilla.get(c.id)!;
      summary.ordenesTotal += st.total;
      summary.ordenesAgendada += st.agendada;
      summary.ordenesIniciada += st.iniciada;
      summary.ordenesFinalizada += st.finalizada;
      summary.ordenesOtros += st.otros;
      summary.llamadasTotal += st.llamadasTotal;
      summary.llamadasRealizadas += st.llamadasRealizadas;

      const gestorUid = c.gestorUid;
      if (!gestorUid || !statsByGestor.has(gestorUid)) continue;
      const gs = statsByGestor.get(gestorUid)!;
      gs.cuadrillas += 1;
      if (estadoRuta === "OPERATIVA") gs.operativa += 1;
      else if (estadoRuta === "EN_CAMPO") gs.enCampo += 1;
      else gs.rutaCerrada += 1;
      gs.ordenesTotal += st.total;
      gs.agendada += st.agendada;
      gs.iniciada += st.iniciada;
      gs.finalizada += st.finalizada;
      gs.llamadasTotal += st.llamadasTotal;
      gs.llamadasRealizadas += st.llamadasRealizadas;
    }

    const gestores = gestorUids
      .map((uid) => {
        const jornada = jornadaMap.get(uid) || {};
        const presencia = presenciaMap.get(uid) || { online: false, lastSeenAt: null };
        const gs = statsByGestor.get(uid)!;
        const estadoTurno = String(jornada?.estadoTurno || "").toUpperCase() || "SIN_INGRESO";
        if (presencia.online) summary.gestoresOnline += 1;
        if (estadoTurno === "EN_TURNO") summary.gestoresEnTurno += 1;
        else if (estadoTurno === "EN_REFRIGERIO") summary.gestoresEnRefrigerio += 1;
        else if (estadoTurno === "FINALIZADO") summary.gestoresFinalizados += 1;
        else summary.gestoresSinIngreso += 1;
        return {
          uid,
          nombre: userMap.get(uid) || uid,
          online: presencia.online,
          lastSeenAt: presencia.lastSeenAt,
          jornada: {
            estadoTurno,
            ingresoAt: tsToIso(jornada?.ingresoAt),
            salidaAt: tsToIso(jornada?.salidaAt),
            refrigerioInicioAt: tsToIso(jornada?.refrigerio?.inicioAt),
            refrigerioFinAt: tsToIso(jornada?.refrigerio?.finAt),
            refrigerioMin: Number(jornada?.refrigerio?.duracionMin || 0),
          },
          cuadrillas: {
            total: gs.cuadrillas,
            operativa: gs.operativa,
            enCampo: gs.enCampo,
            rutaCerrada: gs.rutaCerrada,
          },
          ordenes: {
            total: gs.ordenesTotal,
            agendada: gs.agendada,
            iniciada: gs.iniciada,
            finalizada: gs.finalizada,
          },
          llamadas: {
            total: gs.llamadasTotal,
            realizadas: gs.llamadasRealizadas,
            pendientes: Math.max(0, gs.llamadasTotal - gs.llamadasRealizadas),
          },
        };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));

    const notifImport = notifsSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .find((n) => {
        const title = String(n?.title || "").toUpperCase();
        const entityType = String(n?.entityType || "").toUpperCase();
        return entityType === "ORDENES" && title.includes("IMPORT");
      });

    let importUserName = "";
    if (notifImport?.createdBy) {
      const u = await db.collection("usuarios").doc(String(notifImport.createdBy)).get();
      if (u.exists) {
        const data = u.data() as any;
        importUserName = String(
          data?.displayName || `${data?.nombres || ""} ${data?.apellidos || ""}`.trim()
        );
      }
    }

    return NextResponse.json({
      ok: true,
      ymd,
      resumen: {
        ...summary,
        llamadasPendientes: Math.max(0, summary.llamadasTotal - summary.llamadasRealizadas),
      },
      detalle: {
        cuadrillas: cuadrillas
          .map((c) => {
            const st = statsByCuadrilla.get(c.id)!;
            return {
              cuadrillaId: c.id,
              cuadrillaNombre: c.nombre,
              gestorUid: c.gestorUid,
              gestorNombre: userMap.get(c.gestorUid) || c.gestorUid || "-",
              estadoRuta: stateMap.get(c.id) || "OPERATIVA",
              ordenes: {
                total: st.total,
                agendada: st.agendada,
                iniciada: st.iniciada,
                finalizada: st.finalizada,
                otros: st.otros,
              },
              llamadas: {
                total: st.llamadasTotal,
                realizadas: st.llamadasRealizadas,
                pendientes: Math.max(0, st.llamadasTotal - st.llamadasRealizadas),
              },
            };
          })
          .sort((a, b) => a.cuadrillaNombre.localeCompare(b.cuadrillaNombre, "es", { sensitivity: "base" })),
      },
      gestores,
      ultimaImportacion: notifImport
        ? {
            at: tsToIso(notifImport.createdAt),
            byUid: String(notifImport.createdBy || ""),
            byNombre: importUserName || String(notifImport.createdBy || ""),
          }
        : null,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
