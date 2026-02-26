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
      session.permissions.includes("VENTAS_VER_ALL");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "MISSING_ID" }, { status: 400 });
    const snap = await adminDb().collection("cuadrillas").doc(id).get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    const d = snap.data() as any;
    const rawSegmento = String(d.r_c || d.categoria || d.segmento || "")
      .trim()
      .toUpperCase();
    const segmento = rawSegmento === "CONDOMINIO" ? "CONDOMINIO" : "RESIDENCIAL";
    const rawTipo = String(d.tipoZona || d.tipo || "")
      .trim()
      .toUpperCase();
    const tipo = rawTipo === "ALTO_VALOR" ? "ALTO_VALOR" : "REGULAR";
    const coordinadorUid = d.coordinadorUid || d.coordinador || "";
    const tecnicosUids = Array.isArray(d.tecnicosUids) ? d.tecnicosUids : Array.isArray(d.tecnicos) ? d.tecnicos : [];

    const userRefs = [
      ...(coordinadorUid ? [adminDb().collection("usuarios").doc(coordinadorUid)] : []),
      ...tecnicosUids.map((uid: string) => adminDb().collection("usuarios").doc(uid)),
    ];
    const userSnaps = userRefs.length ? await adminDb().getAll(...userRefs) : [];
    const userMap = new Map(
      userSnaps.map((s) => {
        const data = s.data() as any;
        const nombres = String(data?.nombres || "").trim();
        const apellidos = String(data?.apellidos || "").trim();
        const displayName = `${nombres} ${apellidos}`.trim() || s.id;
        return [s.id, displayName];
      })
    );

    const coordinadorNombre = coordinadorUid ? userMap.get(coordinadorUid) || coordinadorUid : "";
    const tecnicosNombres = tecnicosUids.map((uid: string) => userMap.get(uid) || uid);

    return NextResponse.json({
      ok: true,
      id,
      nombre: d.nombre || "",
      segmento,
      tipo,
      zonaId: d.zonaId || "",
      tipoZona: d.tipoZona || "",
      vehiculo: d.vehiculo || "",
      coordinadorUid,
      coordinadorNombre,
      tecnicosUids,
      tecnicosNombres,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}

