import { adminDb } from "@/lib/firebase/admin";

export type AsignacionData = {
  base: Record<string, string[]>;
  day: Record<string, string[]>;
  topBase: string[];
  topDay: string[] | null;
};

export function todayLimaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function getAsignacionData(ymd: string): Promise<AsignacionData> {
  const db = adminDb();
  const [baseSnap, daySnap, baseTopSnap] = await Promise.all([
    db.collection("asignacion_gestores_base").doc("base").get(),
    db.collection("asignacion_gestores_dia").doc(ymd).get(),
    db.collection("asignacion_gestores_config").doc("base").get(),
  ]);
  const base = (baseSnap.data() as any)?.gestoresMap || {};
  const day = (daySnap.data() as any)?.gestoresMap || {};
  const topBase = (baseTopSnap.data() as any)?.topGestores || [];
  const topDay = (daySnap.data() as any)?.topGestores ?? null;
  return { base, day, topBase, topDay };
}

export function resolveGestorVisible(gestorUid: string, data: AsignacionData) {
  const topDay = Array.isArray(data.topDay) ? data.topDay : null;
  const topList = topDay ?? data.topBase ?? [];
  const isTop = topList.includes(gestorUid);
  if (isTop) return { all: true, ids: [] as string[] };

  const dayMap = data.day || {};
  if (Object.keys(dayMap).length && Array.isArray(dayMap[gestorUid])) {
    return { all: false, ids: dayMap[gestorUid] || [] };
  }
  const baseMap = data.base || {};
  return { all: false, ids: baseMap[gestorUid] || [] };
}

export async function buildBaseFromCuadrillas() {
  const db = adminDb();
  const snap = await db.collection("cuadrillas").where("area", "==", "INSTALACIONES").get();
  const map: Record<string, string[]> = {};
  snap.docs.forEach((d) => {
    const data = d.data() as any;
    const gestorUid = String(data?.gestorUid || "").trim();
    if (!gestorUid) return;
    if (!map[gestorUid]) map[gestorUid] = [];
    map[gestorUid].push(d.id);
  });
  return map;
}
