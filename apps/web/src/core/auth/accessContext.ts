import { adminDb } from "@/lib/firebase/admin";
import { getRolesByIds } from "@/domain/roles/repo";

export type EstadoAcceso = "HABILITADO" | "INHABILITADO";

export type AccessContext = {
  uid: string;
  roles: string[];
  areas: string[];
  directPermissions: string[]; // usuarios_access.permissions
  rolePermissions: string[];   // suma de roles/{id}.permissions
  effectivePermissions: string[];
  estadoAcceso: EstadoAcceso;
};

function uniqStrings(arr: string[]) {
  return Array.from(new Set(arr.map((x) => String(x).trim()).filter(Boolean)));
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}

export async function getUserAccessContext(uid: string): Promise<AccessContext | null> {
  let snap;
  try {
    snap = await adminDb().collection("usuarios_access").doc(uid).get();
  } catch (e: any) {
    try {
      // eslint-disable-next-line no-console
      console.error("[access] usuarios_access read failed", {
        uid,
        message: String(e?.message || e || "ERROR"),
        code: String(e?.code || ""),
        stack: e?.stack,
      });
    } catch {}
    return null;
  }
  if (!snap.exists) return null;

  const data = snap.data() ?? {};

  const roles = asStringArray(data.roles);
  const areas = asStringArray(data.areas);
  const directPermissions = asStringArray(data.permissions);
  // Normaliza valores históricos: aceptar "ACTIVO" como habilitado
  const rawEstado = String(data.estadoAcceso ?? "").toUpperCase();
  const estadoAcceso: EstadoAcceso =
    rawEstado === "HABILITADO" || rawEstado === "ACTIVO"
      ? "HABILITADO"
      : "INHABILITADO";

  // permisos por roles (reusa tu repo)
  let rolesDocs: any[] = [];
  try {
    rolesDocs = await getRolesByIds(roles);
  } catch (e: any) {
    try {
      // eslint-disable-next-line no-console
      console.error("[access] getRolesByIds failed", {
        uid,
        message: String(e?.message || e || "ERROR"),
        code: String(e?.code || ""),
        stack: e?.stack,
      });
    } catch {}
    rolesDocs = [];
  }

  // opcional: ignorar roles inactivos si tu doc tiene `estado`
  const rolePermissions = rolesDocs.flatMap((r: any) => {
    if (r?.estado && r.estado !== "ACTIVO") return [];
    return Array.isArray(r?.permissions) ? r.permissions : [];
  });

  const effectivePermissions = uniqStrings([...rolePermissions, ...directPermissions]);

  return {
    uid,
    roles,
    areas,
    directPermissions,
    rolePermissions,
    effectivePermissions,
    estadoAcceso,
  };
}
