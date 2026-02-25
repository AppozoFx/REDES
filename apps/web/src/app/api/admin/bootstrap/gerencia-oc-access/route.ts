import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERM_COORD = "GERENCIA_COORDINADORES";
const PERM_OC = "GERENCIA_ORDEN_COMPRA";
const TARGET_PERMS = [PERM_COORD, PERM_OC];

type Body = {
  roleIds?: string[];
  userUids?: string[];
};

function asStringArray(v: unknown) {
  return Array.isArray(v)
    ? Array.from(new Set(v.map((x) => String(x || "").trim()).filter(Boolean)))
    : [];
}

function ensureAdmin(session: NonNullable<Awaited<ReturnType<typeof getServerSession>>>) {
  return session.isAdmin;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    if (!ensureAdmin(session)) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as Body;
    const roleIds = asStringArray(body.roleIds);
    const userUids = asStringArray(body.userUids);

    const db = adminDb();

    // 1) Crear/actualizar permisos base
    const permDefs = [
      {
        id: PERM_COORD,
        nombre: "Gerencia - Coordinadores",
        descripcion: "Permite ver/editar datos fiscales (razon social y RUC) de coordinadores para OC.",
        modulo: "GERENCIA",
      },
      {
        id: PERM_OC,
        nombre: "Gerencia - Orden de Compra",
        descripcion: "Permite generar ordenes de compra, correlativo y guardar PDF en Storage.",
        modulo: "GERENCIA",
      },
    ];

    for (const p of permDefs) {
      await db
        .collection("permissions")
        .doc(p.id)
        .set(
          {
            ...p,
            estado: "ACTIVO",
            audit: {
              updatedAt: FieldValue.serverTimestamp(),
              updatedBy: session.uid,
            },
          },
          { merge: true }
        );
    }

    // 2) Asignar permisos a roles (opcional)
    for (const roleId of roleIds) {
      const ref = db.collection("roles").doc(roleId);
      const snap = await ref.get();
      if (!snap.exists) continue;
      const current = Array.isArray((snap.data() as any)?.permissions)
        ? ((snap.data() as any).permissions as string[])
        : [];
      const merged = Array.from(new Set([...current, ...TARGET_PERMS]));
      await ref.set(
        {
          permissions: merged,
          audit: {
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: session.uid,
          },
        },
        { merge: true }
      );
    }

    // 3) Asignar permisos directos a usuarios_access (opcional)
    for (const uid of userUids) {
      const ref = db.collection("usuarios_access").doc(uid);
      const snap = await ref.get();
      if (!snap.exists) continue;
      const current = Array.isArray((snap.data() as any)?.permissions)
        ? ((snap.data() as any).permissions as string[])
        : [];
      const merged = Array.from(new Set([...current, ...TARGET_PERMS]));
      await ref.set(
        {
          permissions: merged,
          audit: {
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: session.uid,
          },
        },
        { merge: true }
      );
    }

    return NextResponse.json({
      ok: true,
      createdPermissions: TARGET_PERMS,
      rolesUpdated: roleIds,
      usersUpdated: userUids,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}

