import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import {
  requireAreaScope,
  requireOwnershipIfNeeded,
} from "@/core/auth/apiGuards";

export const runtime = "nodejs";

function normalizePhone(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  const noPrefix = digits.startsWith("51") && digits.length >= 11 ? digits.slice(2) : digits;
  return noPrefix.length >= 9 ? noPrefix : "";
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession({ forceAccessRefresh: true });
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const raw = searchParams.get("uids") || "";
    const uids = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (!uids.length) return NextResponse.json({ ok: true, items: [] });

    const requestingForeignUid = uids.some((uid) => uid !== session.uid);
    if (requestingForeignUid) {
      requireOwnershipIfNeeded(session, "", {
        allowSelf: false,
        permissions: [
          "USERS_LIST",
          "ORDENES_LIQUIDAR",
          "CUADRILLAS_MANAGE",
          "MATERIALES_TRANSFER_SERVICIO",
          "MATERIALES_DEVOLUCION",
          "EQUIPOS_DESPACHO",
          "EQUIPOS_DEVOLUCION",
        ],
      });
      // Restriccion de ambito para lecturas de terceros.
      requireAreaScope(session, ["INSTALACIONES", "MANTENIMIENTO"]);
    }

    const refs = uids.map((uid) => adminDb().collection("usuarios").doc(uid));
    const snaps = await adminDb().getAll(...refs);
    const items = snaps.map((s) => {
      const data = s.data() as any;
      const celular = normalizePhone(String(data?.celular || ""));
      return { uid: s.id, celular };
    });

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (msg === "ACCESS_DISABLED") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }
    if (msg === "FORBIDDEN" || msg === "AREA_FORBIDDEN") {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
