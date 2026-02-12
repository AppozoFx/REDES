import { adminDb } from "@/lib/firebase/admin";

export type RoleDoc = {
  id: string;
  nombre: string;
  descripcion?: string;
  estado: "ACTIVO" | "INACTIVO";

  permissions: string[]; // ✅ nuevo estándar
  areasDefault: string[];

  audit: any;
};

const col = () => adminDb().collection("roles");

function normalizeRole(id: string, data: any): RoleDoc {
  return {
    id,
    nombre: String(data?.nombre ?? ""),
    descripcion: data?.descripcion ? String(data.descripcion) : "",
    estado: data?.estado === "INACTIVO" ? "INACTIVO" : "ACTIVO",
    permissions: Array.isArray(data?.permissions) ? data.permissions : [],
    areasDefault: Array.isArray(data?.areasDefault) ? data.areasDefault : [],
    audit: data?.audit ?? {},
  };
}

export async function rolesList() {
  const snap = await col().orderBy("audit.createdAt", "desc").get();
  return snap.docs.map((d) => normalizeRole(d.id, d.data()));
}

export async function roleGet(id: string) {
  const doc = await col().doc(id).get();
  return doc.exists ? normalizeRole(doc.id, doc.data()) : null;
}

export async function roleCreate(input: RoleDoc) {
  await col().doc(input.id).set(input, { merge: false });
}

export async function roleUpdate(id: string, patch: Partial<RoleDoc>) {
  await col().doc(id).set(patch, { merge: true });
}

/**
 * ✅ Helper para sesión: leer múltiples roles por ids
 */
export async function getRolesByIds(ids: string[]) {
  const uniq = Array.from(new Set(ids)).filter(Boolean);
  if (uniq.length === 0) return [];

  const snaps = await Promise.all(uniq.map((id) => col().doc(id).get()));

  return snaps
    .filter((s) => s.exists)
    .map((s) => ({ id: s.id, ...(s.data() as any) }));
}

export async function listRoles(limit = 100) {
  const snap = await adminDb().collection("roles").orderBy("id").limit(limit).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}
