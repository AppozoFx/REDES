import { NextResponse } from "next/server";
import { getMobileAuthContext } from "@/core/auth/mobile";
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

    const roles = (mobile.access.roles || []).map((r) => String(r || "").trim().toUpperCase());
    const areas = (mobile.access.areas || []).map((a) => String(a || "").trim().toUpperCase());
    const allowed =
      mobile.access.isAdmin ||
      roles.includes("ALMACEN") ||
      roles.includes("ADMIN") ||
      areas.includes("ALMACEN") ||
      areas.includes("INSTALACIONES");
    if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const db = adminDb();
    const cuadrillasSnap = await db
      .collection("cuadrillas")
      .where("estado", "==", "HABILITADO")
      .get();

    const cuadrillas = cuadrillasSnap.docs.map((d) => {
      const x = d.data() as any;
      return { id: d.id, nombre: String(x.nombre || d.id) };
    });

    const equiposSnaps = await Promise.all(
      cuadrillas.map((c) =>
        db
          .collection("cuadrillas")
          .doc(c.id)
          .collection("equipos_series")
          .limit(1000)
          .get()
          .then((snap) => ({ cuadrillaId: c.id, cuadrillaNombre: c.nombre, snap }))
      )
    );

    const result = equiposSnaps
      .map(({ cuadrillaId, cuadrillaNombre, snap }) => {
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
        return {
          cuadrillaId,
          cuadrillaNombre,
          ...counts,
          total: counts.ont + counts.mesh + counts.fono + counts.box,
          equipos,
        };
      })
      .filter((c) => c.total > 0)
      .sort((a, b) => a.cuadrillaNombre.localeCompare(b.cuadrillaNombre, "es", { sensitivity: "base" }));

    return NextResponse.json({ ok: true, cuadrillas: result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
