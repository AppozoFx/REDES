import { NextResponse } from "next/server";
import { getMobileAuthContext } from "@/core/auth/mobile";
import { adminDb } from "@/lib/firebase/admin";

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
    const areas = (mobile.access.areas || []).map((a) => String(a || "").trim().toUpperCase());
    const allowed =
      roles.includes("ALMACEN") ||
      roles.includes("ADMIN") ||
      areas.includes("ALMACEN") ||
      areas.includes("INSTALACIONES");
    if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const ymdParam = String(searchParams.get("ymd") || "").trim();
    const ymParam = String(searchParams.get("ym") || "").trim() || (ymdParam ? "" : todayLimaYm());

    const db = adminDb();
    let query = db.collection("instalaciones") as FirebaseFirestore.Query;

    if (ymdParam && /^\d{4}-\d{2}-\d{2}$/.test(ymdParam)) {
      query = query.where("fechaOrdenYmd", "==", ymdParam);
    } else if (ymParam) {
      const range = monthRange(ymParam);
      if (!range) return NextResponse.json({ ok: false, error: "INVALID_YM" }, { status: 400 });
      query = query.where("fechaOrdenYmd", ">=", range.start).where("fechaOrdenYmd", "<=", range.end);
    }

    const snap = await query.orderBy("fechaOrdenYmd", "desc").limit(500).get();

    function parseSnList(v: any): string[] {
      if (Array.isArray(v)) return v.map((x: any) => String(x || "").trim()).filter(Boolean);
      if (typeof v === "string") {
        const s = v.trim();
        if (!s) return [];
        try {
          const parsed = JSON.parse(s);
          if (Array.isArray(parsed)) return parsed.map((x: any) => String(x || "").trim()).filter(Boolean);
        } catch {}
        return s.split(/[|,;]/).map((x: string) => x.trim()).filter(Boolean);
      }
      return [];
    }

    const items = snap.docs.map((doc) => {
      const d = doc.data() as any;
      const orden = d.orden || {};
      const liquidacion = d.liquidacion || {};
      const mat = d?.materialesLiquidacion || {};

      // SNs — primero desde equiposInstalados, luego fallback a campos directos
      const equipos: any[] = Array.isArray(d.equiposInstalados)
        ? d.equiposInstalados
        : Array.isArray(liquidacion.equiposInstalados)
        ? liquidacion.equiposInstalados
        : [];
      const byTipo = (tipo: string) =>
        equipos.filter((e: any) => String(e?.tipo || "").toUpperCase().includes(tipo));

      const snOnt =
        byTipo("ONT")[0]?.sn || String(d?.snONT || "").trim();
      const snMesh: string[] = byTipo("MESH").map((e: any) => e.sn).filter(Boolean).length
        ? byTipo("MESH").map((e: any) => e.sn).filter(Boolean)
        : parseSnList(d?.snMESH);
      const snBox: string[] = byTipo("BOX").map((e: any) => e.sn).filter(Boolean).length
        ? byTipo("BOX").map((e: any) => e.sn).filter(Boolean)
        : parseSnList(d?.snBOX);

      const acta = String(d?.ACTA || d?.acta || mat?.acta || "").trim();
      const precon = String(mat?.precon || "").trim();
      const estadoMateriales = acta && precon ? "ok" : "pendiente";

      const fechaYmd = String(
        d?.fechaOrdenYmd ||
        orden?.fechaFinVisiYmd ||
        orden?.fSoliYmd ||
        d?.fechaInstalacionYmd ||
        ""
      ).trim();

      const snFono = byTipo("FONO")[0]?.sn || String(d?.snFONO || "").trim();
      const liqServ = d?.liquidacion?.servicios || {};

      return {
        id: doc.id,
        codigoCliente: String(d?.codigoCliente || orden?.codiSeguiClien || "").trim(),
        cliente: String(d?.cliente || orden?.cliente || "").trim(),
        cuadrillaNombre: String(d?.cuadrillaNombre || orden?.cuadrillaNombre || "").trim(),
        fechaYmd,
        tipoOrden: String(orden?.tipoOrden || d?.tipoOrden || "").trim(),
        plan: String(d?.plan || orden?.idenServi || "").trim(),
        tipoCuadrilla: String(d?.tipoCuadrilla || "").trim(),
        coordinadorNombre: String(d?.coordinadorNombre || d?.coordinador || "").trim(),
        acta,
        snOnt,
        snMesh,
        snBox,
        snFono,
        precon,
        bobinaMetros: Number(mat?.bobinaMetros || 0),
        estadoMateriales,
        planGamer: !!(liqServ?.planGamer || d?.planGamer),
        kitWifiPro: !!(liqServ?.kitWifiPro || d?.kitWifiPro),
        servicioCableadoMesh: !!(liqServ?.servicioCableadoMesh || d?.servicioCableadoMesh),
        cat5e: Number(liqServ?.cat5e ?? d?.cat5e ?? 0),
        cat6: Number(liqServ?.cat6 ?? d?.cat6 ?? 0),
        puntosUTP: Number(liqServ?.puntosUTP ?? d?.puntosUTP ?? 0),
        observacion: String(d?.liquidacion?.observacion || d?.observacion || "").trim(),
      };
    });

    return NextResponse.json({ ok: true, ym: ymParam || ymdParam, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
