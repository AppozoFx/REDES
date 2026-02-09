import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

type StockItem = { id: string; nombre?: string; cantidad?: number; metros?: number; tipo?: string; fecha?: string };

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "MISSING_ID" }, { status: 400 });

    const db = adminDb();
    const cuadRef = db.collection("cuadrillas").doc(id);
    const cuadSnap = await cuadRef.get();
    if (!cuadSnap.exists) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });

    const [stockSnap, eqSnap, bobSnap] = await Promise.all([
      cuadRef.collection("stock").get(),
      cuadRef.collection("equipos_stock").get(),
      cuadRef.collection("bobinas").where("estado", "==", "ACTIVA").limit(200).get(),
    ]);

    const materialIds = stockSnap.docs.map((d) => d.id);
    const materialNameMap = new Map<string, string>();
    if (materialIds.length) {
      const matRefs = materialIds.map((mid) => db.collection("materiales").doc(mid));
      const matSnaps = await db.getAll(...matRefs);
      for (const s of matSnaps) {
        const data = s.data() as any;
        const nombre = String(data?.nombre || data?.descripcion || "").trim();
        if (nombre) materialNameMap.set(s.id, nombre);
      }
    }

    const materiales: StockItem[] = stockSnap.docs.map((doc) => {
      const data = doc.data() as any;
      const materialId = String(data?.materialId || doc.id);
      const unidadTipo = String(data?.unidadTipo || "").toUpperCase();
      const item: StockItem = { id: materialId, nombre: materialNameMap.get(materialId), tipo: unidadTipo || undefined };
      if (unidadTipo === "METROS") {
        const cm = Number(data?.stockCm || 0);
        item.metros = cm / 100;
      } else {
        item.cantidad = Number(data?.stockUnd || 0);
      }
      return item;
    });

    const equipos: StockItem[] = eqSnap.docs.map((doc) => {
      const data = doc.data() as any;
      return {
        id: doc.id,
        tipo: String(data?.tipo || doc.id || "").toUpperCase() || undefined,
        cantidad: Number(data?.cantidad ?? data?.stock ?? data?.count ?? 0),
      };
    });

    const bobinas: StockItem[] = bobSnap.docs.map((doc) => {
      const data = doc.data() as any;
      const metros = Number(data?.metrosRestantes ?? data?.metrosIniciales ?? 0);
      const ymd = String(data?.f_despachoYmd || "").trim();
      const hm = String(data?.f_despachoHm || "").trim();
      const fecha = ymd && hm ? `${ymd} ${hm}` : ymd || hm || "";
      return { id: doc.id, nombre: doc.id, metros, cantidad: 1, fecha };
    });

    return NextResponse.json({ ok: true, stock: { materiales, equipos, bobinas } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
