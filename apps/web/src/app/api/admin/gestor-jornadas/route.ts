import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  if (typeof v?.toDate === "function") return (v.toDate() as Date).toISOString();
  if (typeof v?.toMillis === "function") return new Date(v.toMillis()).toISOString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return v;
  return null;
}

function monthBounds(month: string): { fromYmd: string; toYmd: string } | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [year, mon] = month.split("-").map(Number);
  const lastDay = new Date(year, mon, 0).getDate();
  return {
    fromYmd: `${month}-01`,
    toYmd: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

const ALLOWED_ROLES = ["RRHH", "JEFATURA", "GERENCIA", "COORDINADOR"];

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    const roles = (session.access.roles || []).map((r: string) => String(r).toUpperCase());
    const canUse = session.isAdmin || roles.some((r: string) => ALLOWED_ROLES.includes(r));
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const month = String(searchParams.get("month") || "").trim();
    const ymd = String(searchParams.get("ymd") || "").trim() || todayLimaYmd();
    const isMonthMode = !!month && !!monthBounds(month);

    const db = adminDb();

    let jornadasQuery: Promise<FirebaseFirestore.QuerySnapshot>;
    if (isMonthMode) {
      const bounds = monthBounds(month)!;
      jornadasQuery = db
        .collection("gestor_jornadas")
        .where("ymd", ">=", bounds.fromYmd)
        .where("ymd", "<=", bounds.toYmd)
        .get();
    } else {
      jornadasQuery = db.collection("gestor_jornadas").where("ymd", "==", ymd).get();
    }

    const [jornadasSnap, gestoresSnap] = await Promise.all([
      jornadasQuery,
      db.collection("usuarios_access").where("roles", "array-contains", "GESTOR").get(),
    ]);

    const gestorUids = gestoresSnap.docs
      .filter((d) => (d.data() as any)?.estadoAcceso === "HABILITADO")
      .map((d) => d.id);

    const jornadaUids = jornadasSnap.docs
      .map((d) => String((d.data() as any)?.uid || ""))
      .filter(Boolean);

    const allUids = Array.from(new Set([...gestorUids, ...jornadaUids]));

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

    const gestores = gestorUids
      .map((uid) => ({ uid, nombre: nameByUid.get(uid) || uid }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    const jornadas = jornadasSnap.docs.map((d) => {
      const data = d.data() as any;
      return {
        uid: String(data.uid || ""),
        ymd: String(data.ymd || ""),
        estadoTurno: String(data.estadoTurno || ""),
        ingresoAt: tsToIso(data.ingresoAt),
        salidaAt: tsToIso(data.salidaAt),
        refrigerio: {
          inicioAt: tsToIso(data.refrigerio?.inicioAt),
          finAt: tsToIso(data.refrigerio?.finAt),
          duracionMin: Number(data.refrigerio?.duracionMin || 0),
        },
      };
    });

    if (isMonthMode) {
      return NextResponse.json({ ok: true, mode: "month", month, gestores, jornadas });
    }

    // Day mode: keep backward-compatible shape
    const jornadaByUid = new Map(jornadas.map((j) => [j.uid, j]));
    const rows = gestores.map((g) => ({
      uid: g.uid,
      nombre: g.nombre,
      jornada: jornadaByUid.get(g.uid) ?? null,
    }));

    return NextResponse.json({ ok: true, mode: "day", ymd, rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
