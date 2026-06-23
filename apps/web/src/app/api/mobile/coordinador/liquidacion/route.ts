import { NextResponse } from "next/server";
import { getMobileAuthContext } from "@/core/auth/mobile";
import { adminDb } from "@/lib/firebase/admin";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayLimaYm() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function monthRange(ym: string): { start: string; end: string } | null {
  const m = String(ym || "").trim().match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mm) || mm < 1 || mm > 12) return null;
  const start = `${String(y).padStart(4, "0")}-${String(mm).padStart(2, "0")}-01`;
  const lastDay = new Date(y, mm, 0).getDate();
  const end = `${String(y).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export async function GET(req: Request) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

    const roles = (mobile.access.roles || []).map((r) => String(r || "").trim().toUpperCase());
    const allowed = roles.includes("COORDINADOR") || roles.includes("ADMIN");
    if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const ymParam = String(searchParams.get("ym") || "").trim() || todayLimaYm();
    const range = monthRange(ymParam);
    if (!range) return NextResponse.json({ ok: false, error: "INVALID_YM" }, { status: 400 });

    const db = adminDb();

    // Paginación con cursor igual que el web: itera hasta obtener todos los docs del mes
    const collectRange = async (field: "fSoliYmd" | "fechaFinVisiYmd") => {
      const result = new Map<string, QueryDocumentSnapshot>();
      let cursor: QueryDocumentSnapshot | undefined;
      while (true) {
        let q = db.collection("ordenes")
          .where(field, ">=", range.start)
          .where(field, "<=", range.end)
          .orderBy(field)
          .limit(1000);
        if (cursor) q = q.startAfter(cursor);
        const snap = await q.get();
        if (snap.empty) break;
        for (const doc of snap.docs) result.set(doc.id, doc);
        if (snap.size < 1000) break;
        cursor = snap.docs[snap.docs.length - 1];
      }
      return result;
    };

    const [map1, map2] = await Promise.all([
      collectRange("fSoliYmd"),
      collectRange("fechaFinVisiYmd"),
    ]);

    const docsById = new Map<string, QueryDocumentSnapshot>();
    for (const [id, doc] of map1) docsById.set(id, doc);
    for (const [id, doc] of map2) docsById.set(id, doc);

    const baseItems = Array.from(docsById.values())
      .map((doc) => {
        const d = doc.data() as any;
        const estado = String(d?.estado || "").trim().toUpperCase();
        if (estado !== "FINALIZADA") return null;
        const hayGarantia = `${d?.tipo || ""} ${d?.tipoTraba || ""} ${d?.idenServi || ""} ${d?.estado || ""}`.toUpperCase().includes("GARANTIA");
        if (hayGarantia) return null;
        return {
          id: doc.id,
          ordenId: String(d?.ordenId || d?.id || doc.id).trim(),
          codigoCliente: String(d?.codiSeguiClien || "").trim(),
          cliente: String(d?.cliente || "").trim(),
          cuadrillaId: String(d?.cuadrillaId || "").trim(),
          cuadrillaNombre: String(d?.cuadrillaNombre || "").trim(),
          fechaYmd: String(d?.fechaFinVisiYmd || d?.fSoliYmd || "").trim(),
          fechaHm: String(d?.fechaFinVisiHm || d?.fSoliHm || "").trim(),
          tipo: String(d?.tipoTraba || d?.tipo || "").trim(),
          plan: String(d?.plan || d?.idenServi || "").trim(),
          cantMesh: String(d?.cantMESHwin || "0").trim(),
          cantFono: String(d?.cantFONOwin || "0").trim(),
          cantBox: String(d?.cantBOXwin || "0").trim(),
          correccionPendiente: !!d?.correccionPendiente,
          liquidado:
            (String(d?.liquidacion?.estado || "").toUpperCase() === "LIQUIDADO" || !!d?.liquidadoAt) &&
            !d?.correccionPendiente,
        };
      })
      .filter(Boolean) as any[];

    // Cross-reference con instalaciones para estado liquidado/correccion actualizado
    const codigos = Array.from(new Set(baseItems.map((r: any) => r.codigoCliente).filter(Boolean)));
    const instRefs = codigos.map((c) => db.collection("instalaciones").doc(c as string));
    const instSnaps = codigos.length ? await db.getAll(...instRefs) : [];
    const instMap = new Map(
      instSnaps.filter((s) => s.exists).map((s) => [s.id, (s.data() as any) || {}])
    );

    const items = baseItems.map((r: any) => {
      const inst = r.codigoCliente ? instMap.get(r.codigoCliente) : null;
      if (!inst) return r;
      const instCorr = !!inst?.correccionPendiente;
      const instLiq = String(inst?.liquidacion?.estado || "").toUpperCase() === "LIQUIDADO" && !instCorr;
      return {
        ...r,
        correccionPendiente: r.correccionPendiente || instCorr,
        liquidado: r.liquidado || instLiq,
      };
    });

    const finalizadas = items.length;
    const liquidadas = items.filter((i: any) => i.liquidado).length;
    const pendientes = finalizadas - liquidadas;

    // Solo se devuelven las pendientes; el KPI refleja el total real del mes
    const pendienteItems = items.filter((i: any) => !i.liquidado);

    return NextResponse.json({
      ok: true,
      ym: ymParam,
      items: pendienteItems,
      kpi: { finalizadas, liquidadas, pendientes },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
