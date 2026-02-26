import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

type StockItem = {
  id: string;
  nombre?: string;
  cantidad?: number;
  metros?: number;
  tipo?: string;
  fecha?: string;
  guia?: string;
};

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }

    const canUse =
      session.isAdmin ||
      session.permissions.includes("MATERIALES_VIEW") ||
      session.permissions.includes("MATERIALES_TRANSFER_SERVICIO") ||
      session.permissions.includes("MATERIALES_DEVOLUCION");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const cuadrillaId = String(searchParams.get("cuadrillaId") || "").trim();
    if (!cuadrillaId) return NextResponse.json({ ok: false, error: "MISSING_CUADRILLA" }, { status: 400 });

    const db = adminDb();
    const cuadRef = db.collection("cuadrillas").doc(cuadrillaId);
    const cuadSnap = await cuadRef.get();
    if (!cuadSnap.exists) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    const cData = cuadSnap.data() as any;
    if (String(cData?.area || "") !== "MANTENIMIENTO") {
      return NextResponse.json({ ok: false, error: "INVALID_CUADRILLA" }, { status: 400 });
    }

    const [stockSnap, movSnap] = await Promise.all([
      cuadRef.collection("stock").get(),
      db
        .collection("movimientos_inventario")
        .where("area", "==", "MANTENIMIENTO")
        .where("tipo", "==", "DESPACHO")
        .where("destino.id", "==", cuadrillaId)
        .orderBy("createdAt", "desc")
        .limit(200)
        .get(),
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

    const lastByMaterial = new Map<string, { guia?: string; fecha?: string }>();
    for (const doc of movSnap.docs) {
      const data = doc.data() as any;
      const guia = String(data?.guia || "").trim();
      const createdAt = data?.createdAt;
      let fecha = "";
      if (createdAt?.toDate) fecha = createdAt.toDate().toLocaleString("es-PE");
      else if (typeof createdAt?.seconds === "number") fecha = new Date(createdAt.seconds * 1000).toLocaleString("es-PE");

      const items = Array.isArray(data?.itemsMateriales) ? data.itemsMateriales : [];
      for (const it of items) {
        const id = String(it?.materialId || "").trim();
        if (!id || lastByMaterial.has(id)) continue;
        lastByMaterial.set(id, { guia, fecha });
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
      const last = lastByMaterial.get(materialId);
      if (last?.guia) item.guia = last.guia;
      if (last?.fecha) item.fecha = last.fecha;
      return item;
    });

    const tecnicosUids = Array.isArray(cData?.tecnicosUids)
      ? cData.tecnicosUids
      : Array.isArray(cData?.tecnicos)
      ? cData.tecnicos
      : [];
    const coordinadorUid = String(cData?.coordinadorUid || "").trim();

    const uids = Array.from(new Set([coordinadorUid, ...tecnicosUids].filter(Boolean)));
    const usersMap = new Map<string, string>();
    if (uids.length) {
      const refs = uids.map((uid) => db.collection("usuarios").doc(uid));
      const snaps = await db.getAll(...refs);
      for (const s of snaps) {
        const data = s.exists ? (s.data() as any) : {};
        const nombres = String(data?.nombres || "").trim();
        const apellidos = String(data?.apellidos || "").trim();
        const n1 = nombres.split(/\s+/).filter(Boolean)[0] || "";
        const a1 = apellidos.split(/\s+/).filter(Boolean)[0] || "";
        const label = `${n1} ${a1}`.trim() || s.id;
        usersMap.set(s.id, label);
      }
    }

    const coordinadorNombre = coordinadorUid ? usersMap.get(coordinadorUid) || coordinadorUid : "";
    const tecnicosNombres = tecnicosUids.map((u: any) => usersMap.get(String(u)) || String(u)).filter(Boolean);

    return NextResponse.json({
      ok: true,
      cuadrilla: {
        id: cuadSnap.id,
        nombre: String(cData?.nombre || ""),
        coordinadorUid,
        coordinadorNombre,
        tecnicosUids,
        tecnicosNombres,
      },
      materiales,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
