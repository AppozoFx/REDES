import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

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

export const runtime = "nodejs";

function todayLimaYm() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
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
    const canUse =
      session.isAdmin ||
      session.permissions.includes("ORDENES_LIQUIDAR") ||
      (session.access.areas || []).includes("INSTALACIONES");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const ymd = String(searchParams.get("ymd") || "").trim();
    const ym = String(searchParams.get("ym") || (ymd ? "" : todayLimaYm()));

    let q: FirebaseFirestore.Query = adminDb().collection("instalaciones");

    if (ymd) {
      q = q.where("fechaOrdenYmd", "==", ymd);
    } else {
      const ymEff = ym || todayLimaYm();
      const start = `${ymEff}-01`;
      const end = `${ymEff}-31`;
      q = q.where("fechaOrdenYmd", ">=", start).where("fechaOrdenYmd", "<=", end);
    }

    const snap = await q.orderBy("fechaOrdenYmd", "desc").limit(2000).get();

    const toIso = (v: any) => {
      if (!v) return null;
      if (typeof v?.toDate === "function") return v.toDate().toISOString();
      if (typeof v?.seconds === "number") return new Date(v.seconds * 1000).toISOString();
      if (typeof v?._seconds === "number") return new Date(v._seconds * 1000).toISOString();
      if (typeof v === "string") return v;
      return null;
    };
    const baseItems = snap.docs.map((d) => {
      const data = d.data() as any;
      const orden = data.orden || {};
      const liquidacion = data.liquidacion || {};
      const serviciosRaw = data.servicios || {};
      const servicios =
        serviciosRaw && typeof serviciosRaw === "object" && Object.keys(serviciosRaw).length > 0
          ? serviciosRaw
          : (liquidacion.servicios || {});
      const equipos = Array.isArray(data.equiposInstalados) ? data.equiposInstalados : [];

      const byTipo = (tipo: string) =>
        equipos.filter((e: any) => String(e?.tipo || "").toUpperCase().includes(tipo));

      const snONT = (byTipo("ONT")[0]?.sn || data.snONT || "");
      const snMESH = byTipo("MESH").map((e: any) => e.sn).filter(Boolean);
      const snBOX = byTipo("BOX").map((e: any) => e.sn).filter(Boolean);
      const snFONO = (byTipo("FONO")[0]?.sn || data.snFONO || "");

      const fechaOrdenAt =
        toIso(orden.fechaFinVisiAt) ||
        toIso(orden.fSoliAt) ||
        toIso(orden.fechaIniVisiAt) ||
        null;
      const fechaInstalacionAt =
        fechaOrdenAt || toIso(data.fechaInstalacionAt) || toIso(liquidacion.at) || toIso(data.updatedAt) || null;

      const llamadasRaw = data.llamadas || orden.llamadas || null;
      const llamadasArr = Array.isArray(llamadasRaw)
        ? llamadasRaw
        : llamadasRaw && typeof llamadasRaw === "object"
          ? [llamadasRaw]
          : [];
      const llamadas = llamadasArr.map((ll: any) => ({
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

      const materiales = Array.isArray(data.materialesConsumidos)
        ? data.materialesConsumidos.map((m: any) => ({
            materialId: m?.materialId,
            nombre: m?.nombre || m?.materialId,
            tipo: m?.tipo,
            cantidad: m?.und ?? m?.cantidad ?? 0,
            metros: m?.metros ?? 0,
            status: m?.status,
          }))
        : [];

      const coordinadorUid = String(
        orden.coordinadorCuadrilla || orden.coordinador || orden.gestorCuadrilla || ""
      ).trim();

      return {
        id: d.id,
        ...data,
        // Flattened fields for UI
        cliente: data.cliente || orden.cliente || "",
        codigoCliente: data.codigoCliente || orden.codiSeguiClien || "",
        documento: data.documento || orden.numeroDocumento || "",
        direccion: data.direccion || orden.direccion || "",
        acta: String(data.ACTA || data.acta || ""),
        coordinador: coordinadorUid,
        cuadrillaNombre: data.cuadrillaNombre || orden.cuadrillaNombre || "",
        tipoCuadrilla: data.tipoCuadrilla || orden.tipoCuadrilla || "",
        tipoOrden: data.tipoOrden || orden.tipoOrden || orden.tipo || "",
        plan: data.plan || orden.plan || orden.idenServi || "",
        orderId: data.ordenId || orden.ordenId || orden.ordenDocId || "",
        fechaInstalacion: fechaInstalacionAt,
        fechaOrdenYmd:
          data.fechaOrdenYmd ||
          orden.fechaFinVisiYmd ||
          orden.fSoliYmd ||
          "",
        fechaInstalacionYmd:
          data.fechaInstalacionYmd ||
          servicios.ymd ||
          orden.fechaFinVisiYmd ||
          orden.fSoliYmd ||
          "",
        planGamer: servicios.planGamer || "",
        kitWifiPro: servicios.kitWifiPro || "",
        servicioCableadoMesh: servicios.servicioCableadoMesh || "",
        cat5e: servicios.cat5e ?? 0,
        cat6: servicios.cat6 ?? 0,
        observacion: data.observacion || liquidacion.observacion || "",
        liquidadoAt: toIso(liquidacion.at) || null,
        liquidadoBy: liquidacion.by || null,
        corregido: data.corregido || data.correccionPendiente || false,
        corregidoAt: toIso(data.corregidaAt || data.correccionAt) || null,
        corregidoBy: data.corregidaBy || data.correccionBy || null,
        llamadas,
        materialesConsumidos: materiales,
        snONT,
        snMESH,
        snBOX,
        snFONO,
      };
    });

    const uids = Array.from(
      new Set(
        baseItems
          .map((i) => [i.liquidadoBy, i.corregidoBy])
          .flat()
          .filter((v) => typeof v === "string" && v.length > 0)
      )
    );

    let uidToName: Record<string, string> = {};
    if (uids.length) {
      const refs = uids.map((uid) => adminDb().collection("usuarios").doc(uid));
      const userSnaps = await adminDb().getAll(...refs);
      uidToName = Object.fromEntries(
        userSnaps.map((s) => {
          const u = (s.data() as any) || {};
          const name = String(u.displayName || `${u.nombres || ""} ${u.apellidos || ""}`.trim() || u.email || s.id);
          return [s.id, name];
        })
      );
    }

    const coordUids = Array.from(new Set(baseItems.map((i) => String(i.coordinador || "").trim()).filter(Boolean)));
    const coordRefs = coordUids.map((uid) => adminDb().collection("usuarios").doc(uid));
    const coordSnaps = coordUids.length ? await adminDb().getAll(...coordRefs) : [];
    const coordMap = new Map(
      coordSnaps.map((s, i) => {
        const fallback = coordUids[i] || s.id;
        const data = s.data() as any;
        const nombres = String(data?.nombres || "").trim();
        const apellidos = String(data?.apellidos || "").trim();
        const full = `${nombres} ${apellidos}`.trim();
        const label = shortName(full || fallback);
        return [fallback, label || fallback];
      })
    );

    const items = baseItems.map((i) => ({
      ...i,
      liquidadoBy: i.liquidadoBy ? uidToName[i.liquidadoBy] || i.liquidadoBy : null,
      corregidoBy: i.corregidoBy ? uidToName[i.corregidoBy] || i.corregidoBy : null,
      coordinador: i.coordinador ? coordMap.get(i.coordinador) || i.coordinador : "",
    }));

    return NextResponse.json({
      ok: true,
      items,
      ymd: ymd || null,
      ym: ymd ? null : (ym || todayLimaYm()),
      today: todayLimaYmd(),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
