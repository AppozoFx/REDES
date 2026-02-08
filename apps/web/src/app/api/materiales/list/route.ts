import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const area = searchParams.get("area");

    let q: FirebaseFirestore.Query = adminDb().collection("materiales");
    if (area) q = q.where("areas", "array-contains", area);
    q = q.where("estado", "==", "ACTIVO");

    const snap = await q.select("unidadTipo", "nombre").limit(500).get();
    const items = snap.docs.map((d) => ({
      id: d.id,
      unidadTipo: (d.data() as any)?.unidadTipo ?? null,
      nombre: (d.data() as any)?.nombre ?? "",
    }));

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || "ERROR") },
      { status: 500 }
    );
  }
}
