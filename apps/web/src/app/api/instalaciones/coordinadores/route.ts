import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

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

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    const canUse =
      session.isAdmin ||
      session.permissions.includes("ORDENES_LIQUIDAR") ||
      (session.access.areas || []).includes("INSTALACIONES") ||
      session.permissions.includes("CUADRILLAS_MANAGE");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const accessSnap = await adminDb()
      .collection("usuarios_access")
      .where("roles", "array-contains", "COORDINADOR")
      .limit(500)
      .get();

    const uids = accessSnap.docs.map((d) => d.id);
    const refs = uids.map((uid) => adminDb().collection("usuarios").doc(uid));
    const snaps = uids.length ? await adminDb().getAll(...refs) : [];

    const items = snaps.map((s, i) => {
      const data = s.data() as any;
      const nombres = String(data?.nombres || "").trim();
      const apellidos = String(data?.apellidos || "").trim();
      const label = shortName(`${nombres} ${apellidos}`.trim() || uids[i] || s.id);
      return { uid: s.id, label };
    });

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
