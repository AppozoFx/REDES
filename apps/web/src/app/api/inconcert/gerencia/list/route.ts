import { NextResponse } from "next/server";

import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

const PERM_VIEW = "INCONCERT_GERENCIA_VIEW";
const PERM_EDIT = "INCONCERT_GERENCIA_EDIT";

type IcCallDetail = {
  usuaruioInconcert: string;
  inicioLlamadaInconcert: string;
  entraLlamadaInconcert: string;
  finLlamadaInconcert: string;
  duracion: string;
  duracionSeg: number;
  corta: boolean;
  bo: string;
  observacionInconcert: string;
};

type Row = {
  id: string;
  ordenId: string;
  cliente: string;
  codigoCliente: string;
  documento: string;
  telefono: string;
  telNorm: string;
  fSoliYmd: string;
  cuadrillaNombre: string;
  tipoServicio: string;
  tramo: string;
  estado: string;
  horaEnCamino: string;
  horaInicio: string;
  horaFin: string;
  gestorUid: string;
  gestorNombre: string;
  coordinadorUid: string;
  coordinadorNombre: string;
  estadoLlamada: string;
  horaInicioLlamada: string;
  horaFinLlamada: string;
  observacionLlamada: string;
  icCount: number;
  icCortas: number;
  icLatest: IcCallDetail | null;
  icList: IcCallDetail[];
};

const CORTA_UMBRAL_SEG = 11;

function normalizePhone(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return digits.slice(-9);
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

function parseIcTs(r: any) {
  const cands = [r?.inicioLlamadaInconcert, r?.entraLlamadaInconcert, r?.finLlamadaInconcert];
  for (const c of cands) {
    const s = String(c || "").trim();
    if (!s) continue;
    const normalized = s.includes(" ") && !s.includes("T") ? s.replace(" ", "T") : s;
    const t = Date.parse(normalized);
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

// Fecha (YYYY-MM-DD) de la llamada, tomada del texto tal cual viene del CSV InConcert
// (evita reinterpretar zona horaria via Date.parse, que puede correr el dia).
function parseIcYmd(r: any): string {
  const cands = [r?.inicioLlamadaInconcert, r?.entraLlamadaInconcert, r?.finLlamadaInconcert];
  for (const c of cands) {
    const m = String(c || "").trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  return "";
}

function parseDuracionSeg(v: unknown): number {
  const m = String(v || "").trim().match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function toIcCallDetail(x: any): IcCallDetail {
  const duracionSeg = x._duracionSeg || 0;
  return {
    usuaruioInconcert: String(x.usuaruioInconcert || "-"),
    inicioLlamadaInconcert: String(x.inicioLlamadaInconcert || "-"),
    entraLlamadaInconcert: String(x.entraLlamadaInconcert || "-"),
    finLlamadaInconcert: String(x.finLlamadaInconcert || "-"),
    duracion: String(x.duracion || "-"),
    duracionSeg,
    corta: duracionSeg < CORTA_UMBRAL_SEG,
    bo: String(x.bo || "-"),
    observacionInconcert: String(x.observacionInconcert || "-"),
  };
}

function tramoName(tramoRaw: string) {
  const value = String(tramoRaw || "").trim().slice(0, 5);
  if (value === "08:00") return "Primer Tramo";
  if (value === "12:00") return "Segundo Tramo";
  if (value === "16:00") return "Tercer Tramo";
  return value || "-";
}

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function monthRange(monthRaw: string): { start: string; end: string } | null {
  const m = String(monthRaw || "").trim().match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mm) || mm < 1 || mm > 12) return null;
  const start = `${String(y).padStart(4, "0")}-${String(mm).padStart(2, "0")}-01`;
  const lastDay = new Date(y, mm, 0).getDate();
  const end = `${String(y).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }

    const canView =
      session.isAdmin ||
      session.permissions.includes(PERM_VIEW) ||
      session.permissions.includes(PERM_EDIT);
    if (!canView) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const monthParam = String(searchParams.get("month") || "").trim();
    const monthParsed = monthRange(monthParam);
    const ymd = String(searchParams.get("ymd") || (monthParsed ? "" : todayLimaYmd()));

    const ordenesCol = adminDb().collection("ordenes");
    const ordenesDocs: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[] = [];

    if (monthParsed) {
      let cursor: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData> | undefined;
      while (true) {
        let query = ordenesCol
          .where("fSoliYmd", ">=", monthParsed.start)
          .where("fSoliYmd", "<=", monthParsed.end)
          .orderBy("fSoliYmd")
          .limit(2000);
        if (cursor) query = query.startAfter(cursor);
        const snap = await query.get();
        if (snap.empty) break;
        ordenesDocs.push(...snap.docs);
        if (snap.size < 2000) break;
        cursor = snap.docs[snap.docs.length - 1];
      }
    } else {
      const ordenesSnap = await ordenesCol.where("fSoliYmd", "==", ymd).limit(1200).get();
      ordenesDocs.push(...ordenesSnap.docs);
    }

    const ordenesRaw = ordenesDocs
      .map((d) => {
        const x = d.data() as any;
        return {
          id: d.id,
          ordenId: String(x.ordenId || d.id),
          cliente: String(x.cliente || ""),
          codigoCliente: String(x.codiSeguiClien || ""),
          documento: String(x.numeroDocumento || ""),
          telefono: String(x.telefono || ""),
          fSoliYmd: String(x.fSoliYmd || ""),
          cuadrillaNombre: String(x.cuadrillaNombre || x.cuadrillaId || ""),
          tipoServicio: String(x.tipoTraba || x.tipoOrden || ""),
          tramo: String(x.fSoliHm || x.fechaFinVisiHm || ""),
          estado: String(x.estado || ""),
          horaEnCamino: String(x.horaEnCamino || ""),
          horaInicio: String(x.fechaIniVisiHm || x.horaInicio || ""),
          horaFin: String(x.fechaFinVisiHm || x.horaFin || ""),
          gestorUid: String(x.gestorCuadrilla || ""),
          coordinadorUid: String(x.coordinadorCuadrilla || ""),
          estadoLlamada: String(x.estadoLlamada || ""),
          horaInicioLlamada: String(x.horaInicioLlamada || ""),
          horaFinLlamada: String(x.horaFinLlamada || ""),
          observacionLlamada: String(x.observacionLlamada || ""),
          _tipo: String(x.tipo || ""),
          _tipoTraba: String(x.tipoTraba || ""),
          _idenServi: String(x.idenServi || ""),
          _estadoRaw: String(x.estado || ""),
        };
      })
      .filter((r) => {
        const hayGarantia = `${r._tipo} ${r._tipoTraba} ${r._idenServi} ${r._estadoRaw}`.toUpperCase().includes("GARANTIA");
        return !hayGarantia;
      });

    const userUids = Array.from(new Set(ordenesRaw.flatMap((r) => [r.gestorUid, r.coordinadorUid]).filter(Boolean)));
    const userRefs = userUids.map((uid) => adminDb().collection("usuarios").doc(uid));
    const userSnaps = userUids.length ? await adminDb().getAll(...userRefs) : [];
    const userMap = new Map(
      userSnaps.map((s) => {
        const data = s.data() as any;
        const full = `${String(data?.nombres || "").trim()} ${String(data?.apellidos || "").trim()}`.trim() || s.id;
        return [s.id, shortName(full)];
      })
    );

    const tels = Array.from(new Set(ordenesRaw.map((r) => normalizePhone(r.telefono)).filter(Boolean)));
    // Clave "telefono|fecha" para que una orden solo cruce con llamadas InConcert
    // hechas el mismo dia de esa orden (antes cruzaba por telefono sin importar el dia).
    const inconcertByTelDia = new Map<string, any[]>();

    for (let i = 0; i < tels.length; i += 30) {
      const chunk = tels.slice(i, i + 30);
      const [byNorm, byRaw] = await Promise.all([
        adminDb().collection("inconcert").where("_telNorm", "in", chunk).get(),
        adminDb().collection("inconcert").where("telefonoCliente", "in", chunk).get(),
      ]);
      const docs = [...byNorm.docs, ...byRaw.docs];
      const seen = new Set<string>();
      for (const d of docs) {
        if (seen.has(d.id)) continue;
        seen.add(d.id);
        const x = d.data() as any;
        const tel = normalizePhone(x?._telNorm || x?.telefonoCliente || x?._dirCrudo);
        if (!tel) continue;
        const ymd = parseIcYmd(x);
        if (!ymd) continue;
        const key = `${tel}|${ymd}`;
        const list = inconcertByTelDia.get(key) || [];
        list.push({ id: d.id, ...x, _ts: parseIcTs(x), _duracionSeg: parseDuracionSeg(x?.duracion) });
        inconcertByTelDia.set(key, list);
      }
    }

    for (const [k, list] of inconcertByTelDia.entries()) {
      list.sort((a, b) => (b._ts || 0) - (a._ts || 0));
      inconcertByTelDia.set(k, list);
    }

    const items: Row[] = ordenesRaw.map((r) => {
      const telNorm = normalizePhone(r.telefono);
      const key = telNorm && r.fSoliYmd ? `${telNorm}|${r.fSoliYmd}` : "";
      const list = key ? inconcertByTelDia.get(key) || [] : [];
      const latest = list[0] || null;
      const cortas = list.filter((x) => x._duracionSeg < CORTA_UMBRAL_SEG).length;
      return {
        id: r.id,
        ordenId: r.ordenId,
        cliente: r.cliente,
        codigoCliente: r.codigoCliente,
        documento: r.documento,
        telefono: r.telefono || "-",
        telNorm,
        fSoliYmd: r.fSoliYmd || "",
        cuadrillaNombre: r.cuadrillaNombre || "-",
        tipoServicio: r.tipoServicio || "-",
        tramo: tramoName(r.tramo),
        estado: r.estado || "-",
        horaEnCamino: r.horaEnCamino || "-",
        horaInicio: r.horaInicio || "-",
        horaFin: r.horaFin || "-",
        gestorUid: r.gestorUid,
        gestorNombre: userMap.get(r.gestorUid) || r.gestorUid || "-",
        coordinadorUid: r.coordinadorUid,
        coordinadorNombre: userMap.get(r.coordinadorUid) || r.coordinadorUid || "-",
        estadoLlamada: r.estadoLlamada || "-",
        horaInicioLlamada: r.horaInicioLlamada || "-",
        horaFinLlamada: r.horaFinLlamada || "-",
        observacionLlamada: r.observacionLlamada || "-",
        icCount: list.length,
        icCortas: cortas,
        icLatest: latest ? toIcCallDetail(latest) : null,
        icList: list.map(toIcCallDetail),
      };
    });

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
      ymd: monthParsed ? "" : ymd,
      month: monthParsed ? monthParam : "",
      items,
      options: { gestores, coordinadores },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
