import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { requireAreaScope, requirePermission } from "@/core/auth/apiGuards";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await getServerSession({ forceAccessRefresh: true });
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (!session.isAdmin) {
      let hasPermission = false;
      for (const perm of ["MATERIALES_TRANSFER_SERVICIO", "MATERIALES_DEVOLUCION"]) {
        try {
          requirePermission(session, perm);
          hasPermission = true;
          break;
        } catch {}
      }
      if (!hasPermission) throw new Error("FORBIDDEN");
      requireAreaScope(session, ["MANTENIMIENTO"]);
    }

    const { searchParams } = new URL(req.url);
    const tecnicoUid = String(searchParams.get("tecnicoUid") || "").trim();
    if (!tecnicoUid) return NextResponse.json({ ok: false, error: "TECNICO_REQUIRED" }, { status: 400 });

    const db = adminDb();
    const [histSnap, stockSnap, activosSnap] = await Promise.all([
      db.collection("usuarios").doc(tecnicoUid).collection("materiales_historial_mant").orderBy("createdAt", "desc").limit(120).get(),
      db.collection("usuarios").doc(tecnicoUid).collection("stock_materiales_mant").orderBy("materialId", "asc").limit(300).get(),
      db.collection("usuarios").doc(tecnicoUid).collection("activos_asignados_mant").orderBy("materialId", "asc").limit(300).get(),
    ]);

    const historial = histSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    const stock = stockSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    const activos = activosSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    return NextResponse.json({ ok: true, historial, stock, activos });
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (msg === "ACCESS_DISABLED") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    if (msg === "FORBIDDEN" || msg === "AREA_FORBIDDEN") {
      return NextResponse.json({ ok: false, error: msg === "AREA_FORBIDDEN" ? "AREA_FORBIDDEN" : "FORBIDDEN" }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}


