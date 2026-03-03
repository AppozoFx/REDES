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
      session.permissions.includes("VENTAS_DESPACHO_MANT") ||
      session.permissions.includes("VENTAS_EDIT") ||
      session.permissions.includes("VENTAS_VER") ||
      session.permissions.includes("VENTAS_VER_ALL") ||
      session.permissions.includes("ORDENES_LIQUIDAR") ||
      (session.access.areas || []).includes("INSTALACIONES") ||
      (session.access.roles || []).includes("GESTOR") ||
      (session.access.roles || []).includes("COORDINADOR");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
    const isGestor = roles.includes("GESTOR");
    const isCoord = roles.includes("COORDINADOR");
    const isPriv = session.isAdmin || roles.includes("GERENCIA") || roles.includes("ALMACEN") || roles.includes("RRHH");

    const { searchParams } = new URL(req.url);
    const area = searchParams.get("area");
    const coordinadorUid = searchParams.get("coordinadorUid");

    const includeAll = String(searchParams.get("includeAll") || "").toLowerCase() === "true";

    let q: FirebaseFirestore.Query = adminDb().collection("cuadrillas");
    if (!includeAll) {
      q = q.where("estado", "==", "HABILITADO");
    }
    if (area) {
      q = q.where("area", "==", area);
    }
    if (coordinadorUid) {
      q = q.where("coordinadorUid", "==", coordinadorUid);
    }
    if (isCoord && !isPriv && !session.isAdmin && !isGestor) {
      q = q.where("coordinadorUid", "==", session.uid);
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
        "tecnicos",
        "estado"
      )
      .limit(500)
      .get();

    let items = snap.docs
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
          tecnicosUids: Array.isArray(data?.tecnicosUids)
            ? data.tecnicosUids
            : Array.isArray(data?.tecnicos)
            ? data.tecnicos
            : [],
          estado: data?.estado ?? "",
        };
      })
      .sort((a, b) =>
        String(a.nombre).localeCompare(String(b.nombre), "es", { sensitivity: "base" })
      );

    const assignedTecnicosAll = Array.from(
      new Set(
        items
          .flatMap((it) => (Array.isArray(it.tecnicosUids) ? it.tecnicosUids : []))
          .map((x) => String(x || "").trim())
          .filter(Boolean)
      )
    );


    return NextResponse.json({ ok: true, items, assignedTecnicosAll });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}



