import { adminDb } from "@/lib/firebase/admin";

export type AsignacionSupervisoresZonasData = {
  day: Record<string, string[]>;
};

function normalizeMap(value: any): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  Object.entries((value || {}) as Record<string, any>).forEach(([uid, list]) => {
    const cleanUid = String(uid || "").trim();
    if (!cleanUid) return;
    out[cleanUid] = Array.from(
      new Set(
        (Array.isArray(list) ? list : [])
          .map((id) => String(id || "").trim())
          .filter(Boolean)
      )
    );
  });
  return out;
}

export function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function getAsignacionSupervisoresZonasData(ymd: string): Promise<AsignacionSupervisoresZonasData> {
  const db = adminDb();
  const snap = await db.collection("asignacion_supervisores_zona_dia").doc(ymd).get();

  return {
    day: normalizeMap((snap.data() as any)?.supervisoresMap),
  };
}

export function resolveSupervisorVisibleZona(supervisorUid: string, data: AsignacionSupervisoresZonasData) {
  const uid = String(supervisorUid || "").trim();
  const dayMap = data.day || {};
  return { ids: Array.isArray(dayMap[uid]) ? dayMap[uid] || [] : [] };
}
