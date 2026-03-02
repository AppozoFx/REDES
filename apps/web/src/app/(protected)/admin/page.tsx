import { requireAdmin } from "@/core/auth/guards";
import { adminDb } from "@/lib/firebase/admin";
import { listUsuariosAccess } from "@/domain/usuarios/service";
import AdminDashboardClient from "./AdminDashboardClient";

export const dynamic = "force-dynamic";

function toMillis(v: any): number {
  if (!v) return 0;
  if (typeof v?.toMillis === "function") return Number(v.toMillis() || 0);
  if (typeof v?.toDate === "function") {
    const d = v.toDate();
    return d instanceof Date ? d.getTime() : 0;
  }
  if (v instanceof Date) return v.getTime();
  return 0;
}

function profileNameOf(profile: any, uid: string) {
  const displayName = String(profile?.displayName || "").trim();
  if (displayName) return displayName;
  const full = `${String(profile?.nombres || "").trim()} ${String(profile?.apellidos || "").trim()}`.trim();
  return full || uid;
}

function asIso(v: any): string | null {
  if (!v) return null;
  if (typeof v?.toDate === "function") {
    const d = v.toDate();
    return d instanceof Date ? d.toISOString() : null;
  }
  if (typeof v?.seconds === "number") return new Date(v.seconds * 1000).toISOString();
  if (typeof v?._seconds === "number") return new Date(v._seconds * 1000).toISOString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return v;
  return null;
}

function actionLabel(action: string) {
  const v = String(action || "").trim().toUpperCase();
  if (v === "USUARIO_CREATE") return "Usuario creado";
  if (v === "USUARIO_ACCESS_UPDATE") return "Acceso actualizado";
  if (v === "USUARIO_PERFIL_UPDATE") return "Perfil actualizado";
  if (v === "USUARIO_DISABLE") return "Usuario deshabilitado";
  if (v === "USUARIO_ENABLE") return "Usuario habilitado";
  return v || "Sin accion";
}

export default async function AdminHomePage() {
  await requireAdmin();

  const rows = await listUsuariosAccess(600);
  const uids = rows.map((r) => String(r.uid || "")).filter(Boolean);

  const profileRefs = uids.map((uid) => adminDb().collection("usuarios").doc(uid));
  const presenceRefs = uids.map((uid) => adminDb().collection("usuarios_presencia").doc(uid));
  const [profileSnaps, presenceSnaps] = await Promise.all([
    profileRefs.length ? adminDb().getAll(...profileRefs) : Promise.resolve([] as any[]),
    presenceRefs.length ? adminDb().getAll(...presenceRefs) : Promise.resolve([] as any[]),
  ]);

  const profileByUid = new Map<string, any>(profileSnaps.map((s: any) => [s.id, (s.data() as any) || {}]));
  const presenceByUid = new Map<string, any>(presenceSnaps.map((s: any) => [s.id, (s.data() as any) || {}]));
  const onlineGraceMs = 2 * 60 * 1000;
  const now = Date.now();

  const data = rows.map((r) => {
    const uid = String(r.uid || "");
    const profile = profileByUid.get(uid) || {};
    const presence = presenceByUid.get(uid) || {};
    const lastSeenMs = toMillis(presence?.lastSeenAt) || toMillis(presence?.updatedAt);
    const online = !!presence?.online && lastSeenMs > 0 && now - lastSeenMs <= onlineGraceMs;
    return {
      uid,
      nombre: profileNameOf(profile, uid),
      email: String(profile?.email || "").trim(),
      roles: Array.isArray(r.roles) ? r.roles : [],
      areas: Array.isArray(r.areas) ? r.areas : [],
      estadoAcceso: String(r.estadoAcceso || "HABILITADO"),
      online,
      lastSeenAt: lastSeenMs > 0 ? new Date(lastSeenMs).toISOString() : null,
    };
  });

  const auditSnap = await adminDb().collection("auditoria").orderBy("ts", "desc").limit(2000).get();
  const trackedActions = new Set([
    "USUARIO_CREATE",
    "USUARIO_ACCESS_UPDATE",
    "USUARIO_PERFIL_UPDATE",
    "USUARIO_DISABLE",
    "USUARIO_ENABLE",
  ]);
  const auditRows = auditSnap.docs
    .map((d) => d.data() as any)
    .filter((a) => trackedActions.has(String(a?.action || "").trim().toUpperCase()));

  const extraUids = new Set<string>();
  for (const a of auditRows) {
    const actorUid = String(a?.actorUid || "").trim();
    if (actorUid && !profileByUid.has(actorUid)) extraUids.add(actorUid);
    const targetUid = String(a?.target?.id || "").trim();
    if (targetUid && !profileByUid.has(targetUid)) extraUids.add(targetUid);
  }
  if (extraUids.size) {
    const extraRefs = Array.from(extraUids).map((uid) => adminDb().collection("usuarios").doc(uid));
    const extraSnaps = await adminDb().getAll(...extraRefs);
    for (const s of extraSnaps) profileByUid.set(s.id, (s.data() as any) || {});
  }

  const auditByUser = auditRows.reduce<Record<string, Array<{
    id: string;
    at: string | null;
    action: string;
    actorUid: string | null;
    actorNombre: string;
  }>>>((acc, a, idx) => {
    const targetUid = String(a?.target?.id || "").trim();
    if (!targetUid) return acc;
    const actorUid = String(a?.actorUid || "").trim();
    const actorProfile = actorUid ? profileByUid.get(actorUid) : null;
    const actorNombre = actorUid ? profileNameOf(actorProfile, actorUid) : "Sistema";
    const row = {
      id: `${targetUid}_${String(a?.action || "AUDIT")}_${idx}_${String(a?.ts?.seconds || "")}`,
      at: asIso(a?.ts),
      action: actionLabel(String(a?.action || "")),
      actorUid: actorUid || null,
      actorNombre,
    };
    if (!acc[targetUid]) acc[targetUid] = [];
    if (acc[targetUid].length < 30) acc[targetUid].push(row);
    return acc;
  }, {});

  return (
    <AdminDashboardClient
      rows={data}
      generatedAt={new Date().toISOString()}
      auditByUser={auditByUser}
    />
  );
}
