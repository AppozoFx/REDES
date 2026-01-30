"use server";

import { requireAdmin } from "@/core/auth/guards";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import {
  UserAccessUpdateSchema,
  UserCreateSchema,
  UserDisableSchema,
} from "@/domain/usuarios/schema";
import { revalidatePath } from "next/cache";

function normalizeArray(values: FormDataEntryValue[] | null): string[] {
  if (!values) return [];
  return values
    .map((v) => String(v).trim())
    .filter(Boolean);
}

export async function createUsuario(formData: FormData) {
  const session = await requireAdmin();

  const parsed = UserCreateSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
    roles: normalizeArray(formData.getAll("roles")),
    areas: normalizeArray(formData.getAll("areas")),
  });

  if (!parsed.success) return { ok: false, error: parsed.error.flatten() };

  const now = new Date();

  // 1) Auth user
  const user = await adminAuth().createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    displayName: parsed.data.displayName || undefined,
  });

  // 2) Firestore docs (perfil + acceso)
  await adminDb().collection("usuarios").doc(user.uid).set({
    uid: user.uid,
    email: parsed.data.email,
    displayName: parsed.data.displayName || "",
    estadoPerfil: "ACTIVO",
    audit: {
      createdAt: now,
      createdBy: session.uid,
      updatedAt: now,
      updatedBy: session.uid,
    },
  });

  await adminDb().collection("usuarios_access").doc(user.uid).set({
    roles: parsed.data.roles,
    areas: parsed.data.areas,
    estadoAcceso: "HABILITADO",
    permissions: [],
    audit: {
      createdAt: now,
      createdBy: session.uid,
      updatedAt: now,
      updatedBy: session.uid,
      deletedAt: null,
      deletedBy: null,
      motivoBaja: null,
    },
  });

  // 3) Auditoría (backend-only)
  await adminDb().collection("auditoria").add({
    action: "USUARIO_CREATE",
    actorUid: session.uid,
    meta: {
      email: parsed.data.email,
      roles: parsed.data.roles,
      areas: parsed.data.areas,
    },
    target: { collection: "usuarios_access", id: user.uid },
    ts: now,
  });

  revalidatePath("/admin/usuarios");
  return { ok: true, uid: user.uid };
}

export async function updateUsuarioAccess(uid: string, formData: FormData) {
  const session = await requireAdmin();

  const parsed = UserAccessUpdateSchema.safeParse({
    roles: normalizeArray(formData.getAll("roles")),
    areas: normalizeArray(formData.getAll("areas")),
    estadoAcceso: formData.get("estadoAcceso"),
  });

  if (!parsed.success) return { ok: false, error: parsed.error.flatten() };

  // ✅ Safety: no puedes quitarte ADMIN a ti mismo
if (uid === session.uid && !parsed.data.roles.includes("ADMIN")) {
  return {
    ok: false,
    error: { formErrors: ["No puedes quitarte el rol ADMIN a ti mismo."] },
  };
}


  const now = new Date();

  await adminDb().collection("usuarios_access").doc(uid).set(
    {
      roles: parsed.data.roles,
      areas: parsed.data.areas,
      estadoAcceso: parsed.data.estadoAcceso,
      audit: {
        updatedAt: now,
        updatedBy: session.uid,
      },
    },
    { merge: true }
  );

  await adminDb().collection("auditoria").add({
    action: "USUARIO_ACCESS_UPDATE",
    actorUid: session.uid,
    meta: parsed.data,
    target: { collection: "usuarios_access", id: uid },
    ts: now,
  });

  revalidatePath("/admin/usuarios");
  revalidatePath(`/admin/usuarios/${uid}`);
  return { ok: true };
}

export async function disableUsuario(uid: string, formData: FormData) {
  const session = await requireAdmin();


  // ✅ Safety: no puedes deshabilitarte a ti mismo
if (uid === session.uid) {
  return {
    ok: false,
    error: { formErrors: ["No puedes deshabilitar tu propio acceso."] },
  };
}


  const parsed = UserDisableSchema.safeParse({
    motivoBaja: formData.get("motivoBaja"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.flatten() };

  const now = new Date();

  await adminDb().collection("usuarios_access").doc(uid).set(
    {
      estadoAcceso: "INHABILITADO",
      audit: {
        deletedAt: now,
        deletedBy: session.uid,
        motivoBaja: parsed.data.motivoBaja,
        updatedAt: now,
        updatedBy: session.uid,
      },
    },
    { merge: true }
  );

  await adminDb().collection("auditoria").add({
    action: "USUARIO_DISABLE",
    actorUid: session.uid,
    meta: { motivoBaja: parsed.data.motivoBaja },
    target: { collection: "usuarios_access", id: uid },
    ts: now,
  });

  revalidatePath("/admin/usuarios");
  revalidatePath(`/admin/usuarios/${uid}`);
  return { ok: true };
}

export async function enableUsuario(uid: string) {
  const session = await requireAdmin();
  const now = new Date();

  await adminDb().collection("usuarios_access").doc(uid).set(
    {
      estadoAcceso: "HABILITADO",
      audit: {
        deletedAt: null,
        deletedBy: null,
        motivoBaja: null,
        updatedAt: now,
        updatedBy: session.uid,
      },
    },
    { merge: true }
  );

  await adminDb().collection("auditoria").add({
    action: "USUARIO_ENABLE",
    actorUid: session.uid,
    meta: {},
    target: { collection: "usuarios_access", id: uid },
    ts: now,
  });

  revalidatePath("/admin/usuarios");
  revalidatePath(`/admin/usuarios/${uid}`);
  return { ok: true };
}


