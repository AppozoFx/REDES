import { NextResponse } from "next/server";
import { getMobileAuthContext } from "@/core/auth/mobile";
import { getCoordinadorContext } from "@/core/auth/mobileCoordinador";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function tipoEquipo(equipo: string): "ONT" | "MESH" | "FONO" | "BOX" | null {
  const e = equipo.toUpperCase();
  if (e.includes("ONT")) return "ONT";
  if (e.includes("MESH")) return "MESH";
  if (e.includes("FONO")) return "FONO";
  if (e.includes("BOX")) return "BOX";
  return null;
}

export async function GET(req: Request) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

    const coord = await getCoordinadorContext(mobile);
    const db = adminDb();

    // Stock de cuadrillas
    const cuadrillas: Array<{ cuadrillaId: string; cuadrillaNombre: string; ont: number; mesh: number; fono: number; box: number; total: number; equipos: Array<{ sn: string; tipo: string }> }> = [];

    if (coord.cuadrillasIds.length) {
      const equiposSnaps = await Promise.all(
        coord.cuadrillas.map((c) =>
          db.collection("cuadrillas").doc(c.id).collection("equipos_series").limit(1000).get()
            .then((snap) => ({ cuadrillaId: c.id, cuadrillaNombre: c.nombre, snap }))
        )
      );
      for (const { cuadrillaId, cuadrillaNombre, snap } of equiposSnaps) {
        const counts = { ont: 0, mesh: 0, fono: 0, box: 0 };
        const equipos: Array<{ sn: string; tipo: string }> = [];
        for (const doc of snap.docs) {
          const data = doc.data() as any;
          const tipo = tipoEquipo(String(data?.equipo || ""));
          if (tipo === "ONT") counts.ont++;
          else if (tipo === "MESH") counts.mesh++;
          else if (tipo === "FONO") counts.fono++;
          else if (tipo === "BOX") counts.box++;
          if (tipo) equipos.push({ sn: doc.id, tipo });
        }
        equipos.sort((a, b) => a.tipo.localeCompare(b.tipo) || a.sn.localeCompare(b.sn));
        cuadrillas.push({ cuadrillaId, cuadrillaNombre, ...counts, total: counts.ont + counts.mesh + counts.fono + counts.box, equipos });
      }
      cuadrillas.sort((a, b) => a.cuadrillaNombre.localeCompare(b.cuadrillaNombre, "es", { sensitivity: "base" }));
    }

    // Stock personal del propio coordinador
    const personalSeriesSnap = await db
      .collection("personal_stock").doc(coord.uid).collection("equipos_series")
      .limit(500).get();

    const personalCounts = { ont: 0, mesh: 0, fono: 0, box: 0 };
    const personalEquipos: Array<{ sn: string; tipo: string }> = [];
    for (const doc of personalSeriesSnap.docs) {
      const data = doc.data() as any;
      const tipo = tipoEquipo(String(data?.equipo || ""));
      if (tipo === "ONT") personalCounts.ont++;
      else if (tipo === "MESH") personalCounts.mesh++;
      else if (tipo === "FONO") personalCounts.fono++;
      else if (tipo === "BOX") personalCounts.box++;
      if (tipo) personalEquipos.push({ sn: doc.id, tipo });
    }
    personalEquipos.sort((a, b) => a.tipo.localeCompare(b.tipo) || a.sn.localeCompare(b.sn));
    const personalTotal = personalCounts.ont + personalCounts.mesh + personalCounts.fono + personalCounts.box;

    const personalStock = {
      ...personalCounts,
      total: personalTotal,
      equipos: personalEquipos,
    };

    return NextResponse.json({ ok: true, cuadrillas, personalStock });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
