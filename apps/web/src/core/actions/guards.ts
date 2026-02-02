"use server";

import { adminAuth } from "@/lib/firebase/admin";
import { requireServerPermission } from "@/core/auth/require";

type ActionErrorShape = {
  formErrors: string[];
  fieldErrors?: Record<string, string[]>;
};

export type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: ActionErrorShape };

function toActionError(e: unknown): ActionErrorShape {
  const msg = String((e as any)?.message ?? "ERROR");

  // Mapeo simple de errores “controlados”
  if (msg === "UNAUTHENTICATED") return { formErrors: ["No autenticado."] };
  if (msg === "ACCESS_DISABLED") return { formErrors: ["Acceso inhabilitado."] };
  if (msg === "FORBIDDEN") return { formErrors: ["No tienes permisos para esta acción."] };

  return { formErrors: [msg] };
}

/** Wrapper estándar: permisos + try/catch uniforme */
export async function runAction<T>(
  permission: string,
  fn: (session: Awaited<ReturnType<typeof requireServerPermission>>) => Promise<T>
): Promise<ActionResult<T>> {
  try {
    const session = await requireServerPermission(permission);
    const data = await fn(session);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: toActionError(e) };
  }
}

/** Verifica existencia de usuario en Auth (fuente de verdad de uid) */
export async function assertAuthUserExists(uid: string) {
  try {
    await adminAuth().getUser(uid);
  } catch {
    throw new Error("TARGET_NOT_FOUND");
  }
}

/** Error message para target inexistente */
export function mapTargetNotFound(e: unknown): ActionErrorShape | null {
  const msg = String((e as any)?.message ?? "");
  if (msg === "TARGET_NOT_FOUND") {
    return { formErrors: ["El usuario objetivo no existe (uid inválido)."] };
  }
  return null;
}
