import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const area = searchParams.get("area");

    let q = adminDb()
      .collection("cuadrillas")
      .where("estado", "==", "HABILITADO");
    if (area) {
      q = q.where("area", "==", area);
    }

    const snap = await q
      .select("nombre", "r_c", "categoria", "zonaId", "tipoZona", "vehiculo", "numeroCuadrilla")
      .limit(500)
      .get();

    const items = snap.docs
      .map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          nombre: data?.nombre ?? "",
          r_c: data?.r_c ?? data?.categoria ?? "",
          categoria: data?.categoria ?? "",
          zonaId: data?.zonaId ?? "",
          tipoZona: data?.tipoZona ?? "",
          vehiculo: data?.vehiculo ?? "",
          numeroCuadrilla: data?.numeroCuadrilla ?? "",
        };
      })
      .sort((a, b) =>
        String(a.nombre).localeCompare(String(b.nombre), "es", { sensitivity: "base" })
      );

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
