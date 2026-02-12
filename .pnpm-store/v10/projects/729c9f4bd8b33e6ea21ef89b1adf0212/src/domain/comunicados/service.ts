import type { ServerSession } from "@/core/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { listComunicados } from "./repo";

/** Convierte Timestamp/Date a Date o null */
function toDate(x: any): Date | null {
  if (!x) return null;
  if (x instanceof Date) return x;
  if (typeof x?.toDate === "function") return x.toDate();
  return null;
}

function nowInRange(now: Date, desde?: any, hasta?: any) {
  const d = toDate(desde);
  const h = toDate(hasta);

  if (d && now < d) return false;
  if (h && now > h) return false;
  return true;
}

function intersects(a: string[], b: string[]) {
  const set = new Set(a);
  return b.some((x) => set.has(x));
}

function appliesToUser(c: any, session: ServerSession) {
  if ((c?.estado ?? "INACTIVO") !== "ACTIVO") return false;
  if (!nowInRange(new Date(), c?.visibleDesde, c?.visibleHasta)) return false;

  const target = c?.target ?? "ALL";
  if (target === "ALL") return true;

  if (target === "ROLES")
    return intersects(session.access.roles ?? [], c?.rolesTarget ?? []);
  if (target === "AREAS")
    return intersects(session.access.areas ?? [], c?.areasTarget ?? []);
  if (target === "USERS")
    return Array.isArray(c?.uidsTarget) ? c.uidsTarget.includes(session.uid) : false;

  return false;
}

/**
 * Map de "visto" por comunicado:
 * usuarios_access/{uid}/comunicados_reads/{comunicadoId}
 */
export async function getSeenMap(uid: string, comunicadoIds: string[]) {
  const ids = (comunicadoIds ?? [])
    .map((x) => String(x).trim())
    .filter(Boolean);

  if (!ids.length) return new Map<string, boolean>();

  const db = adminDb();
  const refs = ids.map((id) =>
    db
      .collection("usuarios_access")
      .doc(uid)
      .collection("comunicados_reads")
      .doc(id)
  );

  const snaps = await db.getAll(...refs);

  const map = new Map<string, boolean>();
  for (const s of snaps) map.set(s.id, s.exists);
  return map;
}

function getPersistencia(c: any): "ONCE" | "ALWAYS" {
  const p = String(c?.persistencia ?? "ONCE").toUpperCase();
  return p === "ALWAYS" ? "ALWAYS" : "ONCE";
}

/**
 * ✅ ESTA ES LA FUNCIÓN QUE /home NECESITA IMPORTAR
 * Devuelve comunicados aplicables al usuario:
 * - persistencia=ONCE  -> solo si NO está visto
 * - persistencia=ALWAYS -> siempre (aunque esté visto)
 */
export async function listPendingComunicadosForUser(session: ServerSession) {
  // Trae últimos N y filtra server-side
  const all = await listComunicados(80);
  try {
    console.log("[comunicados] session", {
      uid: session.uid,
      roles: session.access?.roles,
      areas: session.access?.areas,
    });
    console.log("[comunicados] all.count", all.length);
    for (const c of all.slice(0, 5)) {
      console.log("[comunicados] item", {
        id: c?.id,
        estado: c?.estado,
        target: c?.target,
        rolesTarget: c?.rolesTarget,
        areasTarget: c?.areasTarget,
        uidsTarget: c?.uidsTarget,
        visibleDesde: c?.visibleDesde,
        visibleHasta: c?.visibleHasta,
        persistencia: c?.persistencia,
        obligatorio: c?.obligatorio,
      });
    }
  } catch {}
  const applicable = all.filter((c: any) => appliesToUser(c, session));

  // Orden: prioridad asc, createdAt desc
  applicable.sort((a: any, b: any) => {
    const pa = typeof a?.prioridad === "number" ? a.prioridad : 100;
    const pb = typeof b?.prioridad === "number" ? b.prioridad : 100;
    if (pa !== pb) return pa - pb;

    const at = toDate(a?.audit?.createdAt)?.getTime() ?? 0;
    const bt = toDate(b?.audit?.createdAt)?.getTime() ?? 0;
    return bt - at;
  });

  // Solo necesitamos "seen" para los ONCE
  const onceIds = applicable
    .filter((c: any) => getPersistencia(c) === "ONCE")
    .map((c: any) => String(c?.id ?? "").trim())
    .filter(Boolean);

  const seen = await getSeenMap(session.uid, onceIds);
  try {
    console.log(
      "[comunicados] applicable.once.count",
      onceIds.length,
      "seen.count",
      Array.from(seen.values()).filter(Boolean).length
    );
  } catch {}

  const pending = applicable.filter((c: any) => {
    const id = String(c?.id ?? "").trim();
    if (!id) return false;

    const persist = getPersistencia(c);

    // ALWAYS: se muestra siempre
    if (persist === "ALWAYS") return true;

    // ONCE: solo si NO está visto
    return !seen.get(id);
  });

  try {
    console.log("[comunicados] pending.count", pending.length);
  } catch {}
  return pending;
}

/**
 * Marca como visto.
 * - Para ALWAYS, puedes seguir marcando como visto si te sirve para analítica,
 *   pero NO afectará a la visibilidad gracias al filtro de arriba.
 */
export async function markComunicadoSeen(uid: string, comunicadoId: string) {
  const id = String(comunicadoId ?? "").trim();
  if (!id) return;

  const db = adminDb();
  const now = new Date();

  await db
    .collection("usuarios_access")
    .doc(uid)
    .collection("comunicados_reads")
    .doc(id)
    .set(
      {
        seenAt: now,
        seenByUid: uid,
      },
      { merge: true }
    );
}
