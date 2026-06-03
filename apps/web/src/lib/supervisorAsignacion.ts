import { adminDb } from "@/lib/firebase/admin";

export type AsignacionSupervisoresData = {
  base: Record<string, string[]>;
  day: Record<string, string[]>;
};

export function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

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

export async function getAsignacionSupervisoresData(ymd: string): Promise<AsignacionSupervisoresData> {
  const db = adminDb();
  const [baseSnap, daySnap] = await Promise.all([
    db.collection("asignacion_supervisores_base").doc("base").get(),
    db.collection("asignacion_supervisores_dia").doc(ymd).get(),
  ]);

  return {
    base: normalizeMap((baseSnap.data() as any)?.supervisoresMap),
    day: normalizeMap((daySnap.data() as any)?.supervisoresMap),
  };
}

export function resolveSupervisorVisible(supervisorUid: string, data: AsignacionSupervisoresData) {
  const uid = String(supervisorUid || "").trim();
  const dayMap = data.day || {};
  if (Object.keys(dayMap).length && Array.isArray(dayMap[uid])) {
    return { ids: dayMap[uid] || [] };
  }
  const baseMap = data.base || {};
  return { ids: baseMap[uid] || [] };
}
