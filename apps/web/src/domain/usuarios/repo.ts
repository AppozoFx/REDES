import { adminDb } from "@/lib/firebase/admin";
import { listUsuariosAccess } from "@/domain/usuarios/service";
import type { UserOperativePerfilUpdateInput, UserSelfUpdateInput } from "./schema";

export async function getUsuarioProfileByUid(uid: string) {
  const ref = adminDb().collection("usuarios").doc(uid);
  const snap = await ref.get();
  return snap.exists ? (snap.data() as any) : null;
}

/**
 * Listado combinado: usuarios_access + perfil (batch)
 * Devuelve filas listas para tabla.
 */
export async function listUsuariosForHome(limit?: number) {
  const accessRows = await listUsuariosAccess();
  const profileSnap = await adminDb().collection("usuarios").get();

  const profileByUid = new Map(profileSnap.docs.map((d) => [d.id, (d.data() as any) ?? {}]));
  const accessByUid = new Map(accessRows.map((a) => [a.uid, a]));

  const toMs = (v: unknown): number => {
    if (!v) return 0;
    if (typeof (v as any)?.toMillis === "function") return Number((v as any).toMillis()) || 0;
    if (v instanceof Date) return v.getTime();
    if (typeof v === "number") return v;
    const parsed = Date.parse(String(v));
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const uids = Array.from(new Set<string>([...accessByUid.keys(), ...profileByUid.keys()]));

  const rows = uids.map((uid) => {
    const a = accessByUid.get(uid) ?? ({} as any);
    const p = profileByUid.get(uid) ?? {};
    return {
      uid,
      roles: Array.isArray(a.roles) ? a.roles : [],
      areas: Array.isArray(a.areas) ? a.areas : [],
      estadoAcceso: a.estadoAcceso ?? "INHABILITADO",
      permissions: Array.isArray(a.permissions) ? a.permissions : [],
      nombres: p.nombres ?? "",
      apellidos: p.apellidos ?? "",
      celular: p.celular ?? "",
      direccion: p.direccion ?? "",
      fIngreso: p.fIngreso ?? null,
      fNacimiento: p.fNacimiento ?? null,
      audit: p.audit ?? {},
      _sortMs: Math.max(toMs((a as any)?.audit?.createdAt), toMs((p as any)?.audit?.createdAt)),
    };
  });

  rows.sort((x, y) => (y as any)._sortMs - (x as any)._sortMs);
  const trimmed = typeof limit === "number" && Number.isFinite(limit) && limit > 0 ? rows.slice(0, limit) : rows;
  return trimmed.map(({ _sortMs, ...row }: any) => row);
}

export async function updateUsuarioSelfProfile(
  uid: string,
  patch: UserSelfUpdateInput,
  actorUid: string
) {
  const ref = adminDb().collection("usuarios").doc(uid);

  const clean: any = {};
  if ("celular" in patch) clean.celular = patch.celular ?? "";
  if ("direccion" in patch) clean.direccion = patch.direccion ?? "";
  if ("fNacimiento" in patch) {
    const raw = String((patch as any).fNacimiento ?? "").trim();
    if (raw) {
      const [y, m, d] = raw.split("-").map((n) => Number(n));
      clean.fNacimiento = new Date(y, m - 1, d, 0, 0, 0, 0);
    }
  }
  if ("tipoDoc" in patch) {
    const tipoDoc = String((patch as any).tipoDoc ?? "").trim();
    if (tipoDoc) clean.tipoDoc = tipoDoc;
  }
  if ("nroDoc" in patch) {
    const nroDoc = String((patch as any).nroDoc ?? "").trim();
    if (nroDoc) clean.nroDoc = nroDoc;
  }

  clean["audit.updatedAt"] = new Date();
  clean["audit.updatedBy"] = actorUid;

  await ref.set(clean, { merge: true });
}

export async function listUsuariosProfiles(limit = 50) {
  const snap = await adminDb()
    .collection("usuarios")
    .orderBy("audit.createdAt", "desc")
    .limit(limit)
    .get();

  return snap.docs.map((d) => ({ uid: d.id, ...(d.data() as any) }));
}

/**
 * Update operativo (RRHH) sobre perfil, sin tocar RBAC
 */
export async function updateUsuarioOperativeProfile(
  targetUid: string,
  patch: UserOperativePerfilUpdateInput,
  actorUid: string
) {
  const ref = adminDb().collection("usuarios").doc(targetUid);

  const clean: any = {
    nombres: patch.nombres,
    apellidos: patch.apellidos,
    celular: patch.celular,
    direccion: patch.direccion,
    "audit.updatedAt": new Date(),
    "audit.updatedBy": actorUid,
  };

  await ref.set(clean, { merge: true });
}
