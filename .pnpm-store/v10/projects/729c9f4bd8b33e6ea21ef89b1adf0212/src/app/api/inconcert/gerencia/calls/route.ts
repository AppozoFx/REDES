import { NextResponse } from "next/server";

import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/core/auth/session";

export const runtime = "nodejs";

const PERM_VIEW = "INCONCERT_GERENCIA_VIEW";
const PERM_EDIT = "INCONCERT_GERENCIA_EDIT";

function normalizePhone(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return digits.slice(-9);
}

function parseIcTs(r: any) {
  const cands = [r?.inicioLlamadaInconcert, r?.entraLlamadaInconcert, r?.finLlamadaInconcert];
  for (const c of cands) {
    const s = String(c || "").trim();
    if (!s) continue;
    const normalized = s.includes(" ") && !s.includes("T") ? s.replace(" ", "T") : s;
    const t = Date.parse(normalized);
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    const canView =
      session.isAdmin ||
      session.permissions.includes(PERM_VIEW) ||
      session.permissions.includes(PERM_EDIT);
    if (!canView) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const tel = normalizePhone(searchParams.get("tel") || "");
    if (!tel) return NextResponse.json({ ok: false, error: "TEL_REQUIRED" }, { status: 400 });

    const [byNorm, byRaw] = await Promise.all([
      adminDb().collection("inconcert").where("_telNorm", "==", tel).limit(600).get(),
      adminDb().collection("inconcert").where("telefonoCliente", "==", tel).limit(600).get(),
    ]);

    const seen = new Set<string>();
    const list = [...byNorm.docs, ...byRaw.docs]
      .filter((d) => {
        if (seen.has(d.id)) return false;
        seen.add(d.id);
        return true;
      })
      .map((d) => {
        const x = d.data() as any;
        return {
          id: d.id,
          usuaruioInconcert: String(x.usuaruioInconcert || "-"),
          inicioLlamadaInconcert: String(x.inicioLlamadaInconcert || "-"),
          entraLlamadaInconcert: String(x.entraLlamadaInconcert || "-"),
          finLlamadaInconcert: String(x.finLlamadaInconcert || "-"),
          duracion: String(x.duracion || "-"),
          espera: String(x.espera || "-"),
          timbrado: String(x.timbrado || "-"),
          atencion: String(x.atencion || "-"),
          bo: String(x.bo || "-"),
          observacionInconcert: String(x.observacionInconcert || "-"),
          _ts: parseIcTs(x),
        };
      })
      .sort((a, b) => (b._ts || 0) - (a._ts || 0));

    return NextResponse.json({ ok: true, tel, list });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}

