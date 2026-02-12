import { adminDb } from "@/lib/firebase/admin";
import { listUsuariosAccess } from "@/domain/usuarios/service";
import type { UserSelfUpdateInput, UserOperativePerfilUpdateInput } from "./schema";



export async function getUsuarioProfileByUid(uid: string) {
  const ref = adminDb().collection("usuarios").doc(uid);
  const snap = await ref.get();
  return snap.exists ? (snap.data() as any) : null;
}

/**
 * Listado combinado: usuarios_access + perfil (batch)
 * Devuelve filas listas para tabla.
 */
export async function listUsuariosForHome(limit = 50) {
  const accessRows = await listUsuariosAccess(limit);

  const refs = accessRows.map((r) => adminDb().collection("usuarios").doc(r.uid));
  const snaps = refs.length ? await adminDb().getAll(...refs) : [];
  const profileByUid = new Map(snaps.map((s) => [s.id, s.data() as any]));

  return accessRows.map((a) => {
    const p = profileByUid.get(a.uid) ?? {};
    return {
      uid: a.uid,
      roles: a.roles ?? [],
      areas: a.areas ?? [],
      estadoAcceso: a.estadoAcceso ?? "INHABILITADO",
      permissions: a.permissions ?? [],

      nombres: p.nombres ?? "",
      apellidos: p.apellidos ?? "",
      celular: p.celular ?? "",
      direccion: p.direccion ?? "",

      // timestamps
      fIngreso: p.fIngreso ?? null,
      fNacimiento: p.fNacimiento ?? null,

      audit: p.audit ?? {},
    };
  });
}

export async function updateUsuarioSelfProfile(
  uid: string,
patch: UserSelfUpdateInput,
  actorUid: string
) {
  const ref = adminDb().collection("usuarios").doc(uid);

  // normaliza strings vacíos a "" (o null si prefieres)
  const clean: any = {};
  if ("celular" in patch) clean.celular = patch.celular ?? "";
  if ("direccion" in patch) clean.direccion = patch.direccion ?? "";

  // auditoría server-only
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
