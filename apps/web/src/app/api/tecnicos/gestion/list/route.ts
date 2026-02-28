import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

function shortName(full: string, fallback: string) {
  const parts = String(full || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = parts[0] || "";
  const firstLast = parts.length >= 4 ? parts[2] || "" : parts[1] || "";
  return `${first} ${firstLast}`.trim() || fallback;
}

function toDateStr(v: any) {
  if (!v) return "";
  if (typeof v?.toDate === "function") return v.toDate().toLocaleDateString("es-PE");
  if (typeof v?.seconds === "number") return new Date(v.seconds * 1000).toLocaleDateString("es-PE");
  if (typeof v?._seconds === "number") return new Date(v._seconds * 1000).toLocaleDateString("es-PE");
  if (typeof v === "string") return v;
  return "";
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
    const areas = (session.access.areas || []).map((a) => String(a || "").toUpperCase());
    const canUse =
      session.isAdmin ||
      session.permissions.includes("CUADRILLAS_MANAGE") ||
      session.permissions.includes("MATERIALES_TRANSFER_SERVICIO") ||
      session.permissions.includes("MATERIALES_DEVOLUCION") ||
      (areas.includes("INSTALACIONES") &&
        (roles.includes("GESTOR") || roles.includes("ALMACEN") || roles.includes("COORDINADOR"))) ||
      (areas.includes("MANTENIMIENTO") &&
        (roles.includes("GESTOR") || roles.includes("ALMACEN") || roles.includes("COORDINADOR")));
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const area = String(searchParams.get("area") || "").trim().toUpperCase();

    const isCoord = roles.includes("COORDINADOR");
    const isPriv = session.isAdmin || roles.includes("GERENCIA") || roles.includes("ALMACEN") || roles.includes("RRHH");

    let visibleSet: Set<string> | null = null;
    if (isCoord && !isPriv && !session.isAdmin && !isGestor) {
      const coordSnap = await adminDb()
        .collection("cuadrillas")
        .where("coordinadorUid", "==", session.uid)
        .get();
      visibleSet = new Set(coordSnap.docs.map((d) => d.id));
    }

    const accessSnap = await adminDb()
      .collection("usuarios_access")
      .where("roles", "array-contains", "TECNICO")
      .limit(2000)
      .get();

    const uids = accessSnap.docs
      .map((d) => ({ id: d.id, data: d.data() as any }))
      .filter((r) => {
        if (!area) return true;
        const areasArr = Array.isArray(r.data?.areas) ? r.data.areas : [];
        return areasArr.map((a: any) => String(a || "").toUpperCase()).includes(area);
      })
      .map((r) => r.id);
    const userRefs = uids.map((uid) => adminDb().collection("usuarios").doc(uid));
    const userSnaps = uids.length ? await adminDb().getAll(...userRefs) : [];

    let cuadQuery = adminDb().collection("cuadrillas") as FirebaseFirestore.Query;
    if (area) {
      cuadQuery = cuadQuery.where("area", "==", area);
    }
    const cuadrillasSnap = await cuadQuery.get();
    const tecnicoToCuadrilla = new Map<string, { id: string; nombre: string }>();
    cuadrillasSnap.docs.forEach((d) => {
      const data = d.data() as any;
      if (visibleSet && !visibleSet.has(d.id)) return;
      const tecnicos = Array.isArray(data?.tecnicosUids) ? data.tecnicosUids : [];
      tecnicos.forEach((uid: string) => {
        tecnicoToCuadrilla.set(uid, { id: d.id, nombre: String(data?.nombre || d.id) });
      });
    });

    let items = userSnaps.map((snap) => {
      const data = (snap.data() as any) || {};
      const nombres = String(data?.nombres || "").trim();
      const apellidos = String(data?.apellidos || "").trim();
      const full = `${nombres} ${apellidos}`.trim() || snap.id;
      const nombreCorto = shortName(full, snap.id);
      const cuad = tecnicoToCuadrilla.get(snap.id);
      return {
        id: snap.id,
        nombres: nombres || "",
        apellidos: apellidos || "",
        nombreCorto,
        dni_ce: data?.nroDoc || data?.dni_ce || data?.dni || data?.documento || "",
        celular: data?.celular || "",
        email: data?.email || "",
        fecha_nacimiento: toDateStr(data?.fNacimiento || data?.fecha_nacimiento || data?.fechaNacimiento || ""),
        estado_usuario: data?.estadoPerfil || data?.estado_usuario || data?.estado || "",
        cuadrillaId: cuad?.id || "",
        cuadrillaNombre: cuad?.nombre || "",
      };
    });

    if (visibleSet) {
      items = items.filter((it) => it.cuadrillaId && visibleSet?.has(it.cuadrillaId));
    }

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
