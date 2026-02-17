import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";
import { collectHeaders, flattenObject } from "@/lib/instalacionesTemplate";

export const runtime = "nodejs";

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
    const limit = Math.min(5000, Math.max(1, Number(searchParams.get("limit") || 2000)));
    const snap = await adminDb().collection("instalaciones").limit(limit).get();

    const rows = snap.docs.map((d) => {
      const flat = flattenObject(d.data());
      return { id: d.id, ...flat };
    });

    const sampleRow = {
      id: "EJEMPLO_NO_IMPORTAR",
      codigoCliente: "EJEMPLO_NO_IMPORTAR",
      estado: "Finalizada",
      tipo: "Multifamiliar",
      cuadrillaNombre: "K13 RESIDENCIAL",
      documento: "71374493",
      ordenId: "2885251",
      ordenDocId: "2885251",
      tipoCuadrilla: "RESIDENCIAL",
      fechaInstalacionYmd: "2026-02-16",
      fechaInstalacionHm: "12:44",
      fechaInstalacionAt: "2026-02-16T10:00:00.000Z",
      fechaOrdenYmd: "2026-02-16",
      telefono: "976527105",
      plan: "INTERNET 1000",
      direccion: "CALLE MIGUEL DE ARRIAGA 120",
      cuadrillaId: "K13_RESIDENCIAL",
      cliente: "JHORDY WALTHER SAAVEDRA ROJAS",
      ACTA: "005-0068681",
      correccionPendiente: false,
      "llamadas.estadoLlamada": "",
      "llamadas.horaInicioLlamada": "",
      "llamadas.horaFinLlamada": "",
      "llamadas.observacionLlamada": "",
      "servicios.planGamer": "GAMER",
      "servicios.cat5e": 2,
      "servicios.kitWifiPro": "KIT WIFI PRO (EN VENTA)",
      "servicios.puntosUTP": 3,
      "servicios.servicioCableadoMesh": "SERVICIO CABLEADO DE MESH",
      "servicios.cat6": 1,
      "liquidacion.ymd": "2026-02-16",
      "liquidacion.estado": "LIQUIDADO",
      "liquidacion.at": "2026-02-16T10:00:00.000Z",
      "liquidacion.hm": "12:44",
      "liquidacion.by": "UID_LIQUIDADOR",
      "liquidacion.rotuloNapCto": "WN-250-2356287",
      "liquidacion.observacion": "OBSERVACION EJEMPLO",
      "liquidacion.servicios.planGamer": "GAMER",
      "liquidacion.servicios.cat5e": 2,
      "liquidacion.servicios.kitWifiPro": "KIT WIFI PRO (EN VENTA)",
      "liquidacion.servicios.puntosUTP": 3,
      "liquidacion.servicios.servicioCableadoMesh": "SERVICIO CABLEADO DE MESH",
      "liquidacion.servicios.cat6": 1,
      "materialesLiquidacion.templador": 2,
      "materialesLiquidacion.acta": "005-0068681",
      "materialesLiquidacion.bobinaMetros": 0,
      "materialesLiquidacion.anclajeP": 2,
      "materialesLiquidacion.clevi": 2,
      "materialesLiquidacion.precon": "PRECON_50",
      "orden.estado": "Finalizada",
      "orden.tipo": "Multifamiliar",
      "orden.zonaDistrito": "Pueblo Libre",
      "orden.fechaFinVisiYmd": "2026-02-16",
      "orden.cuadrillaNombre": "K13 RESIDENCIAL",
      "orden.fechaIniVisiHm": "08:42",
      "orden.cantFONOwin": "0",
      "orden.codiSeguiClien": "2758257",
      "orden.ordenId": "2885251",
      "orden.fechaIniVisiYmd": "2026-02-16",
      "orden.cantMESHwin": "1",
      "orden.tipoCuadrilla": "RESIDENCIAL",
      "orden.fechaIniVisiAt": "2026-02-16T08:42:00.000Z",
      "orden.tipoTraba": "INSTALACION POSIBLE FRAUDE",
      "orden.fSoliYmd": "2026-02-16",
      "orden.numeroDocumento": "71374493",
      "orden.telefono": "976527105",
      "orden.fSoliAt": "2026-02-16T08:00:00.000Z",
      "orden.lat": -12.074119,
      "orden.coordinadorCuadrilla": "UID_COORDINADOR",
      "orden.fechaFinVisiHm": "10:24",
      "orden.lng": -77.074187,
      "orden.tipoOrden": "RESIDENCIAL",
      "orden.tipoClienId": "5",
      "orden.direccion": "CALLE MIGUEL DE ARRIAGA 120",
      "orden.fSoliHm": "08:00",
      "orden.cuadrillaId": "K13_RESIDENCIAL",
      "orden.direccion1": "CALLE MIGUEL DE ARRIAGA 120",
      "orden.georeferenciaRaw": "-12.0741190,-77.0741870",
      "orden.cliente": "JHORDY WALTHER SAAVEDRA ROJAS",
      "orden.cuadrillaRaw": "K 13 M&D SGI WILSON CHUCTAYA FLORES",
      "orden.fechaFinVisiAt": "2026-02-16T10:24:00.000Z",
      "orden.zonaCuadrilla": "OESTE_02",
      "orden.region": "REGION OESTE 2 LIMA",
      "orden.dia": "Lunes",
      "orden.idenServi": "INTERNET 1000",
      "orden.cantBOXwin": "0",
      "orden.gestorCuadrilla": "UID_GESTOR",
      "equiposByTipo.ONT": 1,
      "equiposByTipo.MESH": 1,
      equiposInstalados:
        '[{"tipo":"ONT","sn":"SN123"},{"tipo":"MESH","sn":"MESH001"}]',
      materialesConsumidos:
        '[{"materialId":"CABLE_UTP","nombre":"CABLE UTP","und":1,"metros":25}]',
    };

    const rowsWithSample = [sampleRow, ...rows];
    const headers = collectHeaders(rowsWithSample);

    return NextResponse.json({
      ok: true,
      headers,
      rows: rowsWithSample,
      count: rows.length,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
