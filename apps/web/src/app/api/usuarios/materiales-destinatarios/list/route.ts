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
      session.permissions.includes("MATERIALES_TRANSFER_SERVICIO") ||
      session.permissions.includes("MATERIALES_DEVOLUCION") ||
      session.permissions.includes("CUADRILLAS_MANAGE") ||
      (areas.includes("INSTALACIONES") &&
        (roles.includes("GESTOR") || roles.includes("ALMACEN") || roles.includes("COORDINADOR")));
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const area = String(searchParams.get("area") || "INSTALACIONES").trim().toUpperCase();

    const accessSnap = await adminDb().collection("usuarios_access").limit(2500).get();
    const accessRows = accessSnap.docs
      .map((d) => ({ uid: d.id, data: (d.data() as any) || {} }))
      .filter((row) => String(row.data?.estadoAcceso || "").toUpperCase() === "HABILITADO")
      .filter((row) => {
        if (!area) return true;
        const rowAreas = Array.isArray(row.data?.areas) ? row.data.areas : [];
        return rowAreas.map((a: any) => String(a || "").toUpperCase()).includes(area);
      });

    const uids = accessRows.map((row) => row.uid);
    const userRefs = uids.map((uid) => adminDb().collection("usuarios").doc(uid));
    const userSnaps = uids.length ? await adminDb().getAll(...userRefs) : [];

    const cuadrillasSnap = await adminDb().collection("cuadrillas").where("area", "==", area || "INSTALACIONES").get();
    const tecnicoToCuadrilla = new Map<string, { id: string; nombre: string; coordinadorUid: string; coordinadorNombre: string }>();
    cuadrillasSnap.docs.forEach((doc) => {
      const data = (doc.data() as any) || {};
      const coordinadorUid = String(data?.coordinadorUid || "").trim();
      const coordinadorNombre = String(data?.coordinadorNombre || data?.coordinador || "").trim();
      const tecnicos = Array.isArray(data?.tecnicosUids) ? data.tecnicosUids : [];
      tecnicos.forEach((uid: string) => {
        tecnicoToCuadrilla.set(uid, {
          id: doc.id,
          nombre: String(data?.nombre || doc.id),
          coordinadorUid,
          coordinadorNombre,
        });
      });
    });

    const accessByUid = new Map(accessRows.map((row) => [row.uid, row.data] as const));
    const items = userSnaps.map((snap) => {
      const profile = (snap.data() as any) || {};
      const access = accessByUid.get(snap.id) || {};
      const nombres = String(profile?.nombres || "").trim();
      const apellidos = String(profile?.apellidos || "").trim();
      const full = `${nombres} ${apellidos}`.trim() || snap.id;
      const rolesList = Array.isArray(access?.roles) ? access.roles.map((r: any) => String(r || "").toUpperCase()) : [];
      const areasList = Array.isArray(access?.areas) ? access.areas.map((a: any) => String(a || "").toUpperCase()) : [];
      const cuad = tecnicoToCuadrilla.get(snap.id);
      return {
        id: snap.id,
        nombreCorto: shortName(full, snap.id),
        nombres,
        apellidos,
        roles: rolesList,
        areas: areasList,
        cuadrillaId: cuad?.id || "",
        cuadrillaNombre: cuad?.nombre || "",
        coordinadorUid: cuad?.coordinadorUid || "",
        coordinadorNombre: cuad?.coordinadorNombre || "",
      };
    });

    items.sort((a, b) => a.nombreCorto.localeCompare(b.nombreCorto, "es"));
    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
