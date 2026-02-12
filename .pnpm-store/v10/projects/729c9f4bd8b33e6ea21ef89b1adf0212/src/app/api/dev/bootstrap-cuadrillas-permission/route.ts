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

    await createPermission(
      {
        id: "CUADRILLAS_MANAGE",
        nombre: "Gestionar Cuadrillas",
        descripcion: "CRUD de Cuadrillas (Instalaciones)",
        modulo: "CUADRILLAS",
      },
      uid
    );

    return NextResponse.json({ ok: true, id: "CUADRILLAS_MANAGE" });
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    if (msg === "PERMISSION_ALREADY_EXISTS") {
      return NextResponse.json({ ok: true, note: msg });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

