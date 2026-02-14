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
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  return (last ? `${first} ${last}` : first) || fallback;
}

function toDateStr(v: any) {
  if (!v) return "";
  if (typeof v?.toDate === "function") return v.toDate().toLocaleDateString("es-PE");
  if (typeof v?.seconds === "number") return new Date(v.seconds * 1000).toLocaleDateString("es-PE");
  if (typeof v?._seconds === "number") return new Date(v._seconds * 1000).toLocaleDateString("es-PE");
  if (typeof v === "string") return v;
  return "";
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
      session.permissions.includes("CUADRILLAS_MANAGE") ||
      ((session.access.areas || []).includes("INSTALACIONES") &&
        (roles.includes("GESTOR") || roles.includes("ALMACEN")));
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const accessSnap = await adminDb()
      .collection("usuarios_access")
      .where("roles", "array-contains", "TECNICO")
      .limit(2000)
      .get();

    const uids = accessSnap.docs.map((d) => d.id);
    const userRefs = uids.map((uid) => adminDb().collection("usuarios").doc(uid));
    const userSnaps = uids.length ? await adminDb().getAll(...userRefs) : [];

    const cuadrillasSnap = await adminDb().collection("cuadrillas").get();
    const tecnicoToCuadrilla = new Map<string, { id: string; nombre: string }>();
    cuadrillasSnap.docs.forEach((d) => {
      const data = d.data() as any;
      const tecnicos = Array.isArray(data?.tecnicosUids) ? data.tecnicosUids : [];
      tecnicos.forEach((uid: string) => {
        tecnicoToCuadrilla.set(uid, { id: d.id, nombre: String(data?.nombre || d.id) });
      });
    });

    const items = userSnaps.map((snap, i) => {
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

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
