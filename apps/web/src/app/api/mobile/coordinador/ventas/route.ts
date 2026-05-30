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

    await getCoordinadorContext(mobile); // verifica rol

    const { searchParams } = new URL(req.url);
    const yearStr = searchParams.get("year");
    const monthStr = searchParams.get("month");

    const db = adminDb();
    const snap = await db.collection("ventas").where("coordinadorUid", "==", mobile.uid).limit(200).get();

    const items = snap.docs
      .sort((a, b) => {
        const ta = a.data()?.createdAt?.toDate?.()?.getTime?.() || 0;
        const tb = b.data()?.createdAt?.toDate?.()?.getTime?.() || 0;
        return tb - ta;
      })
      .map((d) => {
        const v = d.data() as any;
        const ms = v?.createdAt?.toDate?.()?.getTime?.() || 0;
        const date = new Date(ms);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        // Filtrar por año y mes si se proporcionan
        if (yearStr && year !== parseInt(yearStr)) return null;
        if (monthStr && month !== parseInt(monthStr)) return null;
        return {
          id: d.id,
          cuadrillaId: String(v?.cuadrillaId || "").trim(),
          cuadrillaNombre: String(v?.cuadrillaNombre || "").trim(),
          totalCents: Number(v?.totalCents || 0),
          saldoPendienteCents: Number(v?.saldoPendienteCents || 0),
          cuotasTotal: Number(v?.cuotasTotal || 0),
          cuotasPagadas: Number(v?.cuotasPagadas || 0),
          estado: String(v?.estado || "").trim(),
          area: String(v?.area || "").trim(),
          creadoAtStr: ms ? new Date(ms).toISOString() : null,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
