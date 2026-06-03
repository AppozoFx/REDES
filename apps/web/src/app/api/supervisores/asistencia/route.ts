import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";
import { canViewSupervisores } from "@/domain/supervisores/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
}

function monthBounds(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [year, mon] = month.split("-").map(Number);
  const lastDay = new Date(year, mon, 0).getDate();
  return { fromYmd: `${month}-01`, toYmd: `${month}-${String(lastDay).padStart(2, "0")}` };
}

function duracionMinutos(inicio: string | null, fin: string | null): number {
  if (!inicio || !fin) return 0;
  const [h1, m1] = inicio.split(":").map(Number);
  const [h2, m2] = fin.split(":").map(Number);
  return Math.max(0, (h2 * 60 + m2) - (h1 * 60 + m1));
}

function estadoLabel(estado: string) {
  if (estado === "EN_RUTA") return "EN_TURNO";
  if (estado === "EN_REFRIGERIO") return "EN_REFRIGERIO";
  if (estado === "FINALIZADA") return "FINALIZADO";
  return estado || "";
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (!canViewSupervisores(session)) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const month = String(searchParams.get("month") || "").trim();
    const ymd = String(searchParams.get("ymd") || "").trim() || todayLimaYmd();
    const isMonthMode = !!month && !!monthBounds(month);
    const db = adminDb();

    let asistenciaQuery: Promise<FirebaseFirestore.QuerySnapshot>;
    if (isMonthMode) {
      const bounds = monthBounds(month)!;
      asistenciaQuery = db.collection("asistencia_supervisores")
        .where("ymd", ">=", bounds.fromYmd)
        .where("ymd", "<=", bounds.toYmd)
        .get();
    } else {
      asistenciaQuery = db.collection("asistencia_supervisores").where("ymd", "==", ymd).get();
    }

    const [asistenciaSnap, accessSnap] = await Promise.all([
      asistenciaQuery,
      db.collection("usuarios_access").where("roles", "array-contains", "SUPERVISOR").get(),
    ]);

    const supervisorUids = accessSnap.docs
      .filter((d) => (d.data() as any)?.estadoAcceso === "HABILITADO")
      .filter((d) => {
        const areas = ((d.data() as any)?.areas || []).map((a: any) => String(a).toUpperCase());
        return areas.includes("INSTALACIONES");
      })
      .map((d) => d.id);

    const asistenciaUids = asistenciaSnap.docs
      .map((d) => String((d.data() as any)?.uid || ""))
      .filter(Boolean);

    const allUids = Array.from(new Set([...supervisorUids, ...asistenciaUids]));

    const userDocs = allUids.length
      ? await db.getAll(...allUids.map((uid) => db.collection("usuarios").doc(uid)))
      : [];

    const nameByUid = new Map(
      userDocs.map((d) => {
        const data = (d.data() as any) || {};
        const nombre = [data.nombres, data.apellidos].filter(Boolean).join(" ").trim() || d.id;
        return [d.id, nombre];
      })
    );

    const supervisores = supervisorUids
      .map((uid) => ({ uid, nombre: nameByUid.get(uid) || uid }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    const asistencias = asistenciaSnap.docs.map((d) => {
      const data = d.data() as any;
      const horaInicio = String(data.horaInicio || "").trim() || null;
      const horaFin = String(data.horaFin || "").trim() || null;
      const horaInicioRefrigerio = String(data.horaInicioRefrigerio || "").trim() || null;
      const horaFinRefrigerio = String(data.horaFinRefrigerio || "").trim() || null;
      return {
        uid: String(data.uid || ""),
        ymd: String(data.ymd || ""),
        estado: estadoLabel(String(data.estado || "")),
        horaInicio,
        horaFin,
        horaInicioRefrigerio,
        horaFinRefrigerio,
        duracionRefrigerioMin: duracionMinutos(horaInicioRefrigerio, horaFinRefrigerio),
        latInicio: typeof data.latInicio === "number" ? data.latInicio : null,
        lngInicio: typeof data.lngInicio === "number" ? data.lngInicio : null,
        latFin: typeof data.latFin === "number" ? data.latFin : null,
        lngFin: typeof data.lngFin === "number" ? data.lngFin : null,
      };
    });

    if (isMonthMode) {
      return NextResponse.json({ ok: true, mode: "month", month, supervisores, asistencias });
    }

    const asistenciaByUid = new Map(asistencias.map((a) => [a.uid, a]));
    const rows = supervisores.map((s) => ({
      uid: s.uid,
      nombre: s.nombre,
      asistencia: asistenciaByUid.get(s.uid) ?? null,
    }));

    return NextResponse.json({ ok: true, mode: "day", ymd, rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
