import { NextResponse } from "next/server";
import { z } from "zod";

import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

const BodySchema = z.object({
  ymd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  actas: z.array(z.string()).max(5000).default([]),
});

type MatchItem = {
  id: string;
  codigoCliente: string;
  cliente: string;
  cuadrillaNombre: string;
  acta: string;
  fechaOrdenYmd: string;
  fechaInstalacionYmd: string;
};

type DayItem = {
  acta: string;
  codigoCliente: string;
  cliente: string;
  cuadrillaNombre: string;
  matches: MatchItem[];
};

function normalizeActa(raw: unknown) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

function normalizeActaDigits(raw: unknown) {
  return String(raw || "").replace(/\D/g, "");
}

function toMatchItem(docId: string, data: any): MatchItem | null {
  const actaRaw = data?.ACTA || data?.acta || data?.materialesLiquidacion?.acta || "";
  const acta = normalizeActa(actaRaw);
  if (!acta) return null;

  const codigoCliente = String(data?.codigoCliente || data?.orden?.codiSeguiClien || docId || "").trim();
  const cliente = String(data?.cliente || data?.orden?.cliente || "").trim();
  const cuadrillaNombre = String(data?.cuadrillaNombre || data?.orden?.cuadrillaNombre || "").trim();
  const fechaOrdenYmd = String(data?.fechaOrdenYmd || data?.orden?.fechaFinVisiYmd || data?.orden?.fSoliYmd || "").trim();
  const fechaInstalacionYmd = String(data?.fechaInstalacionYmd || data?.liquidacion?.ymd || "").trim();

  return {
    id: docId,
    codigoCliente,
    cliente,
    cuadrillaNombre,
    acta,
    fechaOrdenYmd,
    fechaInstalacionYmd,
  };
}

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

    const ymd = parsed.data.ymd;
    const actasIn = parsed.data.actas.map((x) => normalizeActa(x)).filter(Boolean);
    const actasUnique = Array.from(new Set(actasIn));

    const db = adminDb();
    const [snapByOrden, snapByInstalacion] = await Promise.all([
      db.collection("instalaciones").where("fechaOrdenYmd", "==", ymd).limit(10000).get(),
      db.collection("instalaciones").where("fechaInstalacionYmd", "==", ymd).limit(10000).get(),
    ]);

    const docsMap = new Map<string, MatchItem>();
    const docIds = new Set<string>();

    [...snapByOrden.docs, ...snapByInstalacion.docs].forEach((doc) => {
      const data = doc.data() as any;
      docIds.add(doc.id);
      const item = toMatchItem(doc.id, data);
      if (!item) return;
      docsMap.set(`${doc.id}_${normalizeActaDigits(item.acta)}`, item);
    });

    const byActaDigits = new Map<string, MatchItem[]>();
    docsMap.forEach((item) => {
      const key = normalizeActaDigits(item.acta);
      if (!key) return;
      const list = byActaDigits.get(key) || [];
      list.push(item);
      byActaDigits.set(key, list);
    });

    const dayItems: DayItem[] = Array.from(byActaDigits.entries())
      .map(([_, matches]) => {
        const sortedMatches = [...matches].sort((a, b) => a.codigoCliente.localeCompare(b.codigoCliente));
        const primary = sortedMatches[0];
        return {
          acta: primary?.acta || "",
          codigoCliente: primary?.codigoCliente || "",
          cliente: primary?.cliente || "",
          cuadrillaNombre: primary?.cuadrillaNombre || "",
          matches: sortedMatches,
        };
      })
      .filter((item) => item.acta)
      .sort((a, b) => a.acta.localeCompare(b.acta, "es", { sensitivity: "base" }));

    const results = actasUnique.map((acta) => {
      const key = normalizeActaDigits(acta);
      const matches = (byActaDigits.get(key) || []).sort((a, b) => a.codigoCliente.localeCompare(b.codigoCliente));
      const withCliente = matches.filter((m) => String(m.cliente || "").trim().length > 0);
      return {
        acta,
        matches,
        found: matches.length > 0,
        hasCliente: withCliente.length > 0,
      };
    });

    const matched = results.filter((r) => r.hasCliente).length;
    const noCliente = results.filter((r) => r.found && !r.hasCliente).length;
    const missing = results.filter((r) => !r.found).length;

    return NextResponse.json({
      ok: true,
      ymd,
      day: {
        totalInstalaciones: docIds.size,
        totalActasEsperadas: dayItems.length,
        items: dayItems,
      },
      summary: {
        totalEscaneadas: actasUnique.length,
        conCliente: matched,
        sinCliente: noCliente,
        sinRegistro: missing,
      },
      allMatched: matched === actasUnique.length,
      results,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
