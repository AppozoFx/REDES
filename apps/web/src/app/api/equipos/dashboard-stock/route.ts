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

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
    const canUse =
      session.isAdmin ||
      session.permissions.includes("EQUIPOS_VIEW") ||
      session.permissions.includes("EQUIPOS_EDIT") ||
      session.permissions.includes("EQUIPOS_DESPACHO") ||
      session.permissions.includes("EQUIPOS_DEVOLUCION") ||
      (session.access.areas || []).includes("INSTALACIONES") ||
      roles.includes("COORDINADOR") ||
      roles.includes("TECNICO");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const db = adminDb();
    const isCoord = roles.includes("COORDINADOR");
    const isTecnico = roles.includes("TECNICO");
    const viewerScope: "all" | "coordinador" | "tecnico" = isCoord ? "coordinador" : isTecnico ? "tecnico" : "all";

    const [cqSnap, usSnap, eqSnap] = await Promise.all([
      db.collection("cuadrillas").limit(2500).get(),
      db.collection("usuarios").select("nombres", "nombre", "apellidos", "uid").limit(4000).get(),
      db
        .collection("equipos")
        .where("estado", "in", ["ALMACEN", "CAMPO"])
        .select(
          "SN",
          "equipo",
          "estado",
          "ubicacion",
          "descripcion",
          "tecnicos",
          "tecnicoNombre",
          "tecnico_name",
          "tecnico",
          "tecnico1",
          "tecnico_uid",
          "tecnicoUid",
          "tecnicoId",
          "tecnico_id",
          "asignadoA",
          "asignado_a",
          "asignado",
          "responsable",
          "user",
          "userId",
          "user_uid",
          "f_despacho",
          "f_despachoYmd",
          "f_ingreso",
          "f_ingresoYmd",
          "guia_despacho",
          "guiaDespacho",
          "guia_ingreso",
          "guiaIngreso",
          "guia"
        )
        .limit(12000)
        .get(),
    ]);

    let cuadrillas = cqSnap.docs.map((d) => toPlain({ id: d.id, ...d.data() }));
    const usuarios = usSnap.docs.map((d) => toPlain({ id: d.id, ...d.data() }));
    let equipos = eqSnap.docs.map((d) => toPlain({ id: d.id, ...d.data() }));

    // Restriccion de visibilidad:
    // - COORDINADOR: solo sus cuadrillas.
    // - TECNICO: solo cuadrillas donde este asignado.
    // - Resto: vista completa.
    if (viewerScope !== "all") {
      const uid = String(session.uid || "").trim();
      const asArray = (v: any) => (Array.isArray(v) ? v.map((x) => String(x || "").trim()).filter(Boolean) : []);
      const asStr = (v: any) => String(v || "").trim();

      const isSameUid = (v: any) => asStr(v) === uid;

      const tecnicoMatch = (c: any) => {
        const list = [
          ...asArray(c?.tecnicosUids),
          ...asArray(c?.tecnicosIds),
          ...asArray(c?.tecnicos),
        ];
        return list.includes(uid);
      };

      const coordMatch = (c: any) => {
        return (
          isSameUid(c?.coordinadorUid) ||
          isSameUid(c?.coordinadoraUid) ||
          isSameUid(c?.coordinadorId) ||
          isSameUid(c?.coordinadoraId) ||
          isSameUid(c?.coordinador?.uid) ||
          isSameUid(c?.coordinadora?.uid)
        );
      };

      cuadrillas = cuadrillas.filter((c) => (viewerScope === "coordinador" ? coordMatch(c) : tecnicoMatch(c)));

      const allowed = new Set<string>();
      for (const c of cuadrillas) {
        const id = asStr(c?.id).toUpperCase();
        const nombre = asStr(c?.nombre).toUpperCase();
        const numero = asStr(c?.numeroCuadrilla).toUpperCase();
        if (id) allowed.add(id);
        if (nombre) allowed.add(nombre);
        if (numero) allowed.add(numero);
      }

      equipos = equipos.filter((e) => {
        const ubic = asStr(e?.ubicacion).toUpperCase();
        if (!ubic) return false;
        return allowed.has(ubic);
      });
    }

    return NextResponse.json({
      ok: true,
      cuadrillas,
      usuarios,
      equipos,
      meta: { equiposCount: equipos.length, truncated: eqSnap.size >= 12000, viewerScope },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
