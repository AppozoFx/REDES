import { NextResponse } from "next/server";

import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

const PERM_VIEW = "INCONCERT_GERENCIA_VIEW";
const PERM_EDIT = "INCONCERT_GERENCIA_EDIT";

type Row = {
  id: string;
  ordenId: string;
  cliente: string;
  codigoCliente: string;
  documento: string;
  telefono: string;
  telNorm: string;
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
  icLatest: {
    usuaruioInconcert: string;
    inicioLlamadaInconcert: string;
    entraLlamadaInconcert: string;
    finLlamadaInconcert: string;
    duracion: string;
    bo: string;
    observacionInconcert: string;
  } | null;
};

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
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  return last ? `${first} ${last}` : first;
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
    const ymd = String(searchParams.get("ymd") || todayLimaYmd());

    const ordenesSnap = await adminDb()
      .collection("ordenes")
      .where("fSoliYmd", "==", ymd)
      .limit(1200)
      .get();

    const ordenesRaw = ordenesSnap.docs
      .map((d) => {
        const x = d.data() as any;
        return {
          id: d.id,
          ordenId: String(x.ordenId || d.id),
          cliente: String(x.cliente || ""),
          codigoCliente: String(x.codiSeguiClien || ""),
          documento: String(x.numeroDocumento || ""),
          telefono: String(x.telefono || ""),
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
    const inconcertByTel = new Map<string, any[]>();

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
        const list = inconcertByTel.get(tel) || [];
        list.push({ id: d.id, ...x, _ts: parseIcTs(x) });
        inconcertByTel.set(tel, list);
      }
    }

    for (const [k, list] of inconcertByTel.entries()) {
      list.sort((a, b) => (b._ts || 0) - (a._ts || 0));
      inconcertByTel.set(k, list);
    }

    const items: Row[] = ordenesRaw.map((r) => {
      const telNorm = normalizePhone(r.telefono);
      const list = telNorm ? inconcertByTel.get(telNorm) || [] : [];
      const latest = list[0] || null;
      return {
        id: r.id,
        ordenId: r.ordenId,
        cliente: r.cliente,
        codigoCliente: r.codigoCliente,
        documento: r.documento,
        telefono: r.telefono || "-",
        telNorm,
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
        icLatest: latest
          ? {
              usuaruioInconcert: String(latest.usuaruioInconcert || "-"),
              inicioLlamadaInconcert: String(latest.inicioLlamadaInconcert || "-"),
              entraLlamadaInconcert: String(latest.entraLlamadaInconcert || "-"),
              finLlamadaInconcert: String(latest.finLlamadaInconcert || "-"),
              duracion: String(latest.duracion || "-"),
              bo: String(latest.bo || "-"),
              observacionInconcert: String(latest.observacionInconcert || "-"),
            }
          : null,
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

    return NextResponse.json({ ok: true, ymd, items, options: { gestores, coordinadores } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
