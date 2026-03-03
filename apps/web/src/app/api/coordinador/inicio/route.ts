import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CuadrillaResumen = {
  cuadrillaId: string;
  cuadrillaNombre: string;
  finalizadas: number;
  garantias: number;
  ventas: number;
  cat5e: number;
  cat6: number;
  dias: Array<{
    ymd: string;
    finalizadas: number;
    garantias: number;
    cat5e: number;
    cat6: number;
  }>;
};

function todayLimaYm() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function norm(v: unknown) {
  return String(v || "").trim().toUpperCase();
}

function shortName(v: unknown) {
  return String(v || "").trim();
}

function isFinalizada(estado: unknown) {
  const s = norm(estado);
  return s.includes("FINAL");
}

function isGarantia(...values: unknown[]) {
  const mix = values.map((x) => norm(x)).join(" ");
  return mix.includes("GARANTIA");
}

function toNum(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function monthStart(ym: string) {
  return `${ym}-01`;
}

function monthEnd(ym: string) {
  return `${ym}-31`;
}

function monthUtcRange(ym: string) {
  const [yy, mm] = String(ym || "").split("-");
  const y = Number(yy || 0);
  const m = Number(mm || 1);
  const start = new Date(Date.UTC(y, Math.max(0, m - 1), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  return { start, end };
}

function incDia(
  dias: Map<string, { finalizadas: number; garantias: number; cat5e: number; cat6: number }>,
  ymd: string
) {
  const key = String(ymd || "").trim();
  if (!key) return null;
  if (!dias.has(key)) dias.set(key, { finalizadas: 0, garantias: 0, cat5e: 0, cat6: 0 });
  return dias.get(key)!;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }

    const roles = (session.access.roles || []).map((r) => norm(r));
    const isCoord = roles.includes("COORDINADOR");
    if (!session.isAdmin && !isCoord) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const ym = String(searchParams.get("ym") || todayLimaYm()).trim();
    const coordUid =
      session.isAdmin && searchParams.get("coordinadorUid")
        ? String(searchParams.get("coordinadorUid") || "").trim()
        : session.uid;
    if (!coordUid) return NextResponse.json({ ok: false, error: "COORDINADOR_REQUIRED" }, { status: 400 });

    const start = monthStart(ym);
    const end = monthEnd(ym);
    const { start: monthStartUtc, end: monthEndUtc } = monthUtcRange(ym);
    const db = adminDb();

    const [cuadSnap, ordenesSnap, instSnap, ventasSnap] = await Promise.all([
      db
        .collection("cuadrillas")
        .where("area", "==", "INSTALACIONES")
        .where("coordinadorUid", "==", coordUid)
        .limit(500)
        .get(),
      db
        .collection("ordenes")
        .where("fSoliYmd", ">=", start)
        .where("fSoliYmd", "<=", end)
        .limit(12000)
        .get(),
      db
        .collection("instalaciones")
        .where("fechaOrdenYmd", ">=", start)
        .where("fechaOrdenYmd", "<=", end)
        .limit(12000)
        .get(),
      db
        .collection("ventas")
        .where("coordinadorUid", "==", coordUid)
        .limit(5000)
        .get(),
    ]);

    const byId = new Map<string, CuadrillaResumen>();
    const byName = new Map<string, CuadrillaResumen>();
    for (const d of cuadSnap.docs) {
      const data = d.data() as any;
      const nombre = shortName(data?.nombre || d.id);
      const base: CuadrillaResumen = {
        cuadrillaId: d.id,
        cuadrillaNombre: nombre,
        finalizadas: 0,
        garantias: 0,
        ventas: 0,
        cat5e: 0,
        cat6: 0,
        dias: [],
      };
      byId.set(d.id, base);
      byName.set(norm(nombre), base);
    }

    const diasByCuadrilla = new Map<string, Map<string, { finalizadas: number; garantias: number; cat5e: number; cat6: number }>>();
    const ensureCuadrilla = (idRaw: unknown, nameRaw: unknown) => {
      const id = shortName(idRaw);
      const name = shortName(nameRaw);
      let row = (id && byId.get(id)) || (name && byName.get(norm(name))) || null;
      if (!row) {
        const newId = id || `NO_ID_${name || "SIN_NOMBRE"}`;
        row = {
          cuadrillaId: newId,
          cuadrillaNombre: name || newId,
          finalizadas: 0,
          garantias: 0,
          ventas: 0,
          cat5e: 0,
          cat6: 0,
          dias: [],
        };
        byId.set(row.cuadrillaId, row);
        byName.set(norm(row.cuadrillaNombre), row);
      }
      if (!diasByCuadrilla.has(row.cuadrillaId)) diasByCuadrilla.set(row.cuadrillaId, new Map());
      return row;
    };

    for (const d of ordenesSnap.docs) {
      const o = d.data() as any;
      const coord = shortName(o?.coordinadorCuadrilla || o?.coordinador || "");
      if (coord !== coordUid) continue;
      const ymd = shortName(o?.fSoliYmd || o?.fechaFinVisiYmd || "");
      const row = ensureCuadrilla(o?.cuadrillaId, o?.cuadrillaNombre);
      const dia = incDia(diasByCuadrilla.get(row.cuadrillaId)!, ymd);
      if (!dia) continue;

      const finalizada = isFinalizada(o?.estado);
      const garantia = isGarantia(o?.tipo, o?.tipoTraba, o?.idenServi);
      if (finalizada && !garantia) {
        row.finalizadas += 1;
        dia.finalizadas += 1;
      }
      if (garantia) {
        row.garantias += 1;
        dia.garantias += 1;
      }
    }

    for (const d of instSnap.docs) {
      const x = d.data() as any;
      const orden = (x?.orden && typeof x.orden === "object") ? x.orden : {};
      const coord = shortName(
        orden?.coordinadorCuadrilla ||
          orden?.coordinador ||
          x?.coordinadorUid ||
          ""
      );
      if (coord !== coordUid) continue;

      const serviciosRaw = (x?.servicios && typeof x.servicios === "object") ? x.servicios : {};
      const liqServicios = (x?.liquidacion?.servicios && typeof x?.liquidacion?.servicios === "object")
        ? x.liquidacion.servicios
        : {};
      const servicios = { ...liqServicios, ...serviciosRaw } as any;

      const cat5e = toNum(servicios?.cat5e);
      const cat6 = toNum(servicios?.cat6);
      if (!cat5e && !cat6) continue;

      const ymd = shortName(x?.fechaInstalacionYmd || x?.fechaOrdenYmd || orden?.fSoliYmd || "");
      const row = ensureCuadrilla(x?.cuadrillaId || orden?.cuadrillaId, x?.cuadrillaNombre || orden?.cuadrillaNombre);
      const dia = incDia(diasByCuadrilla.get(row.cuadrillaId)!, ymd);
      if (!dia) continue;

      row.cat5e += cat5e;
      row.cat6 += cat6;
      dia.cat5e += cat5e;
      dia.cat6 += cat6;
    }

    for (const d of ventasSnap.docs) {
      const v = d.data() as any;
      const createdAtMs = v?.createdAt?.toDate?.()?.getTime?.() || 0;
      if (createdAtMs < monthStartUtc.getTime() || createdAtMs >= monthEndUtc.getTime()) continue;
      const row = ensureCuadrilla(v?.cuadrillaId, v?.cuadrillaNombre);
      row.ventas += 1;
    }

    const cuadrillas = Array.from(byId.values())
      .map((r) => {
        const dias = Array.from((diasByCuadrilla.get(r.cuadrillaId) || new Map()).entries())
          .map(([ymd, v]) => ({ ymd, ...v }))
          .sort((a, b) => a.ymd.localeCompare(b.ymd));
        return { ...r, dias };
      })
      .sort((a, b) => a.cuadrillaNombre.localeCompare(b.cuadrillaNombre, "es", { sensitivity: "base" }));

    const resumen = cuadrillas.reduce(
      (acc, r) => {
        acc.cuadrillas += 1;
        acc.finalizadas += r.finalizadas;
        acc.garantias += r.garantias;
        acc.ventas += r.ventas;
        acc.cat5e += r.cat5e;
        acc.cat6 += r.cat6;
        return acc;
      },
      { cuadrillas: 0, finalizadas: 0, garantias: 0, ventas: 0, cat5e: 0, cat6: 0 }
    );

    return NextResponse.json({ ok: true, ym, coordinadorUid: coordUid, resumen, cuadrillas });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
