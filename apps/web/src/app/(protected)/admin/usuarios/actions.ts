"use server";

import { requireServerPermission } from "@/core/auth/require";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import {
  UserAccessUpdateSchema,
  UserCreateNonAdminSchema,
  UserDisableSchema,
  UserPerfilUpdateSchema,
} from "@/domain/usuarios/schema";
import { ymdToTimestamp } from "@/lib/dates";
import { addGlobalNotification } from "@/domain/notificaciones/service";
import { revalidatePath } from "next/cache";


function normalizeArray(values: FormDataEntryValue[] | null): string[] {
  if (!values) return [];
  return values.map((v) => String(v).trim()).filter(Boolean);
}

const stripUndefined = (obj: Record<string, any>) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

function mapAuthzError(e: unknown) {
  const msg = String((e as any)?.message ?? "ERROR");
  if (msg === "UNAUTHENTICATED") {
    return { ok: false as const, error: { formErrors: ["No autenticado."] } };
  }
  if (msg === "ACCESS_DISABLED") {
    return { ok: false as const, error: { formErrors: ["Acceso inhabilitado."] } };
  }
  if (msg === "FORBIDDEN") {
    return { ok: false as const, error: { formErrors: ["No tienes permisos para esta acción."] } };
  }
  return null;
}

/** Verifica que el uid exista en Firebase Auth (fuente de verdad). */
async function assertAuthUserExists(uid: string) {
  try {
    await adminAuth().getUser(uid);
  } catch {
    throw new Error("TARGET_NOT_FOUND");
  }
}

function mapTargetError(e: unknown) {
  const msg = String((e as any)?.message ?? "ERROR");
  if (msg === "TARGET_NOT_FOUND") {
    return { ok: false as const, error: { formErrors: ["El usuario objetivo no existe (uid inválido)."] } };
  }
  return null;
}

/** Lee el access actual (para reglas de negocio como "ADMIN no se deshabilita") */
async function getCurrentAccess(uid: string): Promise<any | null> {
  const snap = await adminDb().collection("usuarios_access").doc(uid).get();
  return snap.exists ? (snap.data() as any) : null;
}

export async function createUsuario(_prevState: any, formData: FormData) {

  let session: any;
  try {
    session = await requireServerPermission("USERS_CREATE");
  } catch (e) {
    return mapAuthzError(e) ?? { ok: false as const, error: { formErrors: ["ERROR"] } };
  }

  const parsed = UserCreateNonAdminSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),

    nombres: formData.get("nombres"),
    apellidos: formData.get("apellidos"),

    tipoDoc: formData.get("tipoDoc"),
    nroDoc: formData.get("nroDoc"),

    celular: formData.get("celular"),
    direccion: formData.get("direccion"),

    genero: formData.get("genero"),
    nacionalidad: formData.get("nacionalidad"),

    fIngreso: formData.get("fIngreso"),
    fNacimiento: formData.get("fNacimiento"),

    estadoPerfil: formData.get("estadoPerfil"),

    roles: normalizeArray(formData.getAll("roles")),
    areas: normalizeArray(formData.getAll("areas")),

    permissions: normalizeArray(formData.getAll("permissions")),

    sede: String(formData.get("sede") ?? "").trim() || undefined,
    cargo: String(formData.get("cargo") ?? "").trim() || undefined,
    cuadrillaId: String(formData.get("cuadrillaId") ?? "").trim() || undefined,
    supervisorUid: String(formData.get("supervisorUid") ?? "").trim() || undefined,
  });

  if (!parsed.success) return { ok: false as const, error: parsed.error.flatten() };

  // Hardening: rechazar si payload intenta asignar ADMIN
  if (((parsed.data.roles ?? []) as string[]).includes("ADMIN")) {
    return {
      ok: false as const,
      error: { formErrors: ["No se permite asignar el rol ADMIN desde esta operación."] },
    };
  }

  const displayName = `${parsed.data.nombres} ${parsed.data.apellidos}`.trim();
  const now = new Date();

  let user: { uid: string } | null = null;
  let stage: string = "start";

  try {
    // 1) Auth
    stage = "auth.createUser";
    user = await adminAuth().createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      displayName,
    });

    // 2) Firestore (batch)
    stage = "firestore.batch";
    const batch = adminDb().batch();

    const perfilRef = adminDb().collection("usuarios").doc(user.uid);
    batch.set(perfilRef, {
      uid: user.uid,
      email: parsed.data.email,

      nombres: parsed.data.nombres,
      apellidos: parsed.data.apellidos,
      displayName,

      tipoDoc: parsed.data.tipoDoc,
      nroDoc: parsed.data.nroDoc,

      celular: parsed.data.celular,
      direccion: parsed.data.direccion,

      genero: parsed.data.genero,
      nacionalidad: parsed.data.nacionalidad,

      fIngreso: ymdToTimestamp(parsed.data.fIngreso),
      fNacimiento: ymdToTimestamp(parsed.data.fNacimiento),

      estadoPerfil: parsed.data.estadoPerfil,

      ...(parsed.data.sede ? { sede: parsed.data.sede } : {}),
      ...(parsed.data.cargo ? { cargo: parsed.data.cargo } : {}),
      ...(parsed.data.cuadrillaId ? { cuadrillaId: parsed.data.cuadrillaId } : {}),
      ...(parsed.data.supervisorUid ? { supervisorUid: parsed.data.supervisorUid } : {}),

      audit: {
        createdAt: now,
        createdBy: session.uid,
        updatedAt: now,
        updatedBy: session.uid,
      },
    });

    const accessRef = adminDb().collection("usuarios_access").doc(user.uid);
    batch.set(accessRef, {
      roles: parsed.data.roles,
      areas: parsed.data.areas,
      estadoAcceso: "HABILITADO",
      permissions: parsed.data.permissions ?? [],
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

    stage = "firestore.commit";
    await batch.commit();

    // 3) Auditoría
    stage = "auditoria.add";
    await adminDb().collection("auditoria").add({
      action: "USUARIO_CREATE",
      actorUid: session.uid,
      meta: {
        email: parsed.data.email,
        roles: parsed.data.roles,
        areas: parsed.data.areas,
        tipoDoc: parsed.data.tipoDoc,
        nroDoc: parsed.data.nroDoc,
      },
      target: { collection: "usuarios_access", id: user.uid },
      ts: now,
    });

    await addGlobalNotification({
      title: "Usuario creado",
      message: displayName,
      type: "success",
      scope: "ALL",
      createdBy: session.uid,
      entityType: "USUARIO",
      entityId: user.uid,
      action: "CREATE",
      estado: "ACTIVO",
    });

    stage = "revalidate";
    revalidatePath("/admin/usuarios");
    return { ok: true as const, uid: user.uid };
  } catch (e) {
    const anyErr = e as any;
    const code = anyErr?.code || anyErr?.errorInfo?.code;
    const message = anyErr?.message || String(anyErr);
    const stack = anyErr?.stack;
    try {
      const projectId = ((): string | undefined => {
        try {
          const fs: any = adminDb();
          if (fs && typeof fs === "object" && "projectId" in fs) return fs.projectId as string;
        } catch {}
        try {
          const au: any = adminAuth();
          return au?.app?.options?.projectId as string | undefined;
        } catch {}
        return process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
      })();
      console.error("[createUsuario] ERROR", {
        stage,
        code,
        message,
        stack,
        authEmu: process.env.FIREBASE_AUTH_EMULATOR_HOST ? true : false,
        fsEmu: process.env.FIRESTORE_EMULATOR_HOST ? true : false,
        nodeEnv: process.env.NODE_ENV,
        projectId,
      });
    } catch {}
    // rollback auth si ya se creó
    if (user?.uid) {
      try {
        await adminAuth().deleteUser(user.uid);
      } catch {
        // no bloqueamos
      }
    }
    return {
      ok: false as const,
      error: {
        formErrors: [
          "No se pudo crear el usuario.",
          `stage=${stage}`,
          `reason=${(code ?? "unknown")}`,
        ],
      },
    };
  }
}

export async function updateUsuarioAccess(uid: string, formData: FormData) {
  let session: any;
  try {
    session = await requireServerPermission("USERS_EDIT");
  } catch (e) {
    return mapAuthzError(e) ?? { ok: false as const, error: { formErrors: ["ERROR"] } };
  }

  try {
    await assertAuthUserExists(uid);
  } catch (e) {
    return mapTargetError(e) ?? { ok: false as const, error: { formErrors: ["ERROR"] } };
  }

  const parsed = UserAccessUpdateSchema.safeParse({
    roles: normalizeArray(formData.getAll("roles")),
    areas: normalizeArray(formData.getAll("areas")),
    permissions: normalizeArray(formData.getAll("permissions")),
    estadoAcceso: formData.get("estadoAcceso"),
  });

  if (!parsed.success) return { ok: false as const, error: parsed.error.flatten() };

  // Safety: no puedes quitarte ADMIN a ti mismo
  if (uid === session.uid && !parsed.data.roles.includes("ADMIN")) {
    return {
      ok: false as const,
      error: { formErrors: ["No puedes quitarte el rol ADMIN a ti mismo."] },
    };
  }

  // Hardening: si actor no es admin y payload incluye ADMIN, rechazar
  if (!session.isAdmin && (parsed.data.roles ?? []).includes("ADMIN")) {
    return {
      ok: false as const,
      error: { formErrors: ["No tienes permisos para asignar el rol ADMIN."] },
    };
  }

  // 🔒 Regla opcional aplicada: no permitir inhabilitar a un ADMIN (target)
  // (Incluye el caso "ADMIN -> ADMIN" que pediste)
  const curAccess = await getCurrentAccess(uid);
  if (curAccess?.roles?.includes?.("ADMIN") && parsed.data.estadoAcceso === "INHABILITADO") {
    return {
      ok: false as const,
      error: { formErrors: ["No puedes inhabilitar el acceso de un ADMIN."] },
    };
  }

  const now = new Date();

  await adminDb().collection("usuarios_access").doc(uid).set(
    {
      roles: parsed.data.roles,
      areas: parsed.data.areas,
      permissions: parsed.data.permissions,
      estadoAcceso: parsed.data.estadoAcceso,
      audit: { updatedAt: now, updatedBy: session.uid },
    },
    { merge: true }
  );

  await adminDb().collection("auditoria").add({
    action: "USUARIO_ACCESS_UPDATE",
    actorUid: session.uid,
    meta: {
      roles: parsed.data.roles,
      areas: parsed.data.areas,
      permissions: parsed.data.permissions,
      estadoAcceso: parsed.data.estadoAcceso,
    },
    target: { collection: "usuarios_access", id: uid },
    ts: now,
  });

  await addGlobalNotification({
    title: "Acceso actualizado",
    message: `uid ${uid}`,
    type: "info",
    scope: "ALL",
    createdBy: session.uid,
    entityType: "USUARIO",
    entityId: uid,
    action: "UPDATE",
    estado: "ACTIVO",
  });

  revalidatePath("/admin/usuarios");
  revalidatePath(`/admin/usuarios/${uid}`);
  return { ok: true as const };
}

export async function disableUsuario(uid: string, formData: FormData) {
  let session: any;
  try {
    session = await requireServerPermission("USERS_DISABLE");
  } catch (e) {
    return mapAuthzError(e) ?? { ok: false as const, error: { formErrors: ["ERROR"] } };
  }

  try {
    await assertAuthUserExists(uid);
  } catch (e) {
    return mapTargetError(e) ?? { ok: false as const, error: { formErrors: ["ERROR"] } };
  }

  if (uid === session.uid) {
    return {
      ok: false as const,
      error: { formErrors: ["No puedes deshabilitar tu propio acceso."] },
    };
  }

  // 🔒 Regla opcional aplicada: no permitir inhabilitar a un ADMIN (target)
  const curAccess = await getCurrentAccess(uid);
  if (curAccess?.roles?.includes?.("ADMIN")) {
    return {
      ok: false as const,
      error: { formErrors: ["No puedes inhabilitar el acceso de un ADMIN."] },
    };
  }

  const parsed = UserDisableSchema.safeParse({
    motivoBaja: formData.get("motivoBaja"),
  });
  if (!parsed.success) return { ok: false as const, error: parsed.error.flatten() };

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

  await addGlobalNotification({
    title: "Usuario deshabilitado",
    message: `uid ${uid}`,
    type: "warn",
    scope: "ALL",
    createdBy: session.uid,
    entityType: "USUARIO",
    entityId: uid,
    action: "DISABLE",
    estado: "ACTIVO",
  });

  revalidatePath("/admin/usuarios");
  revalidatePath(`/admin/usuarios/${uid}`);
  return { ok: true as const };
}

export async function enableUsuario(uid: string) {
  let session: any;
  try {
    session = await requireServerPermission("USERS_ENABLE");
  } catch (e) {
    return mapAuthzError(e) ?? { ok: false as const, error: { formErrors: ["ERROR"] } };
  }

  try {
    await assertAuthUserExists(uid);
  } catch (e) {
    return mapTargetError(e) ?? { ok: false as const, error: { formErrors: ["ERROR"] } };
  }

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

  await addGlobalNotification({
    title: "Usuario habilitado",
    message: `uid ${uid}`,
    type: "success",
    scope: "ALL",
    createdBy: session.uid,
    entityType: "USUARIO",
    entityId: uid,
    action: "ENABLE",
    estado: "ACTIVO",
  });

  revalidatePath("/admin/usuarios");
  revalidatePath(`/admin/usuarios/${uid}`);
  return { ok: true as const };
}

export async function updateUsuarioPerfil(uid: string, formData: FormData) {
  let session: any;
  try {
    session = await requireServerPermission("USERS_EDIT");
  } catch (e) {
    return mapAuthzError(e) ?? { ok: false as const, error: { formErrors: ["ERROR"] } };
  }

  try {
    await assertAuthUserExists(uid);
  } catch (e) {
    return mapTargetError(e) ?? { ok: false as const, error: { formErrors: ["ERROR"] } };
  }

  const parsed = UserPerfilUpdateSchema.safeParse({
    nombres: String(formData.get("nombres") ?? "").trim() || undefined,
    apellidos: String(formData.get("apellidos") ?? "").trim() || undefined,
    tipoDoc: String(formData.get("tipoDoc") ?? "").trim() || undefined,
    nroDoc: String(formData.get("nroDoc") ?? "").trim() || undefined,
    celular: String(formData.get("celular") ?? "").trim() || undefined,
    direccion: String(formData.get("direccion") ?? "").trim() || undefined,
    genero: String(formData.get("genero") ?? "").trim() || undefined,
    nacionalidad: String(formData.get("nacionalidad") ?? "").trim() || undefined,
    fIngreso: String(formData.get("fIngreso") ?? "").trim() || undefined,
    fNacimiento: String(formData.get("fNacimiento") ?? "").trim() || undefined,
    estadoPerfil: String(formData.get("estadoPerfil") ?? "").trim() || undefined,

    sede: String(formData.get("sede") ?? "").trim() || undefined,
    cargo: String(formData.get("cargo") ?? "").trim() || undefined,
    cuadrillaId: String(formData.get("cuadrillaId") ?? "").trim() || undefined,
    supervisorUid: String(formData.get("supervisorUid") ?? "").trim() || undefined,
  });

  if (!parsed.success) return { ok: false as const, error: parsed.error.flatten() };

  const now = new Date();
  const patch: Record<string, any> = stripUndefined({ ...parsed.data });

  if (patch.fIngreso) patch.fIngreso = ymdToTimestamp(patch.fIngreso);
  if (patch.fNacimiento) patch.fNacimiento = ymdToTimestamp(patch.fNacimiento);

  if (patch.nombres !== undefined || patch.apellidos !== undefined) {
    const ref = await adminDb().collection("usuarios").doc(uid).get();
    const cur = ref.exists ? (ref.data() as any) : {};

    const nombres = patch.nombres ?? cur.nombres ?? "";
    const apellidos = patch.apellidos ?? cur.apellidos ?? "";
    patch.displayName = `${nombres} ${apellidos}`.trim();
  }

  await adminDb().collection("usuarios").doc(uid).set(
    {
      ...patch,
      audit: {
        updatedAt: now,
        updatedBy: session.uid,
      },
    },
    { merge: true }
  );

  await adminDb().collection("auditoria").add({
    action: "USUARIO_PERFIL_UPDATE",
    actorUid: session.uid,
    meta: { keys: Object.keys(patch) },
    target: { collection: "usuarios", id: uid },
    ts: now,
  });

  await addGlobalNotification({
    title: "Perfil actualizado",
    message: `uid ${uid}`,
    type: "info",
    scope: "ALL",
    createdBy: session.uid,
    entityType: "USUARIO",
    entityId: uid,
    action: "UPDATE",
    estado: "ACTIVO",
  });

  revalidatePath("/admin/usuarios");
  revalidatePath(`/admin/usuarios/${uid}`);
  return { ok: true as const };
}
