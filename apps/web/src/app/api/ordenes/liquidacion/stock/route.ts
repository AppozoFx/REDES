import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

type StockByTipo = {
  ONT: Array<{ sn: string; proid: string }>;
  MESH: string[];
  BOX: string[];
  FONO: string[];
};

function emptyStock(): StockByTipo {
  return { ONT: [], MESH: [], BOX: [], FONO: [] };
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });

    const allowed = session.isAdmin || session.permissions.includes("ORDENES_LIQUIDAR");
    if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const cuadrillaId = String(searchParams.get("cuadrillaId") || "").trim();
    if (!cuadrillaId) return NextResponse.json({ ok: true, stock: emptyStock() });

    const snap = await adminDb()
      .collection("cuadrillas")
      .doc(cuadrillaId)
      .collection("equipos_series")
      .limit(1500)
      .get();

    const out = emptyStock();
    const onts: string[] = [];
    for (const d of snap.docs) {
      const x = d.data() as any;
      const sn = String(x?.SN || d.id || "").trim();
      const tipo = String(x?.equipo || "").toUpperCase();
      if (!sn) continue;
      if (tipo === "ONT") onts.push(sn);
      else if (tipo === "MESH") out.MESH.push(sn);
      else if (tipo === "BOX") out.BOX.push(sn);
      else if (tipo === "FONO") out.FONO.push(sn);
    }

    const uniqOnts = Array.from(new Set(onts));
    if (uniqOnts.length) {
      const chunkSize = 10;
      const ontRows: Array<{ sn: string; proid: string }> = [];
      for (let i = 0; i < uniqOnts.length; i += chunkSize) {
        const part = uniqOnts.slice(i, i + chunkSize);
        const q = await adminDb().collection("equipos").where("SN", "in", part).get();
        const bySn = new Map<string, string>();
        for (const docSnap of q.docs) {
          const data = docSnap.data() as any;
          const sn = String(data?.SN || docSnap.id || "").trim();
          const proid = String(data?.proId || data?.proid || "").trim();
          if (sn) bySn.set(sn, proid);
        }
        for (const sn of part) {
          ontRows.push({ sn, proid: bySn.get(sn) || "" });
        }
      }
      out.ONT = ontRows.sort((a, b) => a.sn.localeCompare(b.sn));
    }

    out.MESH = Array.from(new Set(out.MESH)).sort((a, b) => a.localeCompare(b));
    out.BOX = Array.from(new Set(out.BOX)).sort((a, b) => a.localeCompare(b));
    out.FONO = Array.from(new Set(out.FONO)).sort((a, b) => a.localeCompare(b));

    return NextResponse.json({ ok: true, stock: out });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
