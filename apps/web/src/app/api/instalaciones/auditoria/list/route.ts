import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

function toPlain(value: any): any {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === "object") {
    if (typeof (value as any)?.toDate === "function") {
      try {
        return (value as any).toDate().toISOString();
      } catch {
        return null;
      }
    }
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = toPlain(v);
    return out;
  }
  return value;
}

function asStr(v: any) {
  return String(v || "").trim();
}

function norm(v: any) {
  return asStr(v).toUpperCase();
}

function pushInstSn(map: Map<string, any>, sn: any, detalle: any) {
  const key = norm(sn);
  if (!key || map.has(key)) return;
  map.set(key, detalle);
}

function collectInstSnMap(inst: any) {
  const map = new Map<string, any>();
  pushInstSn(map, inst?.snONT, inst);
  pushInstSn(map, inst?.snFONO, inst);
  for (const sn of Array.isArray(inst?.snMESH) ? inst.snMESH : []) pushInstSn(map, sn, inst);
  for (const sn of Array.isArray(inst?.snBOX) ? inst.snBOX : []) pushInstSn(map, sn, inst);
  for (const eq of Array.isArray(inst?.equiposInstalados) ? inst.equiposInstalados : []) {
    pushInstSn(map, eq?.sn ?? eq?.SN, inst);
  }
  return map;
}

function parseSnList(v: any): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x || "").trim()).filter(Boolean);
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x || "").trim()).filter(Boolean);
    } catch {}
    return s.split(/[|,;]/).map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

function normalizeCalls(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "object") {
    const vals = Object.values(raw);
    if (vals.length && vals.every((x) => x && typeof x === "object")) return vals;
    return [raw];
  }
  return [];
}

function toIso(v: any) {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate().toISOString();
  if (typeof v?.seconds === "number") return new Date(v.seconds * 1000).toISOString();
  if (typeof v?._seconds === "number") return new Date(v._seconds * 1000).toISOString();
  if (typeof v === "string") return v;
  return null;
}

function normalizeInstalacion(docId: string, rawData: any) {
  const data = toPlain(rawData) || {};
  const orden = data.orden || {};
  const liquidacion = data.liquidacion || {};
  const serviciosRaw =
    data.servicios && typeof data.servicios === "object" && !Array.isArray(data.servicios)
      ? data.servicios
      : {};
  const liquidacionServicios =
    liquidacion.servicios && typeof liquidacion.servicios === "object" && !Array.isArray(liquidacion.servicios)
      ? liquidacion.servicios
      : {};
  const servicios = { ...liquidacionServicios, ...serviciosRaw };
  const equiposRaw =
    (Array.isArray(data.equiposInstalados) && data.equiposInstalados) ||
    (Array.isArray(liquidacion.equiposInstalados) && liquidacion.equiposInstalados) ||
    (Array.isArray(orden?.equiposInstalados) && orden.equiposInstalados) ||
    [];
  const equipos = equiposRaw
    .map((e: any) => ({
      sn: String(e?.sn || e?.SN || "").trim(),
      tipo: String(e?.tipo || e?.kind || "").trim(),
      proid: String(e?.proid || e?.PROID || "").trim(),
      descripcion: String(e?.descripcion || "").trim(),
    }))
    .filter((e: any) => e.sn || e.tipo || e.proid || e.descripcion);

  const byTipo = (tipo: string) =>
    equipos.filter((e: any) => String(e?.tipo || "").toUpperCase().includes(tipo));

  const snONT = byTipo("ONT")[0]?.sn || data.snONT || "";
  const meshFromEquipos = byTipo("MESH").map((e: any) => e.sn).filter(Boolean);
  const boxFromEquipos = byTipo("BOX").map((e: any) => e.sn).filter(Boolean);
  const snMESH = meshFromEquipos.length ? meshFromEquipos : parseSnList(data.snMESH);
  const snBOX = boxFromEquipos.length ? boxFromEquipos : parseSnList(data.snBOX);
  const snFONO = byTipo("FONO")[0]?.sn || data.snFONO || "";
  const fechaOrdenAt = toIso(orden.fechaFinVisiAt) || toIso(orden.fSoliAt) || toIso(orden.fechaIniVisiAt) || null;
  const fechaInstalacionAt = fechaOrdenAt || toIso(data.fechaInstalacionAt) || toIso(liquidacion.at) || toIso(data.updatedAt) || null;
  const llamadasRaw =
    data.llamadas ||
    liquidacion.llamadas ||
    orden.llamadas ||
    (orden.estadoLlamada || orden.horaInicioLlamada || orden.horaFinLlamada || orden.observacionLlamada
      ? {
          estadoLlamada: orden.estadoLlamada,
          horaInicioLlamada: orden.horaInicioLlamada,
          horaFinLlamada: orden.horaFinLlamada,
          observacionLlamada: orden.observacionLlamada,
        }
      : null);
  const llamadas = normalizeCalls(llamadasRaw).map((ll: any) => ({
    estadoLlamada: ll?.estadoLlamada,
    horaInicioLlamada: ll?.horaInicioLlamada,
    horaFinLlamada: ll?.horaFinLlamada,
    observacionLlamada: ll?.observacionLlamada,
    resultado: ll?.resultado,
    observacion: ll?.observacion,
    gestora: ll?.gestora,
    user: ll?.user,
    fecha: ll?.fecha || null,
  }));
  const materialesArr =
    (Array.isArray(data.materialesConsumidos) && data.materialesConsumidos) ||
    (Array.isArray(liquidacion.materialesConsumidos) && liquidacion.materialesConsumidos) ||
    [];
  const materialesFromResumen =
    !materialesArr.length && data.materialesLiquidacion && typeof data.materialesLiquidacion === "object"
      ? Object.entries(data.materialesLiquidacion)
          .filter(([k, v]) => k !== "acta" && k !== "bobinaMetros" && Number(v) > 0)
          .map(([k, v]) => ({ materialId: k, nombre: k, cantidad: Number(v), metros: 0, status: "OK" }))
      : [];
  const materialesBase = materialesArr.length ? materialesArr : materialesFromResumen;
  const materiales = materialesBase.map((m: any) => ({
    materialId: m?.materialId || m?.id || "",
    nombre: m?.nombre || m?.materialId || m?.id || "",
    tipo: m?.tipo || "",
    cantidad: m?.und ?? m?.cantidad ?? 0,
    metros: m?.metros ?? 0,
    status: m?.status,
  }));
  const planValue = Array.isArray(data.plan)
    ? data.plan.join(" | ")
    : (data.plan || orden.plan || orden.idenServi || "");

  return {
    id: docId,
    ...data,
    cliente: data.cliente || orden.cliente || "",
    codigoCliente: data.codigoCliente || orden.codiSeguiClien || "",
    documento: data.documento || orden.numeroDocumento || "",
    direccion: data.direccion || orden.direccion || "",
    acta: String(data.ACTA || data.acta || ""),
    cuadrillaNombre: data.cuadrillaNombre || orden.cuadrillaNombre || "",
    tipoCuadrilla: data.tipoCuadrilla || orden.tipoCuadrilla || "",
    tipoOrden: orden.tipoOrden || orden.tipo || data.tipoOrden || "",
    plan: planValue,
    orderId: data.ordenId || orden.ordenId || orden.ordenDocId || "",
    fechaInstalacion: fechaInstalacionAt,
    fechaOrdenYmd: data.fechaOrdenYmd || orden.fechaFinVisiYmd || orden.fSoliYmd || "",
    fechaInstalacionYmd: data.fechaInstalacionYmd || servicios.ymd || orden.fechaFinVisiYmd || orden.fSoliYmd || "",
    planGamer: servicios.planGamer || "",
    kitWifiPro: servicios.kitWifiPro || "",
    servicioCableadoMesh: servicios.servicioCableadoMesh || "",
    cat5e: servicios.cat5e ?? 0,
    cat6: servicios.cat6 ?? 0,
    metrajeInstalado: data.metraje_instalado || data.metrajeInstalado || data.materialesLiquidacion?.bobinaMetros || "",
    rotuloNapCto: liquidacion.rotuloNapCto || data.rotuloNapCto || orden.rotuloNapCto || "",
    observacion: liquidacion.observacion || data.observacion || "",
    liquidadoAt: toIso(liquidacion.at) || null,
    liquidadoBy: liquidacion.by || null,
    corregido: data.corregido || data.correccionPendiente || false,
    corregidoAt: toIso(data.corregidaAt || data.correccionAt) || null,
    corregidoBy: data.corregidaBy || data.correccionBy || null,
    llamadas,
    equiposInstalados: equipos,
    materialesConsumidos: materiales,
    snONT,
    snMESH,
    snBOX,
    snFONO,
  };
}

function canUse(session: any) {
  const roles = (session.access.roles || []).map((r: any) => String(r || "").toUpperCase());
  return (
    session.isAdmin ||
    (session.access.areas || []).includes("INSTALACIONES") ||
    roles.includes("COORDINADOR") ||
    roles.includes("TECNICO") ||
    session.permissions.includes("EQUIPOS_VIEW") ||
    session.permissions.includes("EQUIPOS_EDIT")
  );
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    if (!canUse(session)) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const mode = String(searchParams.get("mode") || "campo").toLowerCase() === "instalados" ? "instalados" : "campo";

    const roles = (session.access.roles || []).map((r: any) => String(r || "").toUpperCase());
    const isCoordOnly = roles.includes("COORDINADOR") && !session.isAdmin;

    const db = adminDb();
    const eqSnap = await db
      .collection("equipos")
      .where("auditoria.requiere", "==", true)
      .limit(12000)
      .get();

    const rowsBase = eqSnap.docs.map((d) => toPlain({ id: d.id, ...d.data() }));
    const toUpper = (v: any) => asStr(v).toUpperCase();
    const isInstalado = (e: any) => toUpper(e?.estado) === "INSTALADO";

    let rows = rowsBase.filter((e: any) => (mode === "instalados" ? isInstalado(e) : !isInstalado(e)));

    if (isCoordOnly) {
      const cuadSnap = await db
        .collection("cuadrillas")
        .where("area", "==", "INSTALACIONES")
        .where("coordinadorUid", "==", session.uid)
        .limit(500)
        .get();
      const cuadSet = new Set(
        cuadSnap.docs
          .map((d) => norm((d.data() as any)?.nombre || d.id))
          .filter(Boolean)
      );
      rows = rows.filter((e: any) => cuadSet.has(norm(e?.ubicacion)));
    }

    if (mode === "instalados") {
      const sns = Array.from(
        new Set(
          rows
            .map((e: any) => norm(e?.SN))
            .filter(Boolean)
        )
      );

      const instBySn = new Map<string, any>();
      const registerInst = (docId: string, data: any) => {
        const detalle = normalizeInstalacion(docId, data);
        for (const [sn, mappedDetalle] of collectInstSnMap(detalle)) {
          if (!instBySn.has(sn)) instBySn.set(sn, mappedDetalle);
        }
      };

      for (let i = 0; i < sns.length; i += 10) {
        const chunk = sns.slice(i, i + 10);
        const [ontSnap, fonoSnap, meshSnap, boxSnap] = await Promise.all([
          db.collection("instalaciones").where("snONT", "in", chunk).limit(1000).get(),
          db.collection("instalaciones").where("snFONO", "in", chunk).limit(1000).get(),
          db.collection("instalaciones").where("snMESH", "array-contains-any", chunk).limit(1000).get(),
          db.collection("instalaciones").where("snBOX", "array-contains-any", chunk).limit(1000).get(),
        ]);

        for (const snap of [ontSnap, fonoSnap, meshSnap, boxSnap]) {
          for (const d of snap.docs) registerInst(d.id, d.data());
        }
      }

      const pendientes = rows.filter((e: any) => !instBySn.has(norm(e?.SN)));
      const clientesPendientes = Array.from(
        new Set(
          pendientes
            .map((e: any) => asStr(e?.cliente))
            .filter(Boolean)
        )
      );

      for (let i = 0; i < clientesPendientes.length; i += 10) {
        const chunk = clientesPendientes.slice(i, i + 10);
        const instSnap = await db.collection("instalaciones").where("cliente", "in", chunk).limit(1000).get();
        for (const d of instSnap.docs) registerInst(d.id, d.data());
      }

      rows = rows.map((e: any) => {
        const detalle = instBySn.get(norm(e?.SN));
        return detalle ? { ...e, detalleInstalacion: detalle } : e;
      });
    }

    return NextResponse.json({ ok: true, items: rows, mode });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
