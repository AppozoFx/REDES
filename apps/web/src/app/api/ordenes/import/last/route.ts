import { NextResponse } from "next/server";
import { getServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { listBannerComunicadosForUser } from "@/domain/comunicados/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function tsToIso(v: any): string | null {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate().toISOString();
  if (typeof v?.seconds === "number") return new Date(v.seconds * 1000).toISOString();
  if (typeof v?._seconds === "number") return new Date(v._seconds * 1000).toISOString();
  return typeof v === "string" ? v : null;
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function resolveSourceLabel(input: { title?: string; entityId?: string }) {
  const title = normalizeText(input.title);
  const entityId = String(input.entityId || "");
  if (title.includes("SINCRONIZACION AUTOMATICA WINBO")) return "WinBo automatico";
  if (title.includes("IMPORTACION WINBO")) return "WinBo manual";
  if (entityId.startsWith("winbo-import:")) return "WinBo";
  if (title.includes("IMPORTACION DE ORDENES")) return "Manual";
  if (entityId.startsWith("import:")) return "Manual";
  return "Importacion";
}

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    if (session.access.estadoAcceso !== "HABILITADO") {
      return NextResponse.json({ ok: false, error: "ACCESS_DISABLED" }, { status: 403 });
    }

    const db = adminDb();
    const notifsSnap = await db.collection("notificaciones").orderBy("createdAt", "desc").limit(60).get();
    const notifImport = notifsSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .find((n) => {
        const title = normalizeText(n?.title);
        const entityType = normalizeText(n?.entityType);
        if (entityType !== "ORDENES") return false;
        return title.includes("IMPORT") || title.includes("WINBO");
      });

    let item = null as null | {
      at: string | null;
      byUid: string;
      byNombre: string;
      sourceLabel: string;
      title: string;
      message: string;
    };

    if (notifImport) {
      let importUserName = "";
      if (notifImport.createdBy) {
        const u = await db.collection("usuarios").doc(String(notifImport.createdBy)).get();
        if (u.exists) {
          const data = u.data() as any;
          importUserName = String(
            data?.displayName || `${data?.nombres || ""} ${data?.apellidos || ""}`.trim()
          );
        }
      }

      item = {
        at: tsToIso(notifImport.createdAt),
        byUid: String(notifImport.createdBy || ""),
        byNombre: importUserName || String(notifImport.createdBy || ""),
        sourceLabel: resolveSourceLabel({
          title: String(notifImport.title || ""),
          entityId: String(notifImport.entityId || ""),
        }),
        title: String(notifImport.title || ""),
        message: String(notifImport.message || ""),
      };
    }

    const comunicados = await listBannerComunicadosForUser(session);

    return NextResponse.json({
      ok: true,
      item,
      comunicados: comunicados.map((c: any) => ({
        id: String(c?.id || ""),
        titulo: String(c?.titulo || ""),
        cuerpo: String(c?.cuerpo || ""),
        linkUrl: String(c?.linkUrl || ""),
        linkLabel: String(c?.linkLabel || ""),
        prioridad: typeof c?.prioridad === "number" ? c.prioridad : 100,
        autoType: String(c?.autoType || ""),
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
