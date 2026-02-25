import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERM_GERENCIA_COORDINADORES = "GERENCIA_COORDINADORES";

function hasGerenciaAccess(session: NonNullable<Awaited<ReturnType<typeof getServerSession>>>) {
  const roles = (session.access.roles || []).map((r) => String(r || "").toUpperCase());
  return session.isAdmin || (roles.includes("GERENCIA") && session.permissions.includes(PERM_GERENCIA_COORDINADORES));
}

function toShortName(data: any, fallback: string) {
  const nombres = String(data?.nombres || "").trim();
  const apellidos = String(data?.apellidos || "").trim();
  const full = `${nombres} ${apellidos}`.trim();
  return full || fallback;
}

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    if (!hasGerenciaAccess(session)) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    const accessSnap = await adminDb()
      .collection("usuarios_access")
      .where("roles", "array-contains", "COORDINADOR")
      .limit(1000)
      .get();

    const uids = accessSnap.docs.map((d) => d.id);
    const refs = uids.map((uid) => adminDb().collection("usuarios").doc(uid));
    const userSnaps = refs.length ? await adminDb().getAll(...refs) : [];

    const items = userSnaps
      .map((s) => {
        const data = (s.data() || {}) as any;
        return {
          uid: s.id,
          nombre: toShortName(data, s.id),
          email: String(data?.email || ""),
          celular: String(data?.celular || ""),
          razonSocial: String(data?.razon_social || ""),
          ruc: String(data?.ruc || ""),
        };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    if (!hasGerenciaAccess(session)) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as
      | { uid?: string; razonSocial?: string; ruc?: string }
      | null;

    const uid = String(body?.uid || "").trim();
    const razonSocial = String(body?.razonSocial || "").trim();
    const ruc = String(body?.ruc || "").replace(/\D/g, "");

    if (!uid) return NextResponse.json({ ok: false, error: "UID_REQUIRED" }, { status: 400 });
    if (!razonSocial) return NextResponse.json({ ok: false, error: "RAZON_SOCIAL_REQUIRED" }, { status: 400 });
    if (ruc && !/^\d{11}$/.test(ruc)) {
      return NextResponse.json({ ok: false, error: "RUC_INVALID" }, { status: 400 });
    }

    await adminDb()
      .collection("usuarios")
      .doc(uid)
      .set(
        {
          razon_social: razonSocial,
          ruc,
          audit: {
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: session.uid,
          },
        },
        { merge: true }
      );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}

