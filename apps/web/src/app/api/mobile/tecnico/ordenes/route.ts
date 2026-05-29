import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getMobileAuthContext } from "@/core/auth/mobile";
import { getTecnicoContext, listTecnicoOrders } from "@/core/auth/mobileTecnico";

function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

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

async function getLatestOrdersUpdateInfo() {
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

  if (!notifImport) return null;

  let byNombre = "";
  if (notifImport.createdBy) {
    const u = await db.collection("usuarios").doc(String(notifImport.createdBy)).get();
    if (u.exists) {
      const data = u.data() as any;
      byNombre = String(data?.displayName || `${data?.nombres || ""} ${data?.apellidos || ""}`.trim());
    }
  }

  return {
    at: tsToIso(notifImport.createdAt),
    byUid: String(notifImport.createdBy || ""),
    byNombre: byNombre || String(notifImport.createdBy || ""),
    sourceLabel: resolveSourceLabel({
      title: String(notifImport.title || ""),
      entityId: String(notifImport.entityId || ""),
    }),
  };
}

export async function GET(req: Request) {
  try {
    const mobile = await getMobileAuthContext(req);
    if (!mobile) {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const tecnico = await getTecnicoContext(mobile);
    const { searchParams } = new URL(req.url);
    const ymd = String(searchParams.get("ymd") || todayLimaYmd()).trim();
    const [items, updateInfo] = await Promise.all([
      listTecnicoOrders(tecnico.cuadrilla.id, ymd),
      getLatestOrdersUpdateInfo(),
    ]);

    return NextResponse.json({
      ok: true,
      ymd,
      cuadrilla: tecnico.cuadrilla,
      updateInfo,
      items,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || "ERROR") }, { status: 500 });
  }
}
