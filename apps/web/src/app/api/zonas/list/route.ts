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
      session.permissions.includes("ORDENES_LIQUIDAR") ||
      (session.access.areas || []).includes("INSTALACIONES") ||
      (session.access.roles || []).includes("GESTOR") ||
      (session.access.roles || []).includes("COORDINADOR");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const estado = String(searchParams.get("estado") || "HABILITADO").trim().toUpperCase();

    let q: FirebaseFirestore.Query = adminDb().collection("zonas");
    if (estado) q = q.where("estado", "==", estado);

    const snap = await q.limit(500).get();
    const items = snap.docs.map((d) => {
      const data = d.data() as any;
      const numero = data?.numero ?? data?.nro ?? data?.num ?? "";
      return {
        id: d.id,
        nombre: data?.nombre || data?.zona || d.id,
        numero,
        tipo: data?.tipo || "",
        estado: data?.estado || "",
      };
    });

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}


