import { NextResponse } from "next/server";
import { getMobileAuthContext } from "@/core/auth/mobile";
import { getCoordinadorContext } from "@/core/auth/mobileCoordinador";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

    const coord = await getCoordinadorContext(mobile);
    if (!coord.cuadrillasIds.length) return NextResponse.json({ ok: true, cuadrillas: [] });

    // Mapa nombre-normalizado → {id, nombre} de las cuadrillas del coordinador
    const norm = (v: any) => String(v || "").trim().toUpperCase();
    const cuadByNombre = new Map(coord.cuadrillas.map((c) => [norm(c.nombre), c]));

    const db = adminDb();
    // Fuente de verdad: colección "equipos" con auditoria.requiere == true
    // (idéntico a lo que hace la web en /home/transferencias/instalaciones/auditoria)
    const eqSnap = await db.collection("equipos").where("auditoria.requiere", "==", true).limit(5000).get();

    // Agrupar por cuadrilla (ubicacion = nombre de la cuadrilla)
    const byCuadrilla = new Map<string, {
      cuadrillaId: string;
      cuadrillaNombre: string;
      items: Array<{ sn: string; tipo: string; estado: string; fotoURL: string | null }>;
    }>();

    for (const doc of eqSnap.docs) {
      const e = doc.data() as any;
      const ubicNorm = norm(e?.ubicacion);
      const cuad = cuadByNombre.get(ubicNorm);
      if (!cuad) continue; // no pertenece a este coordinador

      if (!byCuadrilla.has(cuad.id)) {
        byCuadrilla.set(cuad.id, { cuadrillaId: cuad.id, cuadrillaNombre: cuad.nombre, items: [] });
      }

      byCuadrilla.get(cuad.id)!.items.push({
        sn: String(e?.SN || e?.sn || doc.id).trim(),
        tipo: String(e?.equipo || "").trim(),
        estado: String(e?.auditoria?.estado || "pendiente"),
        fotoURL: e?.auditoria?.fotoURL || null,
      });
    }

    // Ordenar items: pendiente primero, luego por SN
    for (const entry of byCuadrilla.values()) {
      entry.items.sort((a, b) => {
        if (a.estado !== b.estado) return a.estado === "pendiente" ? -1 : 1;
        return a.sn.localeCompare(b.sn);
      });
    }

    const cuadrillas = Array.from(byCuadrilla.values())
      .map((entry) => ({
        cuadrillaId: entry.cuadrillaId,
        cuadrillaNombre: entry.cuadrillaNombre,
        pendiente: entry.items.filter((i) => i.estado !== "sustentada").length,
        sustentada: entry.items.filter((i) => i.estado === "sustentada").length,
        total: entry.items.length,
        items: entry.items,
      }))
      .filter((c) => c.total > 0)
      .sort((a, b) => a.cuadrillaNombre.localeCompare(b.cuadrillaNombre, "es", { sensitivity: "base" }));

    return NextResponse.json({ ok: true, cuadrillas });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
