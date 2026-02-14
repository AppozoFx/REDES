import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

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
      session.permissions.includes("CUADRILLAS_MANAGE") ||
      session.permissions.includes("EQUIPOS_DESPACHO") ||
      session.permissions.includes("EQUIPOS_DEVOLUCION") ||
      session.permissions.includes("MATERIALES_TRANSFER_SERVICIO") ||
      session.permissions.includes("MATERIALES_DEVOLUCION") ||
      session.permissions.includes("VENTAS_DESPACHO_INST") ||
      session.permissions.includes("VENTAS_DESPACHO_AVER") ||
      session.permissions.includes("VENTAS_EDIT") ||
      session.permissions.includes("VENTAS_VER") ||
      session.permissions.includes("VENTAS_VER_ALL") ||
      session.permissions.includes("ORDENES_LIQUIDAR") ||
      (session.access.areas || []).includes("INSTALACIONES") ||
      (session.access.roles || []).includes("GESTOR") ||
      (session.access.roles || []).includes("COORDINADOR");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const area = searchParams.get("area");
    const coordinadorUid = searchParams.get("coordinadorUid");

    const includeAll = String(searchParams.get("includeAll") || "").toLowerCase() === "true";

    let q = adminDb().collection("cuadrillas");
    if (!includeAll) {
      q = q.where("estado", "==", "HABILITADO");
    }
    if (area) {
      q = q.where("area", "==", area);
    }
    if (coordinadorUid) {
      q = q.where("coordinadorUid", "==", coordinadorUid);
    }

    const snap = await q
      .select(
        "nombre",
        "r_c",
        "categoria",
        "zonaId",
        "tipoZona",
        "placa",
        "vehiculo",
        "numeroCuadrilla",
        "coordinadorUid",
        "gestorUid",
        "tecnicosUids",
        "estado"
      )
      .limit(500)
      .get();

    const items = snap.docs
      .map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          nombre: data?.nombre ?? "",
          r_c: data?.r_c ?? data?.categoria ?? "",
          categoria: data?.categoria ?? "",
          zonaId: data?.zonaId ?? "",
          tipoZona: data?.tipoZona ?? "",
          placa: data?.placa ?? "",
          vehiculo: data?.vehiculo ?? "",
          numeroCuadrilla: data?.numeroCuadrilla ?? "",
          coordinadorUid: data?.coordinadorUid ?? "",
          gestorUid: data?.gestorUid ?? "",
          tecnicosUids: Array.isArray(data?.tecnicosUids) ? data.tecnicosUids : [],
          estado: data?.estado ?? "",
        };
      })
      .sort((a, b) =>
        String(a.nombre).localeCompare(String(b.nombre), "es", { sensitivity: "base" })
      );

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
