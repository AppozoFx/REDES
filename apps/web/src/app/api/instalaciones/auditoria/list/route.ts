import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

function toPlain(value: any): any {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === "object") {
    if (typeof (value as any)?.toDate === "function") {
      try {
        return (value as any).toDate().toISOString();
      } catch {
        return null;
      }
    }
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = toPlain(v);
    return out;
  }
  return value;
}

function asStr(v: any) {
  return String(v || "").trim();
}

function canUse(session: any) {
  const roles = (session.access.roles || []).map((r: any) => String(r || "").toUpperCase());
  return (
    session.isAdmin ||
    (session.access.areas || []).includes("INSTALACIONES") ||
    roles.includes("COORDINADOR") ||
    roles.includes("TECNICO") ||
    session.permissions.includes("EQUIPOS_VIEW") ||
    session.permissions.includes("EQUIPOS_EDIT")
  );
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    if (!canUse(session)) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const mode = String(searchParams.get("mode") || "campo").toLowerCase() === "instalados" ? "instalados" : "campo";

    const db = adminDb();
    const eqSnap = await db
      .collection("equipos")
      .where("auditoria.requiere", "==", true)
      .limit(12000)
      .get();

    const rowsBase = eqSnap.docs.map((d) => toPlain({ id: d.id, ...d.data() }));
    const toUpper = (v: any) => asStr(v).toUpperCase();
    const isInstalado = (e: any) => toUpper(e?.estado) === "INSTALADO";

    let rows = rowsBase.filter((e: any) => (mode === "instalados" ? isInstalado(e) : !isInstalado(e)));

    if (mode === "instalados") {
      const clientes = Array.from(
        new Set(
          rows
            .map((e: any) => asStr(e?.cliente))
            .filter(Boolean)
        )
      );

      const liqByCliente = new Map<string, any>();
      for (let i = 0; i < clientes.length; i += 10) {
        const chunk = clientes.slice(i, i + 10);
        const liqSnap = await db.collection("liquidacion_instalaciones").where("cliente", "in", chunk).limit(1000).get();
        for (const d of liqSnap.docs) {
          const x = toPlain(d.data());
          const key = asStr((x as any)?.cliente);
          if (key && !liqByCliente.has(key)) liqByCliente.set(key, { id: d.id, ...x });
        }
      }
      rows = rows.map((e: any) => {
        const key = asStr(e?.cliente);
        if (!key) return e;
        const detalle = liqByCliente.get(key);
        return detalle ? { ...e, detalleInstalacion: detalle } : e;
      });
    }

    return NextResponse.json({ ok: true, items: rows, mode });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}

