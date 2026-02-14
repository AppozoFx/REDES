import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";
import { metersToCm } from "@/domain/materiales/repo";
import { addGlobalNotification } from "@/domain/notificaciones/service";

export const runtime = "nodejs";

const BodySchema = z.object({
  id: z.string().min(1),
  acta: z.string().min(1),
  precon: z.enum(["", "PRECON_50", "PRECON_100", "PRECON_150", "PRECON_200"]).optional(),
  bobinaMetros: z.coerce.number().nonnegative().optional(),
  anclajeP: z.coerce.number().int().nonnegative().optional(),
  templador: z.coerce.number().int().nonnegative().optional(),
  clevi: z.coerce.number().int().nonnegative().optional(),
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    const canUse =
      session.isAdmin ||
      session.permissions.includes("ORDENES_LIQUIDAR") ||
      (session.access.areas || []).includes("INSTALACIONES");
    if (!canUse) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const raw = await req.json();
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "FORM_INVALIDO" }, { status: 400 });
    }

    const data = parsed.data;
    const acta = String(data.acta || "").trim();
    if (!acta) return NextResponse.json({ ok: false, error: "ACTA_REQUIRED" }, { status: 400 });

    const precon = String(data.precon || "").trim();
    const bobinaMetros = Number(data.bobinaMetros || 0);
    if (precon && bobinaMetros > 0) {
      return NextResponse.json({ ok: false, error: "PRECON_O_BOBINA" }, { status: 400 });
    }
    if (!precon && bobinaMetros <= 0) {
      return NextResponse.json({ ok: false, error: "BOBINA_REQUIRED" }, { status: 400 });
    }

    const db = adminDb();
    const instRef = db.collection("instalaciones").doc(data.id);
    const instSnap = await instRef.get();
    if (!instSnap.exists) return NextResponse.json({ ok: false, error: "INSTALACION_NOT_FOUND" }, { status: 404 });

    const inst = instSnap.data() as any;
    const cuadrillaId = String(inst?.cuadrillaId || inst?.orden?.cuadrillaId || "").trim();
    if (!cuadrillaId) return NextResponse.json({ ok: false, error: "CUADRILLA_NOT_FOUND" }, { status: 400 });

    const tipoOrden = String(inst?.tipoOrden || inst?.orden?.tipoOrden || inst?.tipo || "").trim().toUpperCase();
    const esResidencial = tipoOrden === "RESIDENCIAL";

    const anclajeP = Math.max(0, Math.floor(Number(data.anclajeP || 0)));
    const templador = Math.max(0, Math.floor(Number(data.templador || 0)));
    const clevi = Math.max(0, Math.floor(Number(data.clevi || 0)));
    const tarugos = anclajeP;
    const hebilla = clevi * 2;
    const cintaMetros = clevi * 1.2;

    const matAgg = new Map<string, { und: number; metros: number }>();
    const addUnd = (id: string, und: number) => {
      if (und <= 0) return;
      const prev = matAgg.get(id) || { und: 0, metros: 0 };
      matAgg.set(id, { und: prev.und + und, metros: prev.metros });
    };
    const addMetros = (id: string, metros: number) => {
      if (metros <= 0) return;
      const prev = matAgg.get(id) || { und: 0, metros: 0 };
      matAgg.set(id, { und: prev.und, metros: prev.metros + metros });
    };

    addUnd("ACTA", 1);
    if (precon) addUnd(precon, 1);
    else addMetros("BOBINA", bobinaMetros);

    if (esResidencial) {
      addUnd("ANCLAJE_P", anclajeP);
      addUnd("TARUGOS_P", tarugos);
      addUnd("TEMPLADOR", templador);
      addUnd("CLEVI", clevi);
      addUnd("HEBILLA_1_2", hebilla);
      addMetros("CINTA_BANDI_1_2", cintaMetros);
    }

    const materialIds = Array.from(matAgg.keys());
    const matRefs = materialIds.map((mid) => db.collection("materiales").doc(mid));
    const stockRefs = materialIds.map((mid) => db.collection("cuadrillas").doc(cuadrillaId).collection("stock").doc(mid));

    await db.runTransaction(async (tx) => {
      const matSnaps = materialIds.length ? await tx.getAll(...matRefs) : [];
      const stockSnaps = materialIds.length ? await tx.getAll(...stockRefs) : [];
      const matMap = new Map(matSnaps.map((s) => [s.id, s]));
      const stockMap = new Map(stockSnaps.map((s) => [s.id, s]));

      const prevItems: Array<{ materialId: string; und?: number; metros?: number }> = Array.isArray(inst?.materialesConsumidos)
        ? inst.materialesConsumidos
        : [];
      const prevMap = new Map<string, { und: number; metros: number }>();
      for (const it of prevItems) {
        const key = String(it.materialId || "").trim();
        if (!key) continue;
        prevMap.set(key, {
          und: Math.floor(Number(it.und || 0)),
          metros: Number(it.metros || 0),
        });
      }

      const items: Array<{ materialId: string; und: number; metros: number; status: "OK" }> = [];

      for (const materialId of Array.from(matAgg.keys())) {
        const qty = matAgg.get(materialId) || { und: 0, metros: 0 };
        const matSnap = matMap.get(materialId);
        if (!matSnap?.exists) throw new Error(`MATERIAL_NOT_FOUND ${materialId}`);
        const mat = matSnap.data() as any;
        const unidadTipo = String(mat?.unidadTipo || "").toUpperCase() === "METROS" ? "METROS" : "UND";
        const stock = (stockMap.get(materialId)?.data() as any) || {};

        if (unidadTipo === "UND") {
          const und = Math.floor(qty.und || 0);
          const prevUnd = Math.floor(prevMap.get(materialId)?.und || 0);
          const delta = und - prevUnd;
          if (delta !== 0) {
            const available = Number(stock?.stockUnd || 0);
            if (delta > 0 && available - delta < 0) throw new Error(`STOCK_INSUFICIENTE_CUADRILLA ${materialId}`);
            tx.update(db.collection("cuadrillas").doc(cuadrillaId).collection("stock").doc(materialId), {
              stockUnd: FieldValue.increment(-delta),
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
          if (und > 0) items.push({ materialId, und, metros: 0, status: "OK" });
        } else {
          const metros = Number(qty.metros || 0);
          const prevMetros = Number(prevMap.get(materialId)?.metros || 0);
          const deltaM = metros - prevMetros;
          if (deltaM !== 0) {
            const needCm = metersToCm(Math.abs(deltaM));
            const available = Number(stock?.stockCm || 0);
            if (deltaM > 0 && available - needCm < 0) throw new Error(`STOCK_INSUFICIENTE_CUADRILLA ${materialId}`);
            tx.update(db.collection("cuadrillas").doc(cuadrillaId).collection("stock").doc(materialId), {
              stockCm: FieldValue.increment(deltaM > 0 ? -needCm : needCm),
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
          if (metros > 0) items.push({ materialId, und: 0, metros, status: "OK" });
        }
      }

      const merged = new Map<string, { und: number; metros: number }>();
      for (const it of prevItems) {
        const key = String(it.materialId || "").trim();
        if (!key) continue;
        merged.set(key, { und: Math.floor(Number(it.und || 0)), metros: Number(it.metros || 0) });
      }
      for (const it of items) {
        merged.set(it.materialId, { und: it.und || 0, metros: it.metros || 0 });
      }
      const materialesConsumidos = Array.from(merged.entries())
        .map(([materialId, qty]) => ({
          materialId,
          und: qty.und,
          metros: qty.metros,
          status: "OK",
        }))
        .filter((x) => (x.und || 0) > 0 || (x.metros || 0) > 0);

      tx.set(
        instRef,
        {
          ACTA: acta,
          materialesConsumidos,
          materialesLiquidacion: {
            acta,
            precon: precon || "",
            bobinaMetros,
            anclajeP,
            templador,
            clevi,
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

    try {
      const instAfter = await instRef.get();
      const instData = instAfter.data() as any;
      const cliente = String(instData?.cliente || instData?.orden?.cliente || "").trim();
      const codigoCliente = String(instData?.codigoCliente || instData?.orden?.codiSeguiClien || data.id || "").trim();
      const cuadrillaNombre = String(instData?.cuadrillaNombre || instData?.orden?.cuadrillaNombre || "").trim();
      const fechaOrden = String(instData?.fechaOrdenYmd || instData?.orden?.fechaFinVisiYmd || instData?.orden?.fSoliYmd || "");

      let usuario = session.uid;
      try {
        const uSnap = await adminDb().collection("usuarios").doc(session.uid).get();
        const u = uSnap.data() as any;
        const full = `${u?.nombres || ""} ${u?.apellidos || ""}`.trim();
        if (full) usuario = full;
      } catch {}

      const fechaFmt = fechaOrden ? fechaOrden.split("-").reverse().join("/") : "-";
      const preconTxt = precon ? `${precon} (1)` : `BOBINA ${bobinaMetros} m`;
      const msg = `✅ Cliente: ${cliente || codigoCliente || "cliente"} • Codigo: ${codigoCliente || data.id} • Cuadrilla: ${cuadrillaNombre || "-"} • ${preconTxt} • ACTA: ${acta} • Liquidado por: ${usuario} • Fecha: ${fechaFmt}`;

      await addGlobalNotification({
        title: "Materiales liquidados",
        message: msg,
        type: "success",
        scope: "ALL",
        createdBy: session.uid,
        entityType: "INSTALACIONES",
        entityId: codigoCliente || data.id,
        action: "UPDATE",
        estado: "ACTIVO",
      });
    } catch {}

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
