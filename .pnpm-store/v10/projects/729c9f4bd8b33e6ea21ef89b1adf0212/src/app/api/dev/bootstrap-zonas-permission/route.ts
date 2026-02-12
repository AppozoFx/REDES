import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createPermission } from "@/domain/permissions/permissions.repo";
import { adminAuth } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function POST() {
  try {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ ok: false, error: "DISABLED" }, { status: 403 });
    }

    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("__session")?.value;
    if (!sessionCookie) return NextResponse.json({ ok: false, error: "NO_SESSION" }, { status: 401 });

    const decoded = await adminAuth().verifySessionCookie(sessionCookie, true);
    const uid = decoded.uid;

    // Seed permission ZONAS_MANAGE under modulo "ZONAS"
    await createPermission(
      {
        id: "ZONAS_MANAGE",
        nombre: "Gestionar Zonas",
        descripcion: "Crear, editar y gestionar Zonas",
        modulo: "ZONAS",
      },
      uid
    );

    return NextResponse.json({ ok: true, id: "ZONAS_MANAGE" });
  } catch (e: any) {
    // If already exists, surface conflict-ish response but ok-ish for idempotent bootstrap
    const msg = String(e?.message ?? "");
    if (msg === "PERMISSION_ALREADY_EXISTS") {
      return NextResponse.json({ ok: true, note: msg });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

